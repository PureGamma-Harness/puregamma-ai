from __future__ import annotations

import asyncio
import hashlib
import hmac
import re
import secrets
import socket
from contextlib import asynccontextmanager
from urllib.parse import quote, quote_from_bytes, unquote_to_bytes

import anyio
import httpx
import websockets.asyncio.client as wsclient
from fastapi import FastAPI, Request, WebSocket
from fastapi.responses import HTMLResponse, JSONResponse, Response, StreamingResponse
from starlette.middleware.base import BaseHTTPMiddleware

from config import settings
from pin import (
    get_lan_pin,
    get_public_pin,
    pin_for_host,
    pin_is_custom,
    refresh_lan_pin,
    rotate_public_pin,
    set_custom_pin,
)
from qr import make_qr
from tunnel import TunnelManager, auto_recover, save_auto_start, was_auto_start

# 会话保持：登录 cookie 绑定进程级 session key（服务重启后需重输密码，与 dsh-pocket 一致）
SESSION_KEY = secrets.token_hex(32)
COOKIE_NAME = "pg_pocket"
COOKIE_MAX_AGE = settings.session_ttl_days * 86400
RESERVED_PREFIXES = ("/health", "/rpc", "/_pocket")

manager = TunnelManager()


def _kind_for_host(host: str | None) -> str:
    if host and host.endswith("trycloudflare.com"):
        return "public"
    return "lan"


def _pin_for_kind(kind: str) -> str:
    return get_public_pin() if kind == "public" else get_lan_pin()


def _cookie_value(kind: str, pin: str | None = None) -> str:
    pin = _pin_for_kind(kind) if pin is None else pin
    return hmac.new(SESSION_KEY.encode(), f"{kind}:{pin}".encode(), hashlib.sha256).hexdigest()


def _credential_matches(provided: str, expected: str) -> bool:
    try:
        return hmac.compare_digest(provided, expected)
    except TypeError:
        # Legacy persisted PINs may contain non-ASCII digits. Do not normalize
        # or replace them, and never turn an invalid comparison into HTTP500.
        return False


def _authorized(request: Request | WebSocket, kind: str) -> bool:
    cookie = request.cookies.get(COOKIE_NAME, "")
    provided = request.query_params.get("pin", "")
    # These are the selected Relay credential values, not arbitrary app cookies.
    # Reject malformed text even when the other credential would authorize it.
    if not cookie.isascii() or not provided.isascii():
        return False
    if cookie and _credential_matches(cookie, _cookie_value(kind)):
        return True
    return bool(provided and _credential_matches(provided, _pin_for_kind(kind)))


def _ws_authorized(websocket: WebSocket, kind: str) -> bool:
    return _authorized(websocket, kind)


def _private_ok(ip: str) -> bool:
    # 过滤 127.x、docker 内网段（172.16-31.x）、CGNAT/Tailscale（100.64-127.x）与
    # 链路本地（169.254.x）；保留常见的家用/云主机 LAN 段（10.x、192.168.x、172.x 之外的私网）
    parts = [int(part) for part in ip.split(".")[:2] if part.isdigit()]
    if len(parts) < 2:
        return False
    first, second = parts
    if first == 127 or first == 169 or first == 0:
        return False
    if first == 172 and 16 <= second <= 31:
        return False
    if first == 100 and 64 <= second <= 127:
        return False
    return True


def _lan_ipv4s() -> list[str]:
    if settings.lan_host:
        return [settings.lan_host]
    addresses: list[str] = []
    try:
        for info in socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET):
            ip = info[4][0]
            if _private_ok(ip) and ip not in addresses:
                addresses.append(ip)
    except OSError:
        pass
    return addresses


_LOCAL_AUTHORITY = re.compile(r"\A(localhost|127\.0\.0\.1|\[::1\])(?::([0-9]{1,5}))?\Z", re.I | re.ASCII)


def _local_authority(value: str) -> tuple[str, int | None] | None:
    match = _LOCAL_AUTHORITY.fullmatch(value)
    if match is None:
        return None
    port = int(match[2]) if match[2] is not None else None
    if port is not None and port > 65535:
        return None
    return match[1].lower(), port


def _rpc_allowed(request: Request) -> bool:
    if settings.rpc_secret:
        tokens = request.headers.getlist("x-pocket-rpc-token")
        try:
            return len(tokens) == 1 and hmac.compare_digest(tokens[0], settings.rpc_secret)
        except TypeError:  # Non-ASCII untrusted header values are invalid credentials.
            return False
    client = request.client.host if request.client else ""
    if client not in {"127.0.0.1", "::1", "localhost"}:
        return False
    hosts = request.headers.getlist("host")
    authority = _local_authority(hosts[0]) if len(hosts) == 1 else None
    if authority is None:
        return False
    origins = request.headers.getlist("origin")
    if not origins:  # Preserve local command-line and API clients.
        return True
    if len(origins) != 1:
        return False
    scheme, separator, origin_host = origins[0].partition("://")
    scheme = scheme.lower()
    origin = _local_authority(origin_host) if separator and scheme in {"http", "https"} else None
    request_scheme = request.scope.get("scheme", "http").lower()
    if origin is None or scheme != request_scheme:
        return False
    default_port = 443 if scheme == "https" else 80
    origin_port = origin[1] if origin[1] is not None else default_port
    request_port = authority[1] if authority[1] is not None else default_port
    return origin[0] == authority[0] and origin_port == request_port


def _pin_gate_html(kind: str) -> str:
    label = "公网访问密码" if kind == "public" else "局域网访问密码"
    return (
        '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
        '<title>PureGamma AI 访问验证</title></head>'
        '<body style="font-family:system-ui;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#101216;color:#f5f6f8">'
        '<form method="get" style="text-align:center">'
        '<h2 style="margin-bottom:12px;font-weight:600">PureGamma AI</h2>'
        f'<p style="color:#a2a4a6;margin:0 0 16px">请输入{label}（8 位数字）</p>'
        '<input name="pin" inputmode="numeric" pattern="[0-9]{8}" maxlength="8" autofocus '
        'style="font-size:20px;padding:10px 14px;border-radius:10px;border:1px solid #3a3d44;background:#191c22;color:#f5f6f8;text-align:center;letter-spacing:4px" />'
        '<button type="submit" style="margin-left:10px;font-size:16px;padding:10px 18px;border-radius:10px;border:0;background:#d6b35a;color:#101216;font-weight:600;cursor:pointer">进入</button>'
        '</form></body></html>'
    )


async def _close_upstream(client: httpx.AsyncClient, upstream: httpx.Response | None = None) -> None:
    # Disconnects cancel the response task; cleanup still owns both resources.
    with anyio.CancelScope(shield=True):
        try:
            if upstream is not None:
                await upstream.aclose()
        finally:
            await client.aclose()


class _UpstreamStreamingResponse(StreamingResponse):
    def __init__(self, upstream: httpx.Response, client: httpx.AsyncClient):
        super().__init__(upstream.aiter_bytes(), status_code=upstream.status_code)
        self.upstream = upstream
        self.client = client
        # Preserve repeated Set-Cookie fields and require lowercase ASGI names.
        self.raw_headers = [
            (key.lower(), value)
            for key, value in upstream.headers.raw
            if key.lower() not in {
                b"content-length", b"transfer-encoding", b"connection",
                b"content-encoding", b"keep-alive",
            }
        ]

    async def __call__(self, scope, receive, send) -> None:
        try:
            await super().__call__(scope, receive, send)
        finally:
            await _close_upstream(self.client, self.upstream)


def _request_path(request: Request) -> str:
    """Use the ASGI application path with the router's mount-prefix semantics."""
    path = request.scope["path"]
    root_path = request.scope.get("root_path", "")
    if root_path and path.startswith(root_path):
        relative = path[len(root_path):]
        if not relative or relative.startswith("/"):
            return relative
    return path


def _strip_raw_prefix(raw_path: bytes, prefix: str) -> bytes | None:
    """Remove a decoded mount prefix while retaining the remaining wire bytes."""
    offset = 0
    for value in prefix.encode("utf-8"):
        token = raw_path[offset:offset + 1]
        width = 1
        if token == b"%":
            token = unquote_to_bytes(raw_path[offset:offset + 3])
            width = 3
        if token != bytes([value]):
            return None
        offset += width
    return raw_path[offset:]


def _upstream_url(request: Request) -> httpx.URL:
    path = _request_path(request)
    raw_path = request.scope.get("raw_path")
    if raw_path is not None and path != request.scope["path"]:
        raw_path = _strip_raw_prefix(raw_path, request.scope["root_path"])
    safe = "/:@!$&'()*+,;=-._~"
    if raw_path is None:
        encoded_path = quote(path, safe=safe)
    else:
        encoded_path = quote_from_bytes(raw_path, safe=safe + "%")
    if not encoded_path.startswith("/"):
        encoded_path = "/" + encoded_path
    base = httpx.URL(settings.web_target)
    base_path = base.raw_path.split(b"?", 1)[0].decode("ascii").rstrip("/")
    # Copy path/query components, never resolve the incoming path as a URL.
    return base.copy_with(
        path=base_path + encoded_path,
        query=request.scope.get("query_string", b"") or None,
        fragment=None,
    )


async def _proxy_http(request: Request) -> Response:
    target = _upstream_url(request)
    headers = {
        key: value for key, value in request.headers.items()
        if key.lower() not in {"host", "content-length", "connection", "accept-encoding"}
    }
    headers["x-forwarded-host"] = request.headers.get("host", "")
    headers["x-forwarded-proto"] = "https" if request.headers.get("host", "").endswith("trycloudflare.com") else "http"
    body = await request.body()
    client = httpx.AsyncClient(
        timeout=httpx.Timeout(connect=10, read=120, write=30, pool=10),
        follow_redirects=False,
        trust_env=False,
    )
    upstream = None
    try:
        upstream_request = client.build_request(request.method, target, headers=headers, content=body or None)
        upstream = await client.send(upstream_request, stream=True)
        return _UpstreamStreamingResponse(upstream, client)
    except httpx.HTTPError as exc:
        await _close_upstream(client, upstream)
        return JSONResponse({"detail": "upstream unavailable", "error": str(exc)[:200]}, status_code=502)
    except BaseException:
        await _close_upstream(client, upstream)
        raise


class ProxyMiddleware(BaseHTTPMiddleware):
    """所有未保留路径的 HTTP 请求：先 PIN 鉴权，再反向代理到 puregamma web。"""

    async def dispatch(self, request: Request, call_next):
        if _request_path(request).startswith(RESERVED_PREFIXES):
            return await call_next(request)
        if request.method not in settings.allowed_methods:
            return JSONResponse({"detail": "method not allowed"}, status_code=405)
        kind = _kind_for_host(request.headers.get("host", "").split(":")[0])
        provided = request.query_params.get("pin", "")
        authorized = _authorized(request, kind)
        if authorized and provided and _credential_matches(provided, _pin_for_kind(kind)):
            # Bind to the PIN just verified, before awaiting the upstream. A PIN
            # rotated during that wait must not issue a session for its successor.
            session_cookie = _cookie_value(kind, provided)
            response = await _proxy_http(request)
            response.set_cookie(COOKIE_NAME, session_cookie, max_age=COOKIE_MAX_AGE, httponly=True, samesite="lax")
            return response
        if authorized:
            return await _proxy_http(request)
        accept = request.headers.get("accept", "")
        if "text/html" in accept:
            return HTMLResponse(_pin_gate_html(kind), status_code=401)
        return JSONResponse({"detail": "PIN required"}, status_code=401)


@asynccontextmanager
async def _lifespan(_: FastAPI):
    auto_recover(manager)
    yield


app = FastAPI(lifespan=_lifespan, title="PureGamma Pocket Relay")
app.add_middleware(ProxyMiddleware)


@app.get("/health")
async def health() -> dict:
    return {"ok": True, "target": settings.web_target, "tunnel": manager.status()}


# ---------- RPC（管理面：默认仅本机，或 rpc_secret） ----------

def _require_rpc(request: Request) -> None:
    if not _rpc_allowed(request):
        from fastapi import HTTPException
        raise HTTPException(status_code=403, detail="RPC not allowed from this host")


@app.get("/rpc/status")
async def rpc_status(request: Request) -> dict:
    _require_rpc(request)
    tunnel = manager.status()
    return {
        "target": settings.web_target,
        "port": settings.port,
        # SaaS：删除局域网（LAN）段——云主机无家庭 LAN，且本地 IP 链接会暴露服务器地址。
        "public": {
            "running": bool(tunnel["running"]),
            "url": tunnel["public_url"],
            "pin": get_public_pin(),
            "custom": pin_is_custom("public"),
            "auto_start": was_auto_start(),
            "last_error": tunnel["last_error"],
        },
        "session": {"restart_requires_relogin": True},
    }


@app.post("/rpc/tunnel/start")
async def rpc_tunnel_start(request: Request) -> dict:
    _require_rpc(request)
    rotate_public_pin()
    save_auto_start(True)
    url = manager.start()
    return {"running": bool(url), "url": url, "pin": get_public_pin(), "last_error": manager.status()["last_error"]}


@app.post("/rpc/tunnel/stop")
async def rpc_tunnel_stop(request: Request) -> dict:
    _require_rpc(request)
    save_auto_start(False)
    manager.stop()
    return {"running": False}


@app.post("/rpc/pin/rotate")
async def rpc_pin_rotate(request: Request) -> dict:
    _require_rpc(request)
    body = await request.json()
    which = str(body.get("which", "public"))
    if which == "public":
        value = rotate_public_pin()
    elif which == "lan":
        value = refresh_lan_pin()
    else:
        return JSONResponse({"detail": "unknown kind"}, status_code=400)
    return {which: value}


@app.post("/rpc/pin/custom")
async def rpc_pin_custom(request: Request) -> dict:
    _require_rpc(request)
    body = await request.json()
    try:
        value = set_custom_pin(str(body.get("which", "")), str(body.get("pin", "")))
    except ValueError as exc:
        return JSONResponse({"detail": str(exc)}, status_code=400)
    return {str(body.get("which")): value}


@app.get("/rpc/qr")
async def rpc_qr(request: Request, kind: str = "lan", host: str = "") -> Response:
    _require_rpc(request)
    if kind != "public":
        return JSONResponse({"detail": "LAN access is disabled on this deployment"}, status_code=400)
    url = manager.status().get("public_url") or ""
    if not url:
        return JSONResponse({"detail": "no URL available"}, status_code=400)
    return Response(content=make_qr(url), media_type="image/png")


# ---------- 内置「手机访问」控制页（独立可用；接入 apps/web 后由前端面板替代） ----------

_POCKET_UI = """<!doctype html><html lang="zh"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>PureGamma 手机访问</title>
<style>
body{font-family:system-ui;background:#101216;color:#f5f6f8;margin:0;padding:24px;max-width:720px;margin:0 auto}
h1{font-size:20px}h2{font-size:15px;margin:20px 0 8px}.card{background:#191c22;border:1px solid #2a2d34;border-radius:14px;padding:16px;margin-bottom:12px}
.row{display:flex;align-items:center;gap:12px;flex-wrap:wrap}.muted{color:#a2a4a6;font-size:13px}
.pin{font-size:26px;letter-spacing:6px;font-weight:600;color:#d6b35a}button{background:#d6b35a;color:#101216;border:0;border-radius:8px;padding:8px 14px;font-weight:600;cursor:pointer;font-size:13px}
button.secondary{background:#2a2d34;color:#f5f6f8}img{border-radius:10px;background:#fff;padding:6px}a{color:#7fb3ff}
input{background:#101216;color:#f5f6f8;border:1px solid #3a3d44;border-radius:8px;padding:9px;min-width:220px}button:disabled{opacity:.5;cursor:default}[hidden]{display:none!important}
</style></head><body>
<h1>📱 手机访问</h1>
<form class="card" id="rpc-key-form" hidden onsubmit="unlock(event)">
<label for="rpc-key">管理密钥</label>
<p class="muted">填写服务配置的 POCKET_RPC_SECRET。密钥仅用于当前页面，不会写入网址或浏览器存储。如未配置密钥，请使用本机地址访问。</p>
<div class="row"><input id="rpc-key" type="password" autocomplete="off" required><button type="submit">连接管理接口</button></div>
</form>
<p class="muted" id="rpc-message" role="status" aria-live="polite"></p>

<div class="card"><h2>🌐 公网（cloudflared 隧道）</h2>
<div class="row"><button id="tunnel-btn" onclick="toggleTunnel()" disabled>开启公网访问</button><span class="muted" id="tunnel-state">等待状态</span></div>
<div class="row" style="margin-top:10px"><img id="pub-qr" alt="公网访问二维码" hidden><div>
<div class="pin" id="pub-pin">—</div><div class="muted" id="pub-url"></div>
<div class="row" style="margin-top:8px"><button class="secondary" id="rotate-btn" onclick="rot('public')" disabled>刷新密码</button></div></div></div></div>
<div class="card muted">目标：<span id="target"></span> · 服务重启后手机需重新输入密码 · RPC 仅本机/密钥</div>
<script>
const el=(id)=>document.getElementById(id);
let rpcToken='', qrObjectUrl=null;
function actionsDisabled(value){el('tunnel-btn').disabled=value;el('rotate-btn').disabled=value;}
function clearQr(){
  if(qrObjectUrl)URL.revokeObjectURL(qrObjectUrl);
  qrObjectUrl=null;el('pub-qr').removeAttribute('src');el('pub-qr').hidden=true;
}
function showError(error){
  clearQr();actionsDisabled(true);el('pub-pin').textContent='—';el('pub-url').textContent='';
  el('target').textContent='';el('tunnel-state').textContent='无法读取状态';
  el('rpc-message').textContent=error.message||'管理接口连接失败，请刷新页面重试。';
}
async function rpc(path,options={}){
  const headers=new Headers(options.headers||{});
  if(rpcToken)headers.set('x-pocket-rpc-token',rpcToken);
  const response=await fetch(path,{...options,headers,mode:'same-origin',redirect:'error',cache:'no-store'});
  if(!response.ok){
    if(response.status===403){
      rpcToken='';el('rpc-key-form').hidden=false;
      throw new Error('管理访问被拒绝。请填写管理密钥；未配置密钥时请使用本机地址。');
    }
    throw new Error('管理接口请求失败（'+response.status+'），请刷新页面重试。');
  }
  return response;
}
async function load(){
  const status=await(await rpc('/rpc/status')).json();
  let nextQr=null;
  if(status.public.running)nextQr=URL.createObjectURL(await(await rpc('/rpc/qr?kind=public')).blob());
  clearQr();qrObjectUrl=nextQr;
  if(nextQr){el('pub-qr').src=nextQr;el('pub-qr').hidden=false;}
  el('pub-pin').textContent=status.public.pin;
  el('tunnel-state').textContent=status.public.running?('运行中 '+status.public.url):'未开启';
  el('tunnel-btn').textContent=status.public.running?'关闭公网访问':'开启公网访问';
  el('pub-url').textContent=status.public.running?status.public.url:'';
  el('target').textContent=status.target;el('rpc-key-form').hidden=true;
  el('rpc-message').textContent=rpcToken?'管理密钥仅保留在此页面，关闭页面后需重新填写。':'';
  actionsDisabled(false);
}
async function unlock(event){
  event.preventDefault();rpcToken=el('rpc-key').value;el('rpc-key').value='';
  try{await load();}catch(error){showError(error);}
}
async function toggleTunnel(){
  actionsDisabled(true);
  try{
    const status=await(await rpc('/rpc/status')).json();
    await rpc('/rpc/tunnel/'+(status.public.running?'stop':'start'),{method:'POST'});
    await load();
  }catch(error){showError(error);}
}
async function rot(which){
  actionsDisabled(true);
  try{
    await rpc('/rpc/pin/rotate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({which})});
    await load();
  }catch(error){showError(error);}
}
window.addEventListener('beforeunload',clearQr);
load().catch(showError);
</script></body></html>"""


@app.get("/_pocket", response_class=HTMLResponse)
async def pocket_ui() -> str:
    return _POCKET_UI


# ---------- WebSocket 透传 ----------

@app.websocket("/{path:path}")
async def ws_proxy(websocket: WebSocket, path: str):
    host = websocket.headers.get("host", "").split(":")[0]
    kind = _kind_for_host(host)
    if not _ws_authorized(websocket, kind):
        await websocket.close(code=4403)
        return
    await websocket.accept()
    scheme = "wss" if settings.web_target.startswith("https") else "ws"
    target_host = settings.web_target.split("://", 1)[1]
    target_uri = f"{scheme}://{target_host}/{path}"
    query = str(websocket.query_params)
    if query:
        target_uri += "?" + query
    try:
        async with wsclient.connect(target_uri) as upstream:
            async def client_to_upstream():
                while True:
                    message = await websocket.receive()
                    if message["type"] == "websocket.disconnect":
                        break
                    if message.get("text") is not None:
                        await upstream.send(message["text"])
                    elif message.get("bytes") is not None:
                        await upstream.send(message["bytes"])
            async def upstream_to_client():
                async for message in upstream:
                    if isinstance(message, str):
                        await websocket.send_text(message)
                    else:
                        await websocket.send_bytes(message)
            await asyncio.gather(client_to_upstream(), upstream_to_client())
    except Exception:
        try:
            await websocket.close(code=1011)
        except Exception:
            pass
