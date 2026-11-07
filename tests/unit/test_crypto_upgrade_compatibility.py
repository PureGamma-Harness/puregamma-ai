"""Read synthetic persisted cryptography-49 data through real application helpers.

The fixture contains no production credentials or private signing keys. Its
intentionally weak, documented test keys must never be used by a deployment.
"""
from __future__ import annotations

import base64
from copy import deepcopy
from datetime import datetime
import json
from pathlib import Path
from types import SimpleNamespace

from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec
import jwt
import pytest

from apps.api.config import Settings
from apps.api.routers import apple_auth
from apps.api.services import portfolio_service
from packages.config.secret_store import SecretStore
from packages.live_trading import secret_store
from packages.notifications import apns


@pytest.fixture
def legacy():
    path = Path(__file__).parents[1] / "fixtures" / "cryptography49.json"
    return json.loads(path.read_text())


@pytest.fixture
def legacy_clock(legacy, monkeypatch):
    issued_at = legacy["issued_at"]

    class FixtureDateTime(datetime):
        @classmethod
        def now(cls, tz=None):
            return datetime.fromtimestamp(issued_at, tz=tz)

    # Replace only these module references, without changing the process clock.
    monkeypatch.setattr(apple_auth, "time", SimpleNamespace(time=lambda: issued_at))
    monkeypatch.setattr(apns, "time", SimpleNamespace(time=lambda: issued_at))
    monkeypatch.setattr(portfolio_service, "datetime", FixtureDateTime)
    monkeypatch.setattr(jwt.api_jwt, "datetime", FixtureDateTime)


def tampered_base64(value, *, urlsafe=True):
    decoded = bytearray(base64.urlsafe_b64decode(value + "=" * (-len(value) % 4)))
    decoded[-1] ^= 1
    encode = base64.urlsafe_b64encode if urlsafe else base64.b64encode
    return encode(decoded).decode()


def tampered_token(token):
    header, payload, signature = token.split(".")
    return f"{header}.{payload}.{tampered_base64(signature).rstrip('=')}"


def test_legacy_portfolio_fernet_token_remains_readable_and_authenticated(legacy, monkeypatch):
    data = legacy["fernet"]
    settings = Settings(portfolio_token_encryption_key=data["key"])
    monkeypatch.setattr(portfolio_service, "get_settings", lambda: settings)

    assert portfolio_service.decrypt_token(data["portfolio_ciphertext"]) == data["portfolio_plaintext"]
    with pytest.raises(RuntimeError, match="cannot be decrypted"):
        portfolio_service.decrypt_token(tampered_base64(data["portfolio_ciphertext"]))


@pytest.mark.parametrize("key_source", ["explicit", "derived"])
def test_legacy_broker_credentials_keep_both_key_derivation_paths(legacy, monkeypatch, key_source):
    data = legacy["fernet"]
    settings = Settings(
        live_credential_encryption_key=data["key"] if key_source == "explicit" else "",
        encryption_master_key=data["broker_master"],
    )
    monkeypatch.setattr(secret_store, "get_settings", lambda: settings)
    ciphertext = data[f"broker_{key_source}_ciphertext"]

    assert secret_store.decrypt_secrets(ciphertext) == data["broker_plaintext"]
    with pytest.raises(secret_store.SecretStoreError, match="cannot be decrypted"):
        secret_store.decrypt_secrets(tampered_base64(ciphertext))


def test_legacy_aesgcm_envelope_can_be_read_and_rotated_but_not_tampered(legacy):
    data = legacy["aesgcm"]
    store = SecretStore(data["key"])
    assert store.decrypt(data["envelope"]) == data["plaintext"]
    replacement = SecretStore("h" * 32, key_version="v2")
    rotated = store.rotate(data["envelope"], replacement)
    assert replacement.decrypt(rotated) == data["plaintext"]
    assert rotated["metadata"] == {"rotated_from": "v1"}

    altered = deepcopy(data["envelope"])
    altered["ciphertext"] = tampered_base64(altered["ciphertext"], urlsafe=False)
    with pytest.raises(InvalidTag):
        store.decrypt(altered)
    with pytest.raises(InvalidTag):
        SecretStore("h" * 32).decrypt(data["envelope"])
    with pytest.raises(ValueError, match="key version is not available"):
        replacement.decrypt(data["envelope"])


def test_legacy_apple_rsa_signature_uses_the_real_identity_verifier(legacy, legacy_clock, monkeypatch):
    data = legacy["apple"]
    monkeypatch.setattr(apple_auth, "_apple_jwks", lambda: [data["jwk"]])
    settings = Settings(apple_client_id=data["claims"]["aud"])

    assert apple_auth._verify_apple_identity_token(data["token"], data["nonce"], settings) == data["claims"]
    with pytest.raises(ValueError, match="verification failed"):
        apple_auth._verify_apple_identity_token(tampered_token(data["token"]), data["nonce"], settings)
    with pytest.raises(ValueError, match="verification failed"):
        apple_auth._verify_apple_identity_token(data["token"], "different-offline-nonce", settings)


def test_legacy_plaid_ec_webhook_retains_signature_and_body_checks(legacy, legacy_clock, monkeypatch):
    data = legacy["plaid"]
    response = SimpleNamespace(raise_for_status=lambda: None, json=lambda: {"key": legacy["ec"]["jwk"]})
    monkeypatch.setattr(portfolio_service, "_plaid_request", lambda *args, **kwargs: response)

    portfolio_service.verify_plaid_webhook(data["body"].encode(), data["token"])
    legacy_public_key = serialization.load_pem_public_key(legacy["ec"]["public_pem"].encode())
    assert jwt.decode(data["token"], legacy_public_key, algorithms=["ES256"])["iat"] == legacy["issued_at"]
    with pytest.raises(portfolio_service.PlaidWebhookVerificationError):
        portfolio_service.verify_plaid_webhook(data["body"].encode() + b"x", data["token"])
    with pytest.raises(portfolio_service.PlaidWebhookVerificationError):
        portfolio_service.verify_plaid_webhook(data["body"].encode(), tampered_token(data["token"]))


@pytest.mark.parametrize("provider", ["apple", "apns"])
def test_provider_ec_signatures_keep_interoperable_jose_format(legacy, legacy_clock, monkeypatch, provider):
    key = ec.generate_private_key(ec.SECP256R1())
    private_pem = key.private_bytes(
        serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption(),
    ).decode()
    public_key = key.public_key()
    settings = Settings(
        apple_team_id="OFFLINE_TEAM", apple_key_id="OFFLINE_KEY", apple_private_key=private_pem,
        apple_client_id="offline.puregamma.test", apns_team_id="OFFLINE_TEAM",
        apns_key_id="OFFLINE_KEY", apns_private_key=private_pem,
    )
    if provider == "apple":
        token = apple_auth._apple_client_secret(settings)
        claims = jwt.decode(token, public_key, algorithms=["ES256"], audience=apple_auth.APPLE_ISSUER)
        assert claims["sub"] == settings.apple_client_id
        assert claims["exp"] == legacy["issued_at"] + 300
    else:
        monkeypatch.setattr(apns, "get_settings", lambda: settings)
        token = apns.APNsProvider(None, [])._provider_token()
        claims = jwt.decode(token, public_key, algorithms=["ES256"])
    assert claims["iss"] == "OFFLINE_TEAM"
    assert claims["iat"] == legacy["issued_at"]
    assert jwt.get_unverified_header(token) == {"alg": "ES256", "kid": "OFFLINE_KEY"}
    with pytest.raises(jwt.InvalidSignatureError):
        jwt.decode(tampered_token(token), public_key, algorithms=["ES256"], options={"verify_aud": False})
