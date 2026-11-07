from apps.api.config import Settings
from apps.api.routers import apple_auth
from packages.database.models import User, UserIdentity
from tests.conftest import auth_headers


def test_apple_link_discards_unverified_local_credentials(api_client, db, user_factory, monkeypatch):
    from apps.api.dependencies import create_access_token
    from packages.database.models import utcnow
    from packages.security.passwords import hash_password

    settings = apple_settings()
    user = user_factory("apple-preclaimed@example.com")
    user.password_hash = hash_password("AttackerPassword7")
    user.password_reset_token = "old-reset-digest"
    user.password_reset_token_expires_at = utcnow()
    user.email_verification_token = "old-verification-digest"
    user.email_verification_token_expires_at = utcnow()
    db.commit()
    old_token = create_access_token(user)
    monkeypatch.setattr(apple_auth, "get_settings", lambda: settings)
    monkeypatch.setattr(apple_auth, "_verify_apple_identity_token", lambda *args: {
        "sub": "apple-verified-owner", "email": user.email, "email_verified": True,
    })
    monkeypatch.setattr(apple_auth, "_exchange_authorization_code", lambda *args: {
        "id_token": "exchanged-token", "refresh_token": "server-refresh-token",
    })

    response = api_client.post("/auth/mobile/apple/exchange", json={
        "identity_token": "x" * 80, "authorization_code": "apple-code", "nonce": "n" * 40,
    })

    assert response.status_code == 200
    db.refresh(user)
    assert user.email_verified_at is not None
    assert user.password_hash is None
    assert user.password_reset_token is None
    assert user.password_reset_token_expires_at is None
    assert user.email_verification_token is None
    assert user.email_verification_token_expires_at is None
    assert api_client.get("/me", headers={"Authorization": f"Bearer {old_token}"}).status_code == 401
    login = api_client.post("/auth/mobile/email/login", json={
        "email": user.email, "password": "AttackerPassword7",
    })
    assert login.status_code == 401


def test_apple_link_preserves_verified_local_password(db, user_factory):
    from packages.database.models import utcnow
    from packages.security.passwords import hash_password

    settings = apple_settings()
    user = user_factory("apple-established@example.com")
    user.email_verified_at = utcnow()
    user.password_hash = hash_password("OwnerPassword7")
    old_hash = user.password_hash
    db.commit()

    linked = apple_auth.upsert_apple_user(db, {
        "sub": "apple-established-owner", "email": user.email, "email_verified": True,
    }, apple_auth.AppleExchangeRequest(
        identity_token="x" * 80, authorization_code="apple-code", nonce="n" * 40,
    ), "server-refresh-token", settings)

    assert linked.id == user.id
    assert linked.password_hash == old_hash


def apple_settings() -> Settings:
    return Settings(
        apple_auth_enabled=True,
        apple_client_id="ai.puregamma.ios",
        apple_team_id="APPLE_TEAM",
        apple_key_id="APPLE_KEY",
        apple_private_key="test-key",
        encryption_master_key="0123456789abcdef0123456789abcdef",
    )


def test_mobile_apple_exchange_is_fail_closed_when_disabled(api_client, monkeypatch):
    monkeypatch.setattr(apple_auth, "get_settings", lambda: Settings(apple_auth_enabled=False))

    response = api_client.post(
        "/auth/mobile/apple/exchange",
        json={
            "identity_token": "x" * 80,
            "authorization_code": "apple-code",
            "nonce": "n" * 40,
        },
    )

    assert response.status_code == 503
    assert response.json()["detail"]["code"] == "APPLE_AUTH_DISABLED"


def test_mobile_apple_exchange_links_verified_identity(api_client, db, monkeypatch):
    settings = apple_settings()
    monkeypatch.setattr(apple_auth, "get_settings", lambda: settings)
    monkeypatch.setattr(
        apple_auth,
        "_verify_apple_identity_token",
        lambda token, nonce, current: {
            "sub": "apple-private-subject",
            "email": "private@privaterelay.appleid.com",
            "email_verified": "true",
            "nonce": apple_auth._apple_nonce(nonce),
        },
    )
    monkeypatch.setattr(
        apple_auth,
        "_exchange_authorization_code",
        lambda code, current: {
            "id_token": "exchanged-apple-identity-token",
            "refresh_token": "server-only-refresh-token",
        },
    )

    response = api_client.post(
        "/auth/mobile/apple/exchange",
        json={
            "identity_token": "x" * 80,
            "authorization_code": "apple-code",
            "nonce": "n" * 40,
            "given_name": "Private",
            "family_name": "User",
        },
    )

    assert response.status_code == 200
    token = response.json()["access_token"]
    assert api_client.get("/me", headers={"Authorization": f"Bearer {token}"}).status_code == 200
    identity = db.query(UserIdentity).filter_by(provider="apple", provider_subject="apple-private-subject").one()
    assert identity.provider_email_verified is True
    assert identity.credential_ciphertext
    assert "server-only-refresh-token" not in str(identity.credential_ciphertext)


def test_account_deletion_requires_email_and_removes_user(api_client, db, normal_user):
    user_id = normal_user.id
    email = normal_user.email
    headers = auth_headers(normal_user)
    mismatch = api_client.request("DELETE", "/me", headers=headers, json={"confirmation": "wrong@example.com"})
    assert mismatch.status_code == 400
    assert db.get(User, user_id) is not None

    deleted = api_client.request("DELETE", "/me", headers=headers, json={"confirmation": email.upper()})
    assert deleted.status_code == 200
    assert deleted.json() == {"ok": True}
    assert db.get(User, user_id) is None
    assert api_client.get("/me", headers=headers).status_code == 401


def test_account_deletion_revokes_apple_identity(api_client, db, normal_user, monkeypatch):
    settings = apple_settings()
    identity = UserIdentity(
        user_id=normal_user.id,
        provider="apple",
        provider_subject="apple-delete-subject",
        provider_email=normal_user.email,
        provider_email_verified=True,
        credential_ciphertext={"encrypted": "server-only"},
    )
    db.add(identity)
    db.commit()
    revoked: list[str] = []
    monkeypatch.setattr("apps.api.routers.auth.get_settings", lambda: settings)
    monkeypatch.setattr(apple_auth, "revoke_apple_identity", lambda item, current: revoked.append(item.provider_subject))

    response = api_client.request(
        "DELETE",
        "/me",
        headers=auth_headers(normal_user),
        json={"confirmation": normal_user.email},
    )

    assert response.status_code == 200
    assert revoked == ["apple-delete-subject"]
