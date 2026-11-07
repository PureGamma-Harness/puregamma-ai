from urllib.parse import parse_qs, urlparse

from apps.api.config import Settings
from apps.api.routers import mobile_auth
from packages.database.models import MobileOAuthSession


def test_mobile_email_registration_requires_verification(api_client, db, monkeypatch):
    from apps.api.routers import email_auth
    from packages.database.models import User

    sent = []
    monkeypatch.setattr(email_auth, "send_email", lambda **message: sent.append(message) or True)
    registration = {"email": "unproven@example.com", "password": "StrongPassword7", "name": "New User"}
    response = api_client.post("/auth/mobile/email/register", json=registration)

    assert response.status_code == 202
    assert response.json()["verification_required"] is True
    assert response.json()["email_sent"] is True
    assert "access_token" not in response.json()
    assert "pg_session" not in response.cookies
    user = db.query(User).filter_by(email=registration["email"]).one()
    assert user.email_verified_at is None
    assert user.last_login_at is None
    assert len(sent) == 1
    assert api_client.post("/auth/mobile/email/login", json=registration).status_code == 403
    assert api_client.post("/auth/email/login", json=registration).status_code == 403

    import re
    verification_token = re.search(r"verify-email\?token=([^\s]+)", sent[0]["body"]).group(1)
    assert verification_token != user.email_verification_token
    verified = api_client.post("/auth/email/verify", json={"token": verification_token})
    assert verified.status_code == 200
    login = api_client.post("/auth/mobile/email/login", json=registration)
    assert login.status_code == 200
    assert login.json()["access_token"]


def test_mobile_email_registration_rolls_back_when_production_email_fails(api_client, db, monkeypatch):
    from apps.api.routers import email_auth
    from packages.database.models import User

    monkeypatch.setattr(mobile_auth, "get_settings", lambda: Settings(app_environment="production"))
    monkeypatch.setattr(mobile_auth, "_email_rate_limit", lambda *args, **kwargs: None)
    monkeypatch.setattr(email_auth, "send_email", lambda **message: False)

    response = api_client.post("/auth/mobile/email/register", json={
        "email": "smtp-failed@example.com", "password": "StrongPassword7", "name": "New User",
    })

    assert response.status_code == 503
    assert response.json()["detail"]["code"] == "VERIFICATION_EMAIL_FAILED"
    assert "access_token" not in response.json()
    assert db.query(User).filter_by(email="smtp-failed@example.com").one_or_none() is None


def test_google_link_discards_unverified_local_credentials(db, user_factory):
    from apps.api.routers.google_auth import upsert_google_user
    from packages.database.models import utcnow
    from packages.security.passwords import hash_password

    user = user_factory("google-preclaimed@example.com")
    user.password_hash = hash_password("AttackerPassword7")
    user.password_reset_token = "old-reset-digest"
    user.password_reset_token_expires_at = utcnow()
    user.email_verification_token = "old-verification-digest"
    user.email_verification_token_expires_at = utcnow()
    db.commit()

    linked = upsert_google_user(db, {
        "sub": "google-verified-owner", "email": user.email, "email_verified": True,
    })

    assert linked.id == user.id
    assert linked.email_verified_at is not None
    assert linked.password_hash is None
    assert linked.password_reset_token is None
    assert linked.password_reset_token_expires_at is None
    assert linked.email_verification_token is None
    assert linked.email_verification_token_expires_at is None


def test_google_link_preserves_verified_local_password(db, user_factory):
    from apps.api.routers.google_auth import upsert_google_user
    from packages.database.models import utcnow
    from packages.security.passwords import hash_password

    user = user_factory("google-established@example.com")
    user.email_verified_at = utcnow()
    user.password_hash = hash_password("OwnerPassword7")
    old_hash = user.password_hash
    db.commit()

    linked = upsert_google_user(db, {
        "sub": "google-established-owner", "email": user.email, "email_verified": True,
    })

    assert linked.id == user.id
    assert linked.password_hash == old_hash


def mobile_settings() -> Settings:
    return Settings(
        google_client_id="google-client",
        google_client_secret="google-secret",
        mobile_google_oauth_redirect_uri="https://api.example.com/auth/mobile/google/callback",
        mobile_oauth_redirect_uris=("puregamma://oauth/callback",),
    )


def test_mobile_google_pkce_exchange_is_single_use(api_client, db, monkeypatch):
    monkeypatch.setattr(mobile_auth, "get_settings", mobile_settings)
    monkeypatch.setattr(mobile_auth, "_exchange_code_for_token", lambda *args: {"id_token": "id-token"})
    holder = {"nonce": ""}
    monkeypatch.setattr(mobile_auth, "_verify_google_id_token", lambda token, client_id: {"sub": "ios-google-sub", "email": "ios@example.com", "name": "iOS User", "email_verified": True, "nonce": holder["nonce"]})
    verifier = "v" * 64
    nonce = "n" * 40
    client_state = "s" * 40
    start = api_client.post("/auth/mobile/google/start", json={"redirect_uri": "puregamma://oauth/callback", "code_challenge": mobile_auth._challenge(verifier), "client_state": client_state, "nonce": nonce})
    assert start.status_code == 200
    state = parse_qs(urlparse(start.json()["auth_url"]).query)["state"][0]
    holder["nonce"] = db.query(MobileOAuthSession).filter_by(state=state).one().provider_nonce
    callback = api_client.get(f"/auth/mobile/google/callback?code=google-code&state={state}", follow_redirects=False)
    assert callback.status_code == 302
    query = parse_qs(urlparse(callback.headers["location"]).query)
    assert query["state"][0] == client_state
    from apps.api.dependencies import create_access_token
    from packages.database.models import User

    oauth_session = db.query(MobileOAuthSession).filter_by(state=state).one()
    old_token = create_access_token(db.get(User, oauth_session.user_id))
    exchange = api_client.post("/auth/mobile/google/exchange", json={"code": query["code"][0], "code_verifier": verifier, "nonce": nonce})
    assert exchange.status_code == 200
    assert exchange.json()["token_type"] == "bearer"
    token = exchange.json()["access_token"]
    assert api_client.get("/me", headers={"Authorization": f"Bearer {token}"}).status_code == 200
    assert api_client.get("/me", headers={"Authorization": f"Bearer {old_token}"}).status_code == 401
    assert api_client.post("/auth/mobile/google/exchange", json={"code": query["code"][0], "code_verifier": verifier, "nonce": nonce}).status_code == 400


def test_mobile_google_rejects_unlisted_redirect(api_client, monkeypatch):
    monkeypatch.setattr(mobile_auth, "get_settings", mobile_settings)
    response = api_client.post("/auth/mobile/google/start", json={"redirect_uri": "attacker://callback", "code_challenge": "a" * 43, "client_state": "s" * 40, "nonce": "n" * 40})
    assert response.status_code == 400


def test_mobile_google_cancel_returns_to_allowlisted_app(api_client, monkeypatch):
    monkeypatch.setattr(mobile_auth, "get_settings", mobile_settings)
    start = api_client.post("/auth/mobile/google/start", json={"redirect_uri": "puregamma://oauth/callback", "code_challenge": "a" * 43, "client_state": "s" * 40, "nonce": "n" * 40})
    state = parse_qs(urlparse(start.json()["auth_url"]).query)["state"][0]
    callback = api_client.get(f"/auth/mobile/google/callback?error=access_denied&state={state}", follow_redirects=False)
    assert callback.status_code == 302
    query = parse_qs(urlparse(callback.headers["location"]).query)
    assert query == {"error": ["oauth_canceled"], "state": ["s" * 40]}
