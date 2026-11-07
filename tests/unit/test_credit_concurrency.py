from __future__ import annotations

import pytest
from sqlalchemy.orm import Session

from apps.api.services.billing_service import process_stripe_event
from apps.api.services.credit_service import (
    InsufficientCreditsError,
    consume_credits,
    grant_credits,
    refund_credits,
    reserve_task,
    settle_task,
)
from packages.billing.metering import CreditQuote
from packages.database.models import CreditLedger, CreditReservationRecord, User
from tests.conftest import stripe_event


@pytest.mark.parametrize("operation", [consume_credits, grant_credits, refund_credits])
def test_cached_account_mutation_preserves_another_sessions_debit(db, normal_user, operation):
    user_id = normal_user.id
    with Session(bind=db.get_bind(), autoflush=False) as request:
        # Authentication loads the account before another request finishes.
        cached_user = request.get(User, user_id)
        consume_credits(db, user_id, "other_request", 20)
        db.commit()

        entry = operation(request, user_id, "cached_request", 5)
        request.commit()
        expected = 5 if operation is consume_credits else 15
        assert cached_user.credit_balance == expected
        assert entry.balance_after == expected

    db.refresh(normal_user)
    assert normal_user.credit_balance == expected
    assert 30 + sum(row.credits_delta for row in db.query(CreditLedger).filter_by(user_id=user_id)) == expected


@pytest.mark.parametrize("reserve", [False, True])
def test_cached_account_cannot_spend_credits_consumed_by_another_request(db, normal_user, reserve):
    user_id = normal_user.id
    with Session(bind=db.get_bind(), autoflush=False) as request:
        cached_user = request.get(User, user_id)
        consume_credits(db, user_id, "other_request", 20)
        db.commit()

        with pytest.raises(InsufficientCreditsError):
            if reserve:
                reserve_task(request, user_id, CreditQuote(task_type="default_chat", credits=20), "cached-reservation")
            else:
                consume_credits(request, user_id, "cached_request", 20)
        request.rollback()
        assert cached_user.credit_balance == 10

    assert db.query(CreditLedger).filter_by(user_id=user_id).count() == 1
    assert db.query(CreditReservationRecord).filter_by(user_id=user_id).count() == 0


def test_settlement_caps_overage_using_the_current_account_balance(db, normal_user):
    user_id = normal_user.id
    reservation = reserve_task(db, user_id, CreditQuote(task_type="default_chat", credits=5), "overage-race")
    db.commit()
    with Session(bind=db.get_bind(), autoflush=False) as request:
        cached_user = request.get(User, user_id)
        consume_credits(db, user_id, "other_request", 20)
        db.commit()

        settlement = settle_task(request, user_id, reservation, actual=15)
        request.commit()
        assert settlement.actual == 5
        assert settlement.adjustment == 0
        assert cached_user.credit_balance == 5

    db.refresh(normal_user)
    assert normal_user.credit_balance == 5
    assert db.query(CreditReservationRecord).filter_by(idempotency_key="overage-race").one().status == "SETTLED_CAPPED"


def test_account_refresh_preserves_pending_changes_and_prior_transaction_charges(db, normal_user):
    normal_user.plan = "Pro"
    consume_credits(db, normal_user.id, "first_request", 7)
    consume_credits(db, normal_user.id, "second_request", 8)
    db.commit()
    db.refresh(normal_user)

    assert normal_user.plan == "Pro"
    assert normal_user.credit_balance == 15


def test_monthly_grant_cap_uses_the_current_account_balance(db, demo_user):
    user_id = demo_user.id
    with Session(bind=db.get_bind(), autoflush=False) as request:
        cached_user = request.get(User, user_id)
        consume_credits(db, user_id, "other_request", 50)
        db.commit()

        event, raw = stripe_event("evt-cached-monthly-grant", "invoice.paid", {
            "id": "in-cached-monthly-grant",
            "billing_reason": "subscription_cycle",
            "metadata": {"user_id": user_id},
        })
        process_stripe_event(request, event, raw)
        assert cached_user.credit_balance == 150

    db.refresh(demo_user)
    assert demo_user.credit_balance == 150
    grant = db.query(CreditLedger).filter_by(idempotency_key="monthly-grant:invoice:in-cached-monthly-grant").one()
    assert grant.credits_delta == 50
