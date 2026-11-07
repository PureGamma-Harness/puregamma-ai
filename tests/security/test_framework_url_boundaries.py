from __future__ import annotations

import pytest
from starlette.requests import Request


def request_for(path: str, host: str) -> Request:
    return Request({
        "type": "http",
        "scheme": "https",
        "server": ("api.test", 443),
        "path": path,
        "query_string": b"plan=pro",
        "headers": [(b"host", host.encode("ascii"))],
    })


@pytest.mark.parametrize("host", [
    "api.test/health?",
    "api.test/stripe/webhook#",
    "api.test?path=",
    "api.test#fragment",
])
def test_invalid_host_cannot_rewrite_request_url_path(host):
    url = request_for("/billing/checkout", host).url

    assert url.hostname == "api.test"
    assert url.path == "/billing/checkout"
    assert url.query == "plan=pro"
    assert url.fragment == ""


@pytest.mark.parametrize("path", ["@other.example", "@other.example/private"])
def test_unprefixed_request_target_cannot_replace_url_authority(path):
    url = request_for(path, "api.test").url

    assert url.hostname == "api.test"
    assert url.username is None
    assert url.password is None
    assert url.path == "/" + path
    assert url.query == "plan=pro"


@pytest.mark.parametrize("host,hostname,port", [
    ("api.test", "api.test", None),
    ("api.test:8443", "api.test", 8443),
    ("[::1]:8443", "::1", 8443),
])
def test_valid_host_preserves_normal_request_url(host, hostname, port):
    url = request_for("/billing/checkout", host).url

    assert url.hostname == hostname
    assert url.port == port
    assert url.path == "/billing/checkout"
    assert url.query == "plan=pro"
