from __future__ import annotations

from dataclasses import replace
import importlib
from pathlib import Path
import sys

from fastapi.testclient import TestClient
import pytest


RELAY_DIR = str(Path(__file__).resolve().parents[2] / "apps" / "pocket-relay")
RELAY_MODULES = ("config", "pin", "tunnel", "qr", "main")


@pytest.fixture
def relay(tmp_path, monkeypatch):
    monkeypatch.setenv("POCKET_STATE_DIR", str(tmp_path))
    monkeypatch.setenv("POCKET_WEB_TARGET", "http://127.0.0.1:9")
    monkeypatch.setenv("POCKET_RPC_SECRET", "")
    monkeypatch.setenv("POCKET_AUTO_START_PUBLIC", "false")
    monkeypatch.syspath_prepend(RELAY_DIR)
    previous = {name: sys.modules[name] for name in RELAY_MODULES if name in sys.modules}
    for name in RELAY_MODULES:
        sys.modules.pop(name, None)
    try:
        module = importlib.import_module("main")
        stops = []
        monkeypatch.setattr(module.manager, "stop", lambda: stops.append(True))
        yield module, stops
    finally:
        for name in RELAY_MODULES:
            sys.modules.pop(name, None)
        sys.modules.update(previous)


@pytest.mark.parametrize("host,origin", [
    ("localhost:8788", "https://untrusted.example"),
    ("localhost:8788", "null"),
    ("localhost:8788", "http://127.0.0.1:8788"),
    ("localhost:8788", "http://localhost:8789"),
    ("localhost", "http://localhost:0"),
    ("localhost:0", "http://localhost"),
    ("localhost:8788", "http://localhost:8788/"),
    ("localhost:8788", "http://localhost:8788?"),
    ("localhost:8788", "http://localhost:8788#"),
    ("localhost:8788", "http://user@localhost:8788"),
    ("localhost:8788", "http://local\thost:8788"),
    ("rebound.example:8788", "http://rebound.example:8788"),
    ("offline.trycloudflare.com", None),
    ("localhost:8788?", None),
    ("localhost:8788#", None),
    ("user@localhost:8788", None),
    ("local\thost:8788", None),
    ("localhost:65536", None),
])
def test_secretless_rpc_rejects_untrusted_authority_or_origin(relay, host, origin):
    module, stops = relay
    headers = {"host": host}
    if origin is not None:
        headers["origin"] = origin
    with TestClient(module.app, base_url="http://localhost:8788", client=("127.0.0.1", 41000)) as client:
        response = client.post("/rpc/tunnel/stop", headers=headers)
    assert response.status_code == 403
    assert response.json()["detail"] == "RPC not allowed from this host"
    assert stops == []


@pytest.mark.parametrize("base_url,host,origin", [
    ("http://localhost:8788", None, None),
    ("http://localhost:8788", None, "http://localhost:8788"),
    ("http://127.0.0.1:8788", None, "http://127.0.0.1:8788"),
    # Exercise the actual IPv6 authority header without TestClient's separate
    # deprecated HTTPX transport failing to parse an IPv6 base URL first.
    ("http://localhost:8788", "[::1]:8788", "http://[::1]:8788"),
    ("http://localhost", None, "http://localhost:80"),
    ("https://localhost", None, "https://localhost:443"),
])
def test_secretless_rpc_accepts_local_cli_and_same_origin(relay, base_url, host, origin):
    module, stops = relay
    headers = {"origin": origin} if origin is not None else {}
    if host is not None:
        headers["host"] = host
    with TestClient(module.app, base_url=base_url, client=("127.0.0.1", 41000)) as client:
        response = client.post("/rpc/tunnel/stop", headers=headers)
    assert response.status_code == 200
    assert response.json() == {"running": False}
    assert stops == [True]


@pytest.mark.parametrize("headers", [
    [("host", "localhost"), ("host", "rebound.example")],
    [("origin", "http://localhost:8788"), ("origin", "https://untrusted.example")],
])
def test_secretless_rpc_rejects_ambiguous_headers(relay, headers):
    module, stops = relay
    with TestClient(module.app, base_url="http://localhost:8788", client=("127.0.0.1", 41000)) as client:
        response = client.post("/rpc/tunnel/stop", headers=headers)
    assert response.status_code == 403
    assert stops == []


def test_loopback_host_alone_does_not_authorize_remote_client(relay):
    module, stops = relay
    with TestClient(module.app, base_url="http://localhost:8788", client=("203.0.113.10", 41000)) as client:
        assert client.post("/rpc/tunnel/stop").status_code == 403
    assert stops == []


def test_explicit_rpc_secret_preserves_cross_container_access(relay, monkeypatch):
    module, stops = relay
    monkeypatch.setattr(module, "settings", replace(module.settings, rpc_secret="offline-admin-key"))
    with TestClient(module.app, base_url="http://pocket:8788", client=("172.18.0.2", 41000)) as client:
        response = client.post("/rpc/tunnel/stop", headers={
            "x-pocket-rpc-token": "offline-admin-key", "origin": "https://dashboard.example",
        })
        page = client.get("/_pocket")
    assert response.status_code == 200
    assert stops == [True]
    assert page.status_code == 200
    assert "offline-admin-key" not in page.text


@pytest.mark.parametrize("tokens", [
    [(b"x-pocket-rpc-token", b"\xff")],
    [(b"x-pocket-rpc-token", b"offline-admin-key"), (b"x-pocket-rpc-token", b"wrong")],
])
def test_malformed_or_ambiguous_secret_is_rejected_without_side_effect(relay, monkeypatch, tokens):
    module, stops = relay
    monkeypatch.setattr(module, "settings", replace(module.settings, rpc_secret="offline-admin-key"))
    with TestClient(module.app, client=("127.0.0.1", 41000), raise_server_exceptions=False) as client:
        response = client.post("/rpc/tunnel/stop", headers=tokens)
    assert response.status_code == 403
    assert stops == []
