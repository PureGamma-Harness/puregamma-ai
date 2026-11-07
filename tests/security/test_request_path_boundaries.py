from __future__ import annotations

from dataclasses import replace
import logging

from fastapi import FastAPI, Request, Response
from fastapi.testclient import TestClient
import pytest

from apps.api import main, redis_client


DEPLOYMENTS = [
    ("", ""),
    ("/gateway", "/gateway"),
    ("/gateway", ""),
]
SPOOFED_EXEMPT_HOSTS = [
    "api.test/health?",
    "api.test/ready?",
    "api.test/metrics?",
    "api.test/stripe/webhook?",
]


class RedisStub:
    def __init__(self):
        self.count = 1
        self.keys = []
        self.unavailable = False

    def pipeline(self, *, transaction):
        assert transaction is True
        if self.unavailable:
            raise ConnectionError("offline rate-limit backend unavailable")
        return self

    def incr(self, key):
        self.keys.append(key)
        return self

    def expire(self, key, ttl):
        assert ttl == 120
        return self

    def execute(self):
        return self.count, True


@pytest.fixture
def boundary_app(monkeypatch):
    settings = replace(
        main.settings,
        app_environment="production",
        cors_origins=("https://app.example.test",),
        api_rate_limit_per_minute=5,
        expensive_rate_limit_per_minute=1,
    )
    monkeypatch.setattr(main, "settings", settings)
    redis = RedisStub()
    monkeypatch.setattr(redis_client, "get_redis", lambda: redis)
    app = FastAPI()
    # Exercise the production middleware stack without business dependencies.
    app.middleware("http")(main.cookie_csrf_guard)
    app.middleware("http")(main.rate_limit)
    app.middleware("http")(main.request_trace)
    app.add_api_route("/health", main.health, methods=["GET"])

    @app.api_route("/{path:path}", methods=["GET", "POST"])
    async def endpoint(request: Request):
        if request.headers.get("x-test-raise"):
            raise RuntimeError("offline endpoint failure")
        return Response(status_code=204)

    return app, redis, settings


@pytest.mark.parametrize("root_path,prefix", DEPLOYMENTS)
@pytest.mark.parametrize("host", ["api.test/stripe/webhook?", "api.test/stripe/webhook#"])
def test_spoofed_webhook_host_cannot_bypass_cookie_csrf(boundary_app, root_path, prefix, host):
    app, redis, settings = boundary_app
    with TestClient(app, root_path=root_path) as client:
        client.cookies.set(settings.session_cookie_name, "fake-session")
        response = client.post(f"{prefix}/billing/checkout", headers={"host": host})

    assert response.status_code == 403
    assert response.json()["detail"]["code"] == "CSRF_ORIGIN_REJECTED"
    assert len(redis.keys) == 1


@pytest.mark.parametrize("host", SPOOFED_EXEMPT_HOSTS)
def test_spoofed_exempt_host_cannot_bypass_rate_limit(boundary_app, host):
    app, redis, _ = boundary_app
    redis.count = 6
    with TestClient(app) as client:
        response = client.get("/billing/checkout", headers={"host": host})

    assert response.status_code == 429
    assert response.headers["retry-after"] == "60"
    assert len(redis.keys) == 1
    assert redis.keys[0].startswith("pg:rate:general:")


@pytest.mark.parametrize("host", SPOOFED_EXEMPT_HOSTS)
def test_spoofed_exempt_host_cannot_bypass_unavailable_backend(boundary_app, host):
    app, redis, _ = boundary_app
    redis.unavailable = True
    with TestClient(app) as client:
        response = client.get("/billing/checkout", headers={"host": host})

    assert response.status_code == 503
    assert response.json()["detail"] == "Rate limit service unavailable"
    assert response.headers["retry-after"] == "10"


@pytest.mark.parametrize("path", [
    "/api/agent/chat", "/api/secretary/tasks", "/reports/daily", "/backtest/run",
    "/market/intelligence", "/options/analyze",
])
def test_host_cannot_hide_expensive_route_from_its_bucket(boundary_app, path):
    app, redis, _ = boundary_app
    redis.count = 2
    with TestClient(app) as client:
        response = client.get(path, headers={"host": "api.test/ordinary?"})

    assert response.status_code == 429
    assert redis.keys[0].startswith("pg:rate:expensive:")


@pytest.mark.parametrize("root_path,prefix", [("", ""), ("/agent", "/agent")])
def test_general_route_is_not_charged_to_host_or_mount_expensive_path(boundary_app, root_path, prefix):
    app, redis, _ = boundary_app
    redis.count = 2
    with TestClient(app, root_path=root_path) as client:
        response = client.get(f"{prefix}/billing/checkout", headers={"host": "api.test/agent/run?"})

    assert response.status_code == 204
    assert redis.keys[0].startswith("pg:rate:general:")


@pytest.mark.parametrize("root_path,prefix", DEPLOYMENTS)
@pytest.mark.parametrize("method,path", [
    ("GET", "/health"), ("GET", "/ready"), ("GET", "/metrics"), ("POST", "/stripe/webhook"),
])
def test_actual_exempt_route_stays_accessible_without_rate_backend(boundary_app, root_path, prefix, method, path):
    app, redis, settings = boundary_app
    redis.unavailable = True
    with TestClient(app, root_path=root_path) as client:
        client.cookies.set(settings.session_cookie_name, "fake-session")
        response = client.request(method, f"{prefix}{path}")

    assert response.status_code == (200 if path == "/health" else 204)
    assert redis.keys == []


@pytest.mark.parametrize("root_path,path,expected_path", [
    ("", "/billing/checkout", "/billing/checkout"),
    ("/gateway", "/gateway/billing/checkout", "/billing/checkout"),
    ("/gateway", "/billing/checkout", "/billing/checkout"),
    ("/gate", "/gateway/billing/checkout", "/gateway/billing/checkout"),
])
@pytest.mark.parametrize("fails", [False, True])
def test_trace_records_scope_route_path_for_success_and_failure(boundary_app, caplog, root_path, path, expected_path, fails):
    app, _, _ = boundary_app
    headers = {"host": "api.test/health?", "x-request-id": "path-boundary-test"}
    if fails:
        headers["x-test-raise"] = "yes"
    with caplog.at_level(logging.INFO, logger="puregamma.api"):
        with TestClient(app, root_path=root_path, raise_server_exceptions=False) as client:
            response = client.get(path, headers=headers)

    assert response.status_code == (500 if fails else 204)
    message = "request_failed" if fails else "request_completed"
    records = [record for record in caplog.records if record.message == message]
    assert len(records) == 1
    assert records[0].path == expected_path
    assert records[0].request_id == "path-boundary-test"
