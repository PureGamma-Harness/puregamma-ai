from __future__ import annotations

import importlib
import io
import sys
from pathlib import Path

import httpx
import pytest
from fastapi.testclient import TestClient
from PIL import Image

RELAY_DIR = str(Path(__file__).resolve().parents[2] / "apps" / "pocket-relay")
RELAY_MODULES = ("config", "pin", "tunnel", "qr", "main")
PUBLIC_HOST = "offline.trycloudflare.com"


@pytest.fixture()
def relay(tmp_path, monkeypatch):
    monkeypatch.setenv("POCKET_STATE_DIR", str(tmp_path))
    monkeypatch.setenv("POCKET_WEB_TARGET", "http://127.0.0.1:9")
    monkeypatch.setenv("POCKET_RPC_SECRET", "testsecret")
    monkeypatch.setenv("POCKET_AUTO_START_PUBLIC", "false")
    monkeypatch.syspath_prepend(RELAY_DIR)
    # The standalone relay uses generic module names; preserve modules owned
    # by other apps while importing fresh relay settings for each test.
    previous = {name: sys.modules[name] for name in RELAY_MODULES if name in sys.modules}
    for name in RELAY_MODULES:
        sys.modules.pop(name, None)
    try:
        yield importlib.import_module("main")
    finally:
        for name in RELAY_MODULES:
            sys.modules.pop(name, None)
        sys.modules.update(previous)


@pytest.fixture()
def client(relay):
    with TestClient(relay.app) as value:
        yield value


@pytest.fixture()
def upstream_requests(monkeypatch):
    requests = []
    async_client = httpx.AsyncClient

    def unavailable(request):
        requests.append(request)
        raise httpx.ConnectError("offline upstream unavailable", request=request)

    def offline_client(*args, **kwargs):
        kwargs["transport"] = httpx.MockTransport(unavailable)
        return async_client(*args, **kwargs)

    monkeypatch.setattr(httpx, "AsyncClient", offline_client)
    return requests


H = {"x-pocket-rpc-token": "testsecret"}


def test_health_and_rpc_status(client):
    assert client.get("/health").status_code == 200
    response = client.get("/rpc/status", headers=H)
    assert response.status_code == 200
    body = response.json()
    assert "lan" not in body
    assert len(body["public"]["pin"]) == 8
    assert body["public"]["pin"].isdigit()
    assert body["public"]["running"] is False
    assert body["public"]["url"] is None
    assert body["session"]["restart_requires_relogin"] is True


def test_proxy_requires_pin(client, upstream_requests):
    headers = {"host": PUBLIC_HOST}
    assert client.get("/", headers=headers).status_code == 401
    assert client.get("/?pin=invalid", headers=headers).status_code == 401
    assert upstream_requests == []
    body = client.get("/rpc/status", headers=H).json()
    response = client.get("/", params={"pin": body["public"]["pin"]}, headers=headers)
    # Exercise the real proxy after the PIN gate, with an offline transport.
    assert response.status_code == 502
    assert response.json()["detail"] == "upstream unavailable"
    assert len(upstream_requests) == 1
    assert upstream_requests[0].url.host == "127.0.0.1"
    assert upstream_requests[0].headers["x-forwarded-host"] == PUBLIC_HOST
    gate = client.get("/", headers={**headers, "accept": "text/html"})
    assert gate.status_code == 401
    assert "访问验证" in gate.text
    assert len(upstream_requests) == 1


def test_pin_rotate_and_custom(client, monkeypatch):
    before = client.get("/rpc/status", headers=H).json()["public"]["pin"]
    replacement = "87654321" if before != "87654321" else "11223344"
    monkeypatch.setattr(sys.modules["pin"], "new_pin", lambda: replacement)
    rotated = client.post("/rpc/pin/rotate", json={"which": "public"}, headers=H).json()["public"]
    assert len(rotated) == 8
    assert rotated == replacement and rotated != before
    assert client.get("/", params={"pin": before}, headers={"host": PUBLIC_HOST}).status_code == 401
    assert client.post("/rpc/pin/custom", json={"which": "public", "pin": "12345678"}, headers=H).json() == {"public": "12345678"}
    assert client.post("/rpc/pin/custom", json={"which": "public", "pin": "abc"}, headers=H).status_code == 400
    assert client.get("/rpc/status", headers=H).json()["public"]["pin"] == "12345678"
    assert client.post("/rpc/pin/rotate", json={"which": "public"}, headers=H).json() == {"public": "12345678"}


@pytest.mark.parametrize("method,path,body", [
    ("GET", "/rpc/status", None),
    ("POST", "/rpc/tunnel/start", None),
    ("POST", "/rpc/tunnel/stop", None),
    ("POST", "/rpc/pin/rotate", {"which": "public"}),
    ("POST", "/rpc/pin/custom", {"which": "public", "pin": "12345678"}),
    ("GET", "/rpc/qr?kind=public", None),
])
def test_rpc_secret_enforced(client, method, path, body):
    assert client.request(method, path, json=body).status_code == 403
    assert client.request(method, path, json=body, headers={"x-pocket-rpc-token": "wrong"}).status_code == 403


def test_qr_rejects_lan_and_missing_public_tunnel(client):
    assert client.get("/rpc/qr?kind=lan", headers=H).status_code == 400
    unavailable = client.get("/rpc/qr?kind=public", headers=H)
    assert unavailable.status_code == 400
    assert unavailable.json()["detail"] == "no URL available"


def test_public_qr_and_control_page(client, relay, monkeypatch):
    monkeypatch.setattr(relay.manager, "status", lambda: {
        "running": True,
        "public_url": f"https://{PUBLIC_HOST}",
        "last_error": None,
    })
    qr = client.get("/rpc/qr?kind=public", headers=H)
    assert qr.status_code == 200
    assert qr.headers["content-type"] == "image/png"
    assert qr.content.startswith(b"\x89PNG\r\n\x1a\n")
    with Image.open(io.BytesIO(qr.content)) as image:
        image.load()
        assert image.format == "PNG"
        assert image.width == image.height and image.width > 0
        assert image.convert("L").getextrema() == (0, 255)
    page = client.get("/_pocket")
    assert page.status_code == 200
    assert "手机访问" in page.text
