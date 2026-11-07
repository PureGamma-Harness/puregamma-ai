from __future__ import annotations

from apps.api.services.billing_service import mock_upgrade
from apps.api.services.notification_service import send_notification
from packages.database.models import CreditRefundEvent, CreditReservationRecord, NotificationDelivery
from packages.notifications.base import NotificationResult
from packages.notifications.dispatcher import NotificationDispatcher
from packages.notifications.imessage.webhook_gateway import compute_hmac, verify_hmac_signature


def _assert_mock_delivery_refunded(db, user, delivery, before):
    db.refresh(user)
    assert delivery.status == "skipped"
    assert delivery.provider_response == {"reason": "mock_recipient"}
    assert delivery.sent_at is None
    assert user.credit_balance == before
    reservation = db.query(CreditReservationRecord).filter_by(
        user_id=user.id,
        idempotency_key=f"notification-charge:{delivery.idempotency_key}:1",
    ).one()
    assert reservation.status == "REFUNDED"
    assert reservation.settled_credits == 0
    refund = db.query(CreditRefundEvent).filter_by(reservation_id=reservation.id).one()
    assert refund.reason == "NOTIFICATION_MOCK_RECIPIENT"
    assert refund.credits == reservation.reserved_credits


def _successful_provider(monkeypatch):
    calls = []

    class SuccessfulProvider:
        def send(self, recipient: str, message: str, idempotency_key: str) -> NotificationResult:
            calls.append((recipient, message, idempotency_key))
            return NotificationResult(True, "imessage", {"receipt": "offline-success"})

    monkeypatch.setattr(NotificationDispatcher, "_provider", lambda self, channel: SuccessfulProvider())
    return calls


def test_telegram_mock_send(db, demo_user):
    mock_upgrade(db, demo_user.id, "Pro")
    before = demo_user.credit_balance
    delivery = send_notification(db, demo_user.id, "telegram", "telegram test", {"idempotency_key": "tg-1"})
    _assert_mock_delivery_refunded(db, demo_user, delivery, before)


def test_slack_mock_send(db, demo_user):
    mock_upgrade(db, demo_user.id, "Max")
    before = demo_user.credit_balance
    delivery = send_notification(db, demo_user.id, "slack", "slack test", {"idempotency_key": "slack-1"})
    _assert_mock_delivery_refunded(db, demo_user, delivery, before)


def test_email_mock_send(db, demo_user):
    before = demo_user.credit_balance
    delivery = send_notification(db, demo_user.id, "email", "email test", {"idempotency_key": "email-1"})
    _assert_mock_delivery_refunded(db, demo_user, delivery, before)


def test_imessage_mock_send(db, demo_user):
    mock_upgrade(db, demo_user.id, "Max")
    before = demo_user.credit_balance
    delivery = send_notification(db, demo_user.id, "imessage", "iMessage test", {"idempotency_key": "imsg-1"})
    _assert_mock_delivery_refunded(db, demo_user, delivery, before)


def test_imessage_entitlement_denied_for_free(db, demo_user):
    delivery = send_notification(db, demo_user.id, "imessage", "blocked", {"idempotency_key": "imsg-free"})
    assert delivery.status == "skipped_entitlement"
    assert delivery.provider_response["reason"] == "entitlement_denied"


def test_imessage_credit_consumption(monkeypatch, db, demo_user):
    calls = _successful_provider(monkeypatch)
    mock_upgrade(db, demo_user.id, "Max")
    before = demo_user.credit_balance
    delivery = send_notification(db, demo_user.id, "imessage", "credit test", {"idempotency_key": "imsg-credit"})
    db.refresh(demo_user)
    assert delivery.status == "sent"
    assert delivery.sent_at is not None
    assert demo_user.credit_balance == before - 2
    assert calls == [("+15555550100", "credit test", "imsg-credit")]


def test_imessage_idempotency(monkeypatch, db, demo_user):
    calls = _successful_provider(monkeypatch)
    mock_upgrade(db, demo_user.id, "Max")
    before = demo_user.credit_balance
    first = send_notification(db, demo_user.id, "imessage", "same message", {"idempotency_key": "imsg-dupe"})
    second = send_notification(db, demo_user.id, "imessage", "same message", {"idempotency_key": "imsg-dupe"})
    db.refresh(demo_user)
    assert first.id == second.id
    assert first.status == "sent"
    assert first.sent_at is not None
    assert demo_user.credit_balance == before - 2
    assert calls == [("+15555550100", "same message", "imsg-dupe")]
    assert db.query(NotificationDelivery).filter_by(idempotency_key="imsg-dupe").count() == 1


def test_imessage_mock_idempotency_refunds_once(db, demo_user):
    mock_upgrade(db, demo_user.id, "Max")
    before = demo_user.credit_balance
    first = send_notification(db, demo_user.id, "imessage", "same mock", {"idempotency_key": "imsg-mock-dupe"})
    second = send_notification(db, demo_user.id, "imessage", "same mock", {"idempotency_key": "imsg-mock-dupe"})
    assert first.id == second.id
    _assert_mock_delivery_refunded(db, demo_user, second, before)
    assert db.query(NotificationDelivery).filter_by(idempotency_key="imsg-mock-dupe").count() == 1


def test_failed_notification_refunds_credits(monkeypatch, db, demo_user):
    mock_upgrade(db, demo_user.id, "Pro")
    before = demo_user.credit_balance

    class FailingProvider:
        def send(self, recipient: str, message: str, idempotency_key: str) -> NotificationResult:
            return NotificationResult(False, "telegram", {"error": "provider_down"})

    monkeypatch.setattr(NotificationDispatcher, "_provider", lambda self, channel: FailingProvider())
    delivery = send_notification(db, demo_user.id, "telegram", "refund test", {"idempotency_key": "tg-refund"})
    db.refresh(demo_user)
    assert delivery.status == "failed"
    assert demo_user.credit_balance == before


def test_imessage_relay_hmac_verification(hmac_payload):
    body, timestamp = hmac_payload
    signature = compute_hmac("secret", timestamp, body)
    assert verify_hmac_signature("secret", timestamp, body, signature)
    assert not verify_hmac_signature("secret", timestamp, body, "bad")
