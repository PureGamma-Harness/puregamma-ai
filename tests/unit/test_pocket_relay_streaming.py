from __future__ import annotations

import asyncio
from concurrent.futures import ThreadPoolExecutor
import gzip
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import importlib
from pathlib import Path
import select
import socket
import sys
import threading
import time
from types import SimpleNamespace
from urllib.parse import urlsplit

import httpx
import pytest
from starlette.requests import Request
from starlette.requests import ClientDisconnect
import uvicorn


RELAY_DIR = str(Path(__file__).resolve().parents[2] / "apps" / "pocket-relay")
RELAY_MODULES = ("config", "pin", "tunnel", "qr", "main")
PUBLIC_HOST = "offline.trycloudflare.com"
FIRST = b"event: sample\ndata: first\n\n"
SECOND = b"event: complete\ndata: done\n\n"
BODY = b'{"message":"offline upstream response"}'


@pytest.fixture
def upstream():
    state = SimpleNamespace(
        requests=[], first_sent=threading.Event(), allow_second=threading.Event(),
        peer_closed=threading.Event(), login_waiting=threading.Event(),
        allow_login_reply=threading.Event(),
    )

    class Handler(BaseHTTPRequestHandler):
        protocol_version = "HTTP/1.1"

        def do_GET(self):
            self.handle_request()

        def do_POST(self):
            self.handle_request()

        def handle_request(self):
            path = urlsplit(self.path).path
            body = self.rfile.read(int(self.headers.get("Content-Length", 0)))
            state.requests.append({"path": self.path, "headers": self.headers, "body": body})
            if path == "/abort":
                self.close_connection = True
                self.connection.shutdown(socket.SHUT_RDWR)
                return
            if path == "/login-wait":
                state.login_waiting.set()
                if not state.allow_login_reply.wait(5):
                    return
            if path in {"/empty", "/login-wait"}:
                self.send_response(204)
                self.send_header("Connection", "close")
                self.end_headers()
                return
            if path in {"/events", "/truncated"}:
                self.send_response(200)
                self.send_header("Content-Type", "text/event-stream")
                self.send_header("Content-Length", str(len(FIRST + SECOND)))
                self.send_header("Connection", "close")
                self.end_headers()
                try:
                    self.wfile.write(FIRST)
                    self.wfile.flush()
                    state.first_sent.set()
                    deadline = time.monotonic() + 5
                    while not state.allow_second.wait(0.01):
                        readable, _, _ = select.select([self.connection], [], [], 0)
                        if readable and not self.connection.recv(1, socket.MSG_PEEK):
                            state.peer_closed.set()
                            return
                        if time.monotonic() > deadline:
                            return
                    if path == "/events":
                        self.wfile.write(SECOND)
                        self.wfile.flush()
                except (BrokenPipeError, ConnectionResetError):
                    state.peer_closed.set()
                return
            encoded = gzip.compress(BODY)
            self.send_response(201)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(encoded)))
            self.send_header("Content-Encoding", "gzip")
            self.send_header("Connection", "close")
            self.send_header("X-Upstream-Marker", "preserved")
            self.send_header("Set-Cookie", "app_session=offline; Path=/; HttpOnly")
            self.send_header("Set-Cookie", "app_refresh=offline; Path=/auth; SameSite=Lax")
            self.end_headers()
            self.wfile.write(encoded)

        def log_message(self, *_args):
            pass

    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        yield state, f"http://127.0.0.1:{server.server_port}"
    finally:
        state.allow_second.set()
        state.allow_login_reply.set()
        server.shutdown()
        server.server_close()
        thread.join(timeout=3)
        assert not thread.is_alive()


@pytest.fixture
def relay(upstream, tmp_path, monkeypatch):
    monkeypatch.setenv("POCKET_STATE_DIR", str(tmp_path))
    monkeypatch.setenv("POCKET_WEB_TARGET", upstream[1])
    monkeypatch.setenv("POCKET_RPC_SECRET", "offline-stream-test")
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


@pytest.fixture
def clients(monkeypatch):
    instances = []
    original = httpx.AsyncClient

    class TrackedClient(original):
        def __init__(self, *args, **kwargs):
            super().__init__(*args, **kwargs)
            self.responses = []
            self.closed = threading.Event()
            instances.append(self)

        async def send(self, *args, **kwargs):
            response = await super().send(*args, **kwargs)
            self.responses.append(response)
            return response

        async def aclose(self):
            try:
                await super().aclose()
            finally:
                self.closed.set()

        async def __aexit__(self, *args):
            try:
                await super().__aexit__(*args)
            finally:
                self.closed.set()

    monkeypatch.setattr(httpx, "AsyncClient", TrackedClient)
    return instances


@pytest.fixture
def live_relay(relay, clients):
    listener = socket.socket()
    listener.bind(("127.0.0.1", 0))
    listener.listen(128)
    address = f"http://127.0.0.1:{listener.getsockname()[1]}"
    server = uvicorn.Server(uvicorn.Config(relay.app, log_level="critical", lifespan="off"))
    thread = threading.Thread(target=server.run, kwargs={"sockets": [listener]}, daemon=True)
    thread.start()
    deadline = time.monotonic() + 5
    while not server.started:
        assert thread.is_alive(), "Local Relay server failed to start"
        assert time.monotonic() < deadline, "Local Relay server startup timed out"
        time.sleep(0.01)
    try:
        with httpx.Client(base_url=address, headers={"host": PUBLIC_HOST}, timeout=3, trust_env=False) as client:
            yield client
    finally:
        server.should_exit = True
        thread.join(timeout=5)
        listener.close()
        assert not thread.is_alive(), "Local Relay server did not shut down"


def assert_closed(clients):
    assert clients
    for client in clients:
        assert client.closed.wait(3), "Proxy HTTP client was not closed"
        assert client.is_closed
        assert all(response.is_closed for response in client.responses)


def test_delayed_sse_reaches_client_before_upstream_finishes(relay, live_relay, upstream, clients):
    state, _ = upstream
    with live_relay.stream("GET", "/events", params={"pin": relay.get_public_pin()}) as response:
        assert response.status_code == 200
        assert response.headers["content-type"] == "text/event-stream"
        chunks = response.iter_bytes()
        assert next(chunks) == FIRST
        assert not state.allow_second.is_set()
        state.allow_second.set()
        assert b"".join(chunks) == SECOND
    assert_closed(clients)


def test_ordinary_response_keeps_decoded_body_headers_and_separate_cookies(relay, live_relay, upstream, clients):
    cookie = f"{relay.COOKIE_NAME}={relay._cookie_value('public')}; app_session=offline-request"
    response = live_relay.post("/ordinary?keep=1", content=b"request-body", headers={
        "cookie": cookie, "connection": "test-hop-header", "accept-encoding": "test-encoding",
        "x-client-marker": "preserved",
    })

    assert response.status_code == 201
    assert response.content == BODY
    assert response.headers["x-upstream-marker"] == "preserved"
    assert response.headers.get_list("set-cookie") == [
        "app_session=offline; Path=/; HttpOnly",
        "app_refresh=offline; Path=/auth; SameSite=Lax",
    ]
    assert "content-encoding" not in response.headers
    assert "content-length" not in response.headers
    assert all(name == name.lower() for name, _ in response.headers.raw)
    request = upstream[0].requests[0]
    assert request["path"] == "/ordinary?keep=1"
    assert request["body"] == b"request-body"
    assert request["headers"]["Cookie"] == cookie
    assert request["headers"]["X-Forwarded-Host"] == PUBLIC_HOST
    assert request["headers"]["X-Forwarded-Proto"] == "https"
    assert request["headers"]["X-Client-Marker"] == "preserved"
    assert request["headers"]["Host"].startswith("127.0.0.1:")
    assert request["headers"].get("Connection") != "test-hop-header"
    assert request["headers"].get("Accept-Encoding") != "test-encoding"
    assert_closed(clients)


def test_downstream_disconnect_closes_pending_upstream_stream(relay, live_relay, upstream, clients):
    with live_relay.stream("GET", "/events", params={"pin": relay.get_public_pin()}) as response:
        assert next(response.iter_bytes()) == FIRST
    assert_closed(clients)
    assert upstream[0].peer_closed.wait(3), "Upstream socket remained open after downstream disconnect"
    assert not upstream[0].allow_second.is_set()


def test_upstream_truncation_closes_response_and_client(relay, live_relay, upstream, clients):
    with live_relay.stream("GET", "/truncated", params={"pin": relay.get_public_pin()}) as response:
        chunks = response.iter_bytes()
        assert next(chunks) == FIRST
        upstream[0].allow_second.set()
        with pytest.raises((httpx.RemoteProtocolError, httpx.ReadError)):
            b"".join(chunks)
    assert_closed(clients)


def test_upstream_failure_before_headers_returns_502_and_closes_client(relay, live_relay, clients):
    response = live_relay.get("/abort", params={"pin": relay.get_public_pin()})
    assert response.status_code == 502
    assert response.json()["detail"] == "upstream unavailable"
    assert_closed(clients)


def test_pin_login_persists_cookie_for_stream_and_rotation_revokes_it(relay, live_relay, upstream, clients, monkeypatch):
    pin = relay.get_public_pin()
    login = live_relay.get("/empty", params={"pin": pin})
    assert login.status_code == 204
    assert live_relay.cookies.get(relay.COOKIE_NAME) == relay._cookie_value("public")
    header = login.headers["set-cookie"].lower()
    assert "httponly" in header and "samesite=lax" in header
    assert f"max-age={relay.COOKIE_MAX_AGE}" in header and "path=/" in header
    upstream[0].allow_second.set()
    response = live_relay.get("/events")
    assert response.status_code == 200
    assert response.content == FIRST + SECOND
    assert_closed(clients)

    monkeypatch.setattr(sys.modules["pin"], "new_pin", lambda: "12345678" if pin != "12345678" else "87654321")
    relay.rotate_public_pin()
    before = len(upstream[0].requests)
    assert live_relay.get("/events").status_code == 401
    assert len(upstream[0].requests) == before


@pytest.mark.parametrize("credentials", ["pin", "cookie"])
def test_invalid_credentials_never_contact_upstream(relay, live_relay, upstream, clients, credentials):
    kwargs = {"params": {"pin": "invalid"}} if credentials == "pin" else {"headers": {"cookie": "pg_pocket=invalid"}}
    assert live_relay.get("/events", **kwargs).status_code == 401
    assert upstream[0].requests == []
    assert clients == []


def test_pin_rotation_during_upstream_wait_cannot_issue_a_new_pin_session(relay, live_relay, upstream, clients, monkeypatch):
    pin = relay.get_public_pin()
    accepted_cookie = relay._cookie_value("public")
    with ThreadPoolExecutor(max_workers=1) as executor:
        login = executor.submit(live_relay.get, "/login-wait", params={"pin": pin})
        assert upstream[0].login_waiting.wait(3)
        monkeypatch.setattr(sys.modules["pin"], "new_pin", lambda: "12345678" if pin != "12345678" else "87654321")
        relay.rotate_public_pin()
        upstream[0].allow_login_reply.set()
        response = login.result(timeout=3)
    assert response.status_code == 204
    assert live_relay.cookies.get(relay.COOKIE_NAME) == accepted_cookie
    assert accepted_cookie != relay._cookie_value("public")
    assert live_relay.get("/events").status_code == 401
    assert len(upstream[0].requests) == 1
    assert_closed(clients)


def test_downstream_failure_before_body_iteration_still_closes_upstream(relay, upstream, clients):
    async def scenario():
        scope = {
            "type": "http", "http_version": "1.1", "method": "GET", "scheme": "http",
            "path": "/events", "query_string": b"", "headers": [(b"host", PUBLIC_HOST.encode())],
            "asgi": {"version": "3.0", "spec_version": "2.4"},
        }
        async def receive_body():
            return {"type": "http.request", "body": b"", "more_body": False}

        response = await relay._proxy_http(Request(scope, receive_body))

        async def receive():
            await asyncio.Future()

        async def send(_message):
            raise OSError("offline downstream disconnected before response headers")

        with pytest.raises(ClientDisconnect):
            await response(scope, receive, send)

    asyncio.run(scenario())
    assert_closed(clients)
    assert upstream[0].peer_closed.wait(3)
