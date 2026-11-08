from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager
from dataclasses import replace
import importlib
from pathlib import Path
import socket
import sys
from types import SimpleNamespace

import pytest
from starlette.applications import Starlette
from starlette.routing import Mount
import uvicorn
from websockets.asyncio.client import connect
from websockets.asyncio.server import serve
from websockets.exceptions import ConnectionClosed, InvalidStatus


RELAY_DIR = str(Path(__file__).resolve().parents[2] / "apps" / "pocket-relay")
RELAY_MODULES = ("config", "pin", "tunnel", "qr", "main")


@pytest.fixture
def relay(tmp_path, monkeypatch):
    monkeypatch.setenv("POCKET_STATE_DIR", str(tmp_path))
    monkeypatch.setenv("POCKET_RPC_SECRET", "offline-websocket-tests")
    monkeypatch.setenv("POCKET_AUTO_START_PUBLIC", "false")
    monkeypatch.syspath_prepend(RELAY_DIR)
    previous = {name: sys.modules[name] for name in RELAY_MODULES if name in sys.modules}
    for name in RELAY_MODULES:
        sys.modules.pop(name, None)
    try:
        yield importlib.import_module("main")
    finally:
        for name in RELAY_MODULES:
            sys.modules.pop(name, None)
        sys.modules.update(previous)


async def eventually(predicate, message, *, timeout=1):
    async with asyncio.timeout(timeout):
        while not predicate():
            await asyncio.sleep(0.005)
    assert predicate(), message


@asynccontextmanager
async def servers(relay, handler, *, mount="", reject=False):
    state = SimpleNamespace(paths=[], connected=asyncio.Event(), closed=asyncio.Event())

    async def upstream_handler(connection):
        state.paths.append(connection.request.path)
        state.connected.set()
        try:
            await handler(connection)
        finally:
            state.closed.set()

    async def reject_handshake(connection, request):
        return connection.respond(503, "offline upstream unavailable")

    async with serve(
        upstream_handler, "127.0.0.1", 0, close_timeout=0.2,
        process_request=reject_handshake if reject else None,
    ) as upstream:
        port = upstream.sockets[0].getsockname()[1]
        original = relay.settings
        relay.settings = replace(original, web_target=f"http://127.0.0.1:{port}/base%20dir/root")
        listener = socket.socket()
        listener.bind(("127.0.0.1", 0))
        listener.listen(128)
        app = Starlette(routes=[Mount(mount, app=relay.app)]) if mount else relay.app
        server = uvicorn.Server(uvicorn.Config(
            app, log_level="critical", lifespan="off", timeout_graceful_shutdown=0.5,
        ))
        task = asyncio.create_task(server.serve(sockets=[listener]))
        try:
            await eventually(lambda: server.started, "local Relay didn't start", timeout=5)
            state.uri = f"ws://127.0.0.1:{listener.getsockname()[1]}"
            state.server = server
            yield state
        finally:
            # Close the local peer first so even the original leaked gather can
            # finish after a failing assertion; no test leaves pending sockets.
            upstream.close()
            await upstream.wait_closed()
            server.should_exit = True
            try:
                await asyncio.wait_for(task, 3)
            finally:
                if not task.done():
                    task.cancel()
                    await asyncio.gather(task, return_exceptions=True)
                listener.close()
                relay.settings = original


async def echo(connection):
    await connection.send("upstream-ready")
    async for message in connection:
        await connection.send(message)


def uri(state, relay, path="/events", query=""):
    suffix = f"&{query}" if query else ""
    return f"{state.uri}{path}?pin={relay.get_lan_pin()}{suffix}"


def test_websocket_exchanges_unsolicited_and_bidirectional_text_and_binary(relay):
    async def handler(connection):
        await connection.send("upstream-ready")
        await connection.send(b"\x00upstream-binary")
        async for message in connection:
            await connection.send(message)

    async def scenario():
        async with servers(relay, handler) as state:
            async with connect(uri(state, relay), proxy=None, close_timeout=0.2) as client:
                assert await client.recv() == "upstream-ready"
                assert await client.recv() == b"\x00upstream-binary"
                await client.send("downstream-text")
                assert await client.recv() == "downstream-text"
                await client.send(b"\x01downstream-binary")
                assert await client.recv() == b"\x01downstream-binary"

    asyncio.run(scenario())


def test_downstream_close_releases_upstream_and_relay_handler(relay):
    async def scenario():
        async with servers(relay, echo) as state:
            async with connect(uri(state, relay), proxy=None, close_timeout=0.2) as client:
                assert await client.recv() == "upstream-ready"
            await asyncio.wait_for(state.closed.wait(), 1)
            await eventually(lambda: not state.server.server_state.tasks, "Relay handler remained active")

    asyncio.run(scenario())


@pytest.mark.parametrize("close_code,expected_code", [(1000, 1000), (1001, 1001), (None, 1000)])
def test_upstream_normal_close_releases_downstream_and_relay_handler(relay, close_code, expected_code):
    async def handler(connection):
        await connection.send("upstream-ready")
        await connection.close(code=close_code)

    async def scenario():
        async with servers(relay, handler) as state:
            async with connect(uri(state, relay), proxy=None, close_timeout=0.2) as client:
                assert await client.recv() == "upstream-ready"
                with pytest.raises(ConnectionClosed) as closed:
                    await asyncio.wait_for(client.recv(), 1)
                assert closed.value.rcvd.code == expected_code
            await eventually(lambda: not state.server.server_state.tasks, "Relay handler remained active")

    asyncio.run(scenario())


def test_upstream_abnormal_close_preserves_internal_error_policy_and_cleanup(relay):
    async def handler(connection):
        await connection.send("upstream-ready")
        await connection.close(code=1011)

    async def scenario():
        async with servers(relay, handler) as state:
            async with connect(uri(state, relay), proxy=None, close_timeout=0.2) as client:
                assert await client.recv() == "upstream-ready"
                with pytest.raises(ConnectionClosed) as closed:
                    await asyncio.wait_for(client.recv(), 1)
                assert closed.value.rcvd.code == 1011
            await asyncio.wait_for(state.closed.wait(), 1)
            await eventually(lambda: not state.server.server_state.tasks, "Relay handler remained active")

    asyncio.run(scenario())


def test_failed_upstream_handshake_closes_accepted_client_with_internal_error(relay):
    async def scenario():
        async with servers(relay, echo, reject=True) as state:
            async with connect(uri(state, relay), proxy=None, close_timeout=0.2) as client:
                with pytest.raises(ConnectionClosed) as closed:
                    await asyncio.wait_for(client.recv(), 1)
                assert closed.value.rcvd.code == 1011
            assert state.paths == []
            await eventually(lambda: not state.server.server_state.tasks, "Relay handler remained active")

    asyncio.run(scenario())


def test_cancelled_relay_handler_joins_forwarders_and_closes_upstream(relay):
    async def scenario():
        async with servers(relay, echo) as state:
            async with connect(uri(state, relay), proxy=None, close_timeout=0.2) as client:
                assert await client.recv() == "upstream-ready"
                tasks = list(state.server.server_state.tasks)
                assert len(tasks) == 1
                tasks[0].cancel()
                await asyncio.wait_for(asyncio.gather(*tasks, return_exceptions=True), 1)
                await asyncio.wait_for(state.closed.wait(), 1)
            await eventually(lambda: not state.server.server_state.tasks, "Relay handler remained active")

    asyncio.run(scenario())


@pytest.mark.parametrize("query,headers", [
    ("", {}), ("?pin=wrong", {}), ("", {"cookie": "pg_pocket=invalid"}),
])
def test_missing_or_invalid_pin_does_not_connect_upstream(relay, query, headers):
    async def scenario():
        async with servers(relay, echo) as state:
            with pytest.raises(InvalidStatus) as rejected:
                async with connect(f"{state.uri}/events{query}", additional_headers=headers, proxy=None, close_timeout=0.2):
                    pytest.fail("unauthenticated websocket was accepted")
            assert rejected.value.response.status_code == 403
            assert state.paths == []
            assert not state.connected.is_set()

    asyncio.run(scenario())


def test_existing_pin_session_cookie_still_authorizes_websocket(relay):
    async def scenario():
        async with servers(relay, echo) as state:
            headers = {"cookie": f"{relay.COOKIE_NAME}={relay._cookie_value('lan')}"}
            async with connect(f"{state.uri}/events", additional_headers=headers, proxy=None, close_timeout=0.2) as client:
                assert await client.recv() == "upstream-ready"

    asyncio.run(scenario())


@pytest.mark.parametrize("path", [
    "/events", "/reports/a%3Fb%23c%252Fd", "/assets/a%2Fb", "/literal%25value", "/unicode/%E4%B8%AD",
])
def test_websocket_keeps_base_path_raw_encoding_and_query_bytes(relay, path):
    async def scenario():
        async with servers(relay, echo) as state:
            query = "cursor=a%2fb%20c&tag=one&tag=two"
            async with connect(uri(state, relay, path, query), proxy=None, close_timeout=0.2) as client:
                assert await client.recv() == "upstream-ready"
            assert state.paths == [f"/base%20dir/root{path}?pin={relay.get_lan_pin()}&{query}"]

    asyncio.run(scenario())


@pytest.mark.parametrize("mount,path", [("/pocket", "/pocket/events%2Fone"), ("/口袋", "/%E5%8F%A3%E8%A2%8B/events%2Fone")])
def test_websocket_strips_mount_prefix_and_preserves_remaining_encoded_path(relay, mount, path):
    async def scenario():
        async with servers(relay, echo, mount=mount) as state:
            async with connect(uri(state, relay, path), proxy=None, close_timeout=0.2) as client:
                assert await client.recv() == "upstream-ready"
            assert state.paths == [f"/base%20dir/root/events%2Fone?pin={relay.get_lan_pin()}"]

    asyncio.run(scenario())
