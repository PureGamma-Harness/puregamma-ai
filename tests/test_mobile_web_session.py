from datetime import timedelta
from urllib.parse import parse_qs, urlparse

from apps.api.routers import email_auth, mobile_auth
from packages.database.models import MobileWebSession, utcnow
from tests.conftest import auth_headers


def _handoff(api_client, user):
    response = api_client.post(
        "/auth/mobile/web-session",
        headers=auth_headers(user),
        json={"locale": "zh"},
    )
    assert response.status_code == 200
    return response.json()["handoff_path"]


def test_mobile_web_session_creates_cookie_once(api_client, normal_user):
    path = _handoff(api_client, normal_user)

    response = api_client.get(path, follow_redirects=False)

    assert response.status_code == 302
    assert response.headers["location"].endswith("/zh/dashboard")
    assert api_client.get("/me").json()["user"]["id"] == normal_user.id
    api_client.cookies.clear()
    replay = api_client.get(path, follow_redirects=False)
    assert replay.status_code == 400
    assert "set-cookie" not in replay.headers
    assert api_client.get("/me").status_code == 401


def test_mobile_web_session_cannot_restore_logged_out_session(api_client, normal_user):
    old_headers = auth_headers(normal_user)
    path = _handoff(api_client, normal_user)
    assert api_client.post("/auth/logout", headers=old_headers).status_code == 200
    assert api_client.get("/me", headers=old_headers).status_code == 401

    response = api_client.get(path, follow_redirects=False)

    assert response.status_code == 400
    assert response.json()["detail"]["code"] == "MOBILE_WEB_SESSION_INVALID"
    assert "set-cookie" not in response.headers
    assert api_client.get("/me").status_code == 401


def test_mobile_web_session_cannot_restore_session_after_password_reset(
    api_client, db, normal_user, monkeypatch
):
    token = "password-reset-proof-" + "r" * 40
    normal_user.password_reset_token = email_auth._token_digest(token)
    normal_user.password_reset_token_expires_at = utcnow() + timedelta(minutes=5)
    db.commit()
    path = _handoff(api_client, normal_user)
    monkeypatch.setattr(email_auth, "_send_password_changed_notice", lambda user: None)
    reset = api_client.post(
        "/auth/email/reset-password",
        json={"token": token, "password": "NewReviewPassword42"},
    )
    assert reset.status_code == 200
    api_client.cookies.clear()

    response = api_client.get(path, follow_redirects=False)

    assert response.status_code == 400
    assert "set-cookie" not in response.headers
    assert api_client.get("/me").status_code == 401


def test_mobile_web_session_rejects_legacy_unbound_code(api_client, db, normal_user):
    code = "legacy-random-handoff-code-without-session-version"
    db.add(
        MobileWebSession(
            code_hash=mobile_auth._hash(code),
            user_id=normal_user.id,
            locale="en",
            expires_at=utcnow() + timedelta(seconds=60),
        )
    )
    db.commit()

    response = api_client.get(
        "/auth/mobile/web-session/consume", params={"code": code}, follow_redirects=False
    )

    assert response.status_code == 400
    assert "set-cookie" not in response.headers
    assert api_client.get("/me").status_code == 401


def test_mobile_web_session_expired_code_cannot_create_cookie(api_client, db, normal_user):
    path = _handoff(api_client, normal_user)
    code = parse_qs(urlparse(path).query)["code"][0]
    row = db.query(MobileWebSession).filter_by(code_hash=mobile_auth._hash(code)).one()
    row.expires_at = utcnow() - timedelta(seconds=1)
    db.commit()

    response = api_client.get(path, follow_redirects=False)

    assert response.status_code == 400
    assert "set-cookie" not in response.headers
    assert api_client.get("/me").status_code == 401
