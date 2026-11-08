from __future__ import annotations

import importlib
from pathlib import Path
import sys

from fastapi.testclient import TestClient
import httpx
import pytest
from starlette.websockets import WebSocket, WebSocketDisconnect


RELAY_DIR = str(Path(__file__).resolve().parents[2] / "apps" / "pocket-relay")
RELAY_MODULES = ("config", "pin", "tunnel", "qr", "main")
PUBLIC_HOST = "offline.trycloudflare.com"
RPC_HEADERS = {"x-pocket-rpc-token": "offline-pin-admin"}


@pytest.fixture
def relay(tmp_path, monkeypatch):
    monkeypatch.setenv("POCKET_STATE_DIR", str(tmp_path))
    monkeypatch.setenv("POCKET_WEB_TARGET", "http://127.0.0.1:9")
    monkeypatch.setenv("POCKET_RPC_SECRET", "offline-pin-admin")
    monkeypatch.setenv("POCKET_AUTO_START_PUBLIC", "false")
    monkeypatch.syspath_prepend(RELAY_DIR)
    previous = {name: sys.modules[name] for name in RELAY_MODULES if name in sys.modules}
    for name in RELAY_MODULES:
        sys.modules.pop(name, None)
    try:
        module = importlib.import_module("main")
        requests = []
        sockets = []
        original = httpx.AsyncClient

        def handle(request):
            requests.append(request)
            return httpx.Response(200, content=b"offline proxy response")

        def offline_client(*args, **kwargs):
            kwargs["transport"] = httpx.MockTransport(handle)
            return original(*args, **kwargs)

        def forbidden_socket(*args, **kwargs):
            sockets.append((args, kwargs))
            raise AssertionError("An invalid credential attempted an upstream WebSocket")

        monkeypatch.setattr(httpx, "AsyncClient", offline_client)
        monkeypatch.setattr(module.wsclient, "connect", forbidden_socket)
        yield module, requests, sockets
    finally:
        for name in RELAY_MODULES:
            sys.modules.pop(name, None)
        sys.modules.update(previous)


@pytest.fixture
def client(relay):
    with TestClient(relay[0].app, base_url=f"http://{PUBLIC_HOST}", raise_server_exceptions=False) as value:
        yield value


def ws_authorized(module, query="", cookie=None):
    headers = [(b"host", PUBLIC_HOST.encode())]
    if cookie is not None:
        headers.append((b"cookie", cookie))
    scope = {"type": "websocket", "path": "/feed", "scheme": "ws",
             "query_string": query.encode("ascii"), "headers": headers}
    websocket = WebSocket(scope, receive=lambda: None, send=lambda message: None)
    return module._ws_authorized(websocket, "public")


@pytest.mark.parametrize("value", ["é", "١٢٣٤٥٦٧٨", "１２３４５６７８"])
def test_http_non_ascii_pin_is_a_normal_unauthorized_request(client, relay, value):
    response = client.get("/feed", params={"pin": value})
    assert response.status_code == 401
    assert response.json() == {"detail": "PIN required"}
    assert relay[1] == []


@pytest.mark.parametrize("value", [b"\xff", b"\xc3\xa9"])
def test_http_non_ascii_cookie_is_a_normal_unauthorized_request(client, relay, value):
    response = client.get("/feed", headers={"cookie": b"pg_pocket=" + value})
    assert response.status_code == 401
    assert response.json() == {"detail": "PIN required"}
    assert relay[1] == []


@pytest.mark.parametrize("query,cookie", [
    ("pin=%C3%A9", None),
    ("pin=%D9%A1%D9%A2%D9%A3%D9%A4%D9%A5%D9%A6%D9%A7%D9%A8", None),
    ("", b"pg_pocket=\xff"),
    ("", b"pg_pocket=\xc3\xa9"),
])
def test_websocket_invalid_text_credentials_close_before_upstream(client, relay, query, cookie):
    headers = {"cookie": cookie} if cookie is not None else {}
    with pytest.raises(WebSocketDisconnect) as closed:
        with client.websocket_connect("/feed?" + query, headers=headers):
            pytest.fail("Invalid credentials completed the handshake")
    assert closed.value.code == 4403
    assert relay[2] == []


@pytest.mark.parametrize("bad_field", ["pin", "cookie"])
def test_valid_http_credential_keeps_existing_fallback_semantics(client, relay, bad_field):
    module = relay[0]
    pin = module.get_public_pin()
    cookie = module._cookie_value("public")
    if bad_field == "pin":
        query = {"pin": "wrong"}
        headers = {"cookie": f"pg_pocket={cookie}"}
    else:
        query = {"pin": pin}
        headers = {"cookie": b"pg_pocket=wrong"}
    response = client.get("/feed", params=query, headers=headers)
    assert response.status_code == 200
    assert response.content == b"offline proxy response"
    assert len(relay[1]) == 1


@pytest.mark.parametrize("bad_field", ["pin", "cookie"])
def test_non_ascii_field_cannot_be_forwarded_with_another_valid_credential(client, relay, bad_field):
    module = relay[0]
    if bad_field == "pin":
        query = "pin=%C3%A9"
        cookie = ("pg_pocket=" + module._cookie_value("public")).encode()
    else:
        query = "pin=" + module.get_public_pin()
        cookie = b"pg_pocket=\xff"
    response = client.get("/feed?" + query, headers={"cookie": cookie})
    assert response.status_code == 401
    assert relay[1] == []
    with pytest.raises(WebSocketDisconnect) as closed:
        with client.websocket_connect("/feed?" + query, headers={"cookie": cookie}):
            pytest.fail("Malformed credentials completed the handshake")
    assert closed.value.code == 4403
    assert relay[2] == []


@pytest.mark.parametrize("case", ["pin", "cookie", "cookie_with_bad_pin", "pin_with_bad_cookie"])
def test_valid_ws_credential_keeps_existing_fallback_semantics(relay, case):
    module = relay[0]
    query = "pin=" + module.get_public_pin() if case in {"pin", "pin_with_bad_cookie"} else ""
    cookie = ("pg_pocket=" + module._cookie_value("public")).encode() if case in {"cookie", "cookie_with_bad_pin"} else None
    if case == "cookie_with_bad_pin":
        query = "pin=wrong"
    if case == "pin_with_bad_cookie":
        cookie = b"pg_pocket=wrong"
    assert ws_authorized(module, query, cookie) is True


@pytest.mark.parametrize("which", ["public", "lan"])
@pytest.mark.parametrize("value", ["١٢٣٤٥٦٧٨", "１２３４５６７８", "1234567８"])
def test_new_custom_pin_rejects_non_ascii_digits_without_persistence(client, relay, which, value):
    module = relay[0]
    pins = sys.modules["pin"]
    before = module.get_public_pin() if which == "public" else module.get_lan_pin()
    response = client.post("/rpc/pin/custom", json={"which": which, "pin": value}, headers=RPC_HEADERS)
    assert response.status_code == 400
    assert response.json()["detail"] == "PIN must be exactly 8 digits"
    filename = "token" if which == "public" else "token-lan"
    assert (Path(module.settings.state_dir) / filename).read_text() == before
    assert pins.pin_is_custom(which) is False


@pytest.mark.parametrize("which", ["public", "lan"])
def test_ascii_custom_pin_with_leading_zero_remains_persistent(client, relay, which):
    module = relay[0]
    value = "00001234"
    response = client.post("/rpc/pin/custom", json={"which": which, "pin": " " + value + " "}, headers=RPC_HEADERS)
    assert response.status_code == 200
    assert response.json() == {which: value}
    assert module.pin_is_custom(which) is True
    if which == "public":
        assert module.get_public_pin() == value
        assert module.rotate_public_pin() == value
    else:
        assert module.get_lan_pin() == value


@pytest.mark.parametrize("which", ["public", "lan"])
def test_existing_unicode_pin_is_not_silently_normalized_or_replaced(client, relay, which):
    module = relay[0]
    value = "١٢٣٤٥٦٧٨"
    directory = Path(module.settings.state_dir)
    directory.mkdir(parents=True, exist_ok=True)
    filename = "token" if which == "public" else "token-lan"
    (directory / filename).write_text(value)
    (directory / f"pin-{which}-custom").write_text("1")

    assert (module.get_public_pin() if which == "public" else module.get_lan_pin()) == value
    if which == "public":
        assert module.rotate_public_pin() == value
        denied = client.get("/feed", params={"pin": value})
        assert denied.status_code == 401
        assert client.get("/feed", params={"pin": "12345678"}).status_code == 401
        assert relay[1] == []
    assert (directory / filename).read_text() == value
    assert module.pin_is_custom(which) is True

    recovered = client.post("/rpc/pin/custom", json={"which": which, "pin": "12345678"}, headers=RPC_HEADERS)
    assert recovered.status_code == 200
    assert recovered.json() == {which: "12345678"}


@pytest.mark.parametrize("case,accepted", [
    ("pin_valid_last", True), ("pin_invalid_last", False),
    ("cookie_valid_last", True), ("cookie_invalid_last", False),
])
def test_duplicate_credentials_keep_existing_last_value_semantics(client, relay, case, accepted):
    module = relay[0]
    pin = module.get_public_pin()
    cookie = module._cookie_value("public")
    query = ""
    cookies = None
    if case.startswith("pin"):
        query = f"pin=wrong&pin={pin}" if accepted else f"pin={pin}&pin=wrong"
    else:
        cookies = (f"pg_pocket=wrong; pg_pocket={cookie}" if accepted else f"pg_pocket={cookie}; pg_pocket=wrong").encode()
    headers = {"cookie": cookies} if cookies is not None else {}
    response = client.get("/feed?" + query, headers=headers)
    assert response.status_code == (200 if accepted else 401)
    assert ws_authorized(module, query, cookies) is accepted
    assert len(relay[1]) == int(accepted)
