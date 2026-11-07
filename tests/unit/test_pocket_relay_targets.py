from __future__ import annotations

import asyncio
from dataclasses import replace
import importlib
from pathlib import Path
import sys
from types import SimpleNamespace
from urllib.parse import unquote

import httpx
import pytest


RELAY_DIR = str(Path(__file__).resolve().parents[2] / "apps" / "pocket-relay")
RELAY_MODULES = ("config", "pin", "tunnel", "qr", "main")
PUBLIC_HOST = "offline.trycloudflare.com"
TARGET = "http://fixed-upstream.invalid:8765/base%20dir/root"
BASE_PATH = b"/base%20dir/root"


@pytest.fixture
def relay(tmp_path, monkeypatch):
    monkeypatch.setenv("POCKET_STATE_DIR", str(tmp_path))
    monkeypatch.setenv("POCKET_WEB_TARGET", TARGET)
    monkeypatch.setenv("POCKET_RPC_SECRET", "offline-target-test")
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
def upstream(monkeypatch):
    requests, clients = [], []
    original = httpx.AsyncClient

    def handle(request):
        requests.append(request)
        if request.url.path.endswith("/redirect"):
            return httpx.Response(307, headers={"location": "https://other.invalid/escape"})
        return httpx.Response(200, content=b"offline target response", headers={"x-upstream": "preserved"})

    def offline_client(*args, **kwargs):
        kwargs["transport"] = httpx.MockTransport(handle)
        client = original(*args, **kwargs)
        clients.append(client)
        return client

    monkeypatch.setattr(httpx, "AsyncClient", offline_client)
    return SimpleNamespace(requests=requests, clients=clients)


def request(relay, raw_path: bytes | None, *, path=None, root_path="", query=b"", headers=None, host=PUBLIC_HOST, method="GET", body=b""):
    """Call the real ASGI middleware without a client normalizing the raw path."""
    if path is None:
        path = unquote(raw_path.decode("ascii"))
    scope = {
        "type": "http", "asgi": {"version": "3.0", "spec_version": "2.4"},
        "http_version": "1.1", "method": method, "scheme": "https",
        "path": path, "root_path": root_path, "query_string": query,
        "headers": [(b"host", host.encode()), *(headers or [])],
        "client": ("198.51.100.2", 12345), "server": ("relay.test", 443),
    }
    if raw_path is not None:
        scope["raw_path"] = raw_path
    messages = []

    async def exchange():
        received = False

        async def receive():
            nonlocal received
            if not received:
                received = True
                return {"type": "http.request", "body": body, "more_body": False}
            await asyncio.Future()

        async def send(message):
            messages.append(message)

        await relay.app(scope, receive, send)

    asyncio.run(exchange())
    start = next(message for message in messages if message["type"] == "http.response.start")
    content = b"".join(message.get("body", b"") for message in messages if message["type"] == "http.response.body")
    return SimpleNamespace(status_code=start["status"], headers=httpx.Headers(start["headers"]), content=content)


@pytest.mark.parametrize("raw_path", [
    b"/http://other.invalid/private",
    b"/https://user:pass@other.invalid:9443/private",
    b"//other.invalid/private",
    b"/%2F%2Fother.invalid/private",
    b"/http%3A%2F%2Fother.invalid/private",
    b"/docs/a%3Fb%23c%252Fd",
    b"/assets/a%2Fb/%E4%B8%AD%20space.txt",
    b"/literal%25sign",
    b"/",
])
def test_authenticated_proxy_keeps_configured_origin_and_encoded_path(relay, upstream, raw_path):
    query = f"pin={relay.get_public_pin()}&q=%2F%252F%23%3F&tag=one&tag=two".encode()
    response = request(relay, raw_path, query=query)

    assert response.status_code == 200
    assert response.content == b"offline target response"
    assert len(upstream.requests) == 1
    actual = upstream.requests[0].url
    assert (actual.scheme, actual.host, actual.port) == ("http", "fixed-upstream.invalid", 8765)
    assert actual.raw_path == BASE_PATH + raw_path + b"?" + query
    assert actual.query == query
    assert actual.fragment == ""
    assert all(client.is_closed for client in upstream.clients)


@pytest.mark.parametrize("root_path,raw_path,relative_path", [
    ("/pocket", b"/pocket/events%2Fone", b"/events%2Fone"),
    ("/pocket", b"/events%2Fone", b"/events%2Fone"),
    ("/pocket", b"/pocketbook/events%2Fone", b"/pocketbook/events%2Fone"),
    ("/pocket", b"/%70ocket/events%2fone", b"/events%2fone"),
    ("/口袋", b"/%E5%8F%A3%E8%A2%8B/events%2Fone", b"/events%2Fone"),
    ("/pocket", b"/pocket", b"/"),
])
def test_mount_prefix_strips_complete_decoded_segments_without_losing_raw_encoding(relay, upstream, root_path, raw_path, relative_path):
    query = f"pin={relay.get_public_pin()}&cursor=a%2Fb".encode()
    response = request(relay, raw_path, root_path=root_path, query=query)

    assert response.status_code == 200
    assert upstream.requests[0].url.raw_path == BASE_PATH + relative_path + b"?" + query


def test_scope_without_optional_raw_path_encodes_path_delimiters_and_literal_percent(relay, upstream):
    query = f"pin={relay.get_public_pin()}&page=2".encode()
    response = request(relay, None, path="/report/a?b#c%2F中", query=query)

    assert response.status_code == 200
    assert upstream.requests[0].url.raw_path == BASE_PATH + b"/report/a%3Fb%23c%252F%E4%B8%AD?" + query


@pytest.mark.parametrize("root_path,raw_path", [
    ("", b"/health"),
    ("/pocket", b"/pocket/health"),
    ("/pocket", b"/health"),
])
def test_real_health_route_respects_mount_without_pin_or_proxy(relay, upstream, root_path, raw_path):
    response = request(relay, raw_path, root_path=root_path)

    assert response.status_code == 200
    assert b'"ok":true' in response.content
    assert upstream.requests == []


@pytest.mark.parametrize("root_path,raw_path", [
    ("/pocket", b"/pocketbook/health"),
    ("", b"/http://other.invalid/private"),
])
@pytest.mark.parametrize("query", [b"", b"pin=invalid"])
def test_unverified_request_never_builds_upstream_connection(relay, upstream, root_path, raw_path, query):
    response = request(relay, raw_path, root_path=root_path, query=query)

    assert response.status_code == 401
    assert response.content == b'{"detail":"PIN required"}'
    assert upstream.requests == []
    assert upstream.clients == []


@pytest.mark.parametrize("forged_host", [b"offline.trycloudflare.com/health?", b"offline.trycloudflare.com/_pocket#"])
def test_untrusted_host_cannot_select_reserved_path(relay, upstream, forged_host):
    response = request(relay, b"/private/report", host=forged_host.decode())

    assert response.status_code == 401
    assert upstream.requests == []


def test_normal_post_preserves_base_path_query_body_and_header_filters(relay, upstream, monkeypatch):
    monkeypatch.setattr(relay, "settings", replace(relay.settings, web_target="https://fixed-upstream.invalid:9443/service/"))
    query = f"pin={relay.get_public_pin()}&raw=%252F&raw=%3F".encode()
    response = request(relay, b"/submit", query=query, method="POST", body=b"offline body", headers=[
        (b"content-length", b"12"), (b"connection", b"test-hop"),
        (b"accept-encoding", b"test-encoding"), (b"x-client-marker", b"preserved"),
    ])

    assert response.status_code == 200
    assert response.headers["x-upstream"] == "preserved"
    actual = upstream.requests[0]
    assert str(actual.url) == f"https://fixed-upstream.invalid:9443/service/submit?{query.decode()}"
    assert actual.content == b"offline body"
    assert actual.headers["host"] == "fixed-upstream.invalid:9443"
    assert actual.headers["x-forwarded-host"] == PUBLIC_HOST
    assert actual.headers["x-forwarded-proto"] == "https"
    assert actual.headers["x-client-marker"] == "preserved"
    assert actual.headers.get("connection") != "test-hop"
    assert actual.headers.get("accept-encoding") != "test-encoding"


def test_redirect_location_is_forwarded_without_following_it(relay, upstream):
    query = f"pin={relay.get_public_pin()}".encode()
    response = request(relay, b"/redirect", query=query)

    assert response.status_code == 307
    assert response.headers["location"] == "https://other.invalid/escape"
    assert len(upstream.requests) == 1
    assert upstream.requests[0].url.host == "fixed-upstream.invalid"
    assert all(client.is_closed for client in upstream.clients)
