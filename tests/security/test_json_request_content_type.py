from __future__ import annotations

import json

import pytest

from packages.database.models import AgentConversation
from tests.conftest import auth_headers


@pytest.mark.parametrize("content_type,expected_status", [
    (None, 422),
    ("text/plain", 422),
    ("multipart/form-data; boundary=offline-contract", 422),
    ("application/json", 200),
    ("application/json; charset=utf-8", 200),
    ("application/problem+json", 200),
])
def test_json_model_route_enforces_content_type(
    api_client, db, normal_user, content_type, expected_status
):
    title = "Offline JSON content-type contract"
    if content_type and content_type.startswith("multipart/"):
        body = (
            '--offline-contract\r\nContent-Disposition: form-data; name="title"\r\n'
            f"\r\n{title}\r\n--offline-contract--\r\n"
        ).encode()
    else:
        body = json.dumps({"title": title}).encode()
    headers = auth_headers(normal_user)
    if content_type:
        headers["content-type"] = content_type

    response = api_client.post("/api/agent/conversations", content=body, headers=headers)

    assert response.status_code == expected_status
    count = db.query(AgentConversation).filter_by(user_id=normal_user.id, title=title).count()
    if expected_status == 200:
        assert response.json()["conversation"]["title"] == title
        assert count == 1
    else:
        assert response.json()["detail"][0]["loc"] == ["body"]
        assert count == 0
