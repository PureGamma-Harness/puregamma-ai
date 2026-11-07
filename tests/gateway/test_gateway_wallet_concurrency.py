from __future__ import annotations

from decimal import Decimal

import pytest
from sqlalchemy.orm import Session

from apps.api.services.gateway_wallet_service import debit_gateway_wallet_for_request, gateway_wallet
from packages.database.models import GatewayRequestLog, GatewayWalletLedger
from packages.gateway.contracts import GatewayProviderError


def _debit(db, user_id: str, request_id: str, amount: str):
    row = GatewayRequestLog(
        request_id=request_id,
        user_id=user_id,
        public_model="offline-wallet-test",
        status="success",
        http_status=200,
    )
    db.add(row)
    db.flush()
    return debit_gateway_wallet_for_request(db, user_id=user_id, request_log=row, amount_usd=Decimal(amount))


def test_cached_wallet_rejects_usage_spent_by_another_request(db, demo_user):
    user_id = demo_user.id
    wallet = gateway_wallet(db, user_id)
    wallet.available_balance_usd = Decimal("10")
    db.commit()

    with Session(bind=db.get_bind(), autoflush=False) as request:
        # Keep the wallet loaded just as the Gateway balance preflight does.
        cached_wallet = gateway_wallet(request, user_id)
        _debit(db, user_id, "first-concurrent-wallet-debit", "7")
        db.commit()

        with pytest.raises(GatewayProviderError) as error:
            _debit(request, user_id, "second-concurrent-wallet-debit", "7")
        assert error.value.code == "GATEWAY_INSUFFICIENT_BALANCE"
        request.rollback()
        assert cached_wallet.available_balance_usd == Decimal("3")

    db.refresh(wallet)
    assert wallet.available_balance_usd == Decimal("3")
    assert wallet.lifetime_debited_usd == Decimal("7")
    assert db.query(GatewayWalletLedger).filter_by(user_id=user_id).count() == 1
    assert db.query(GatewayRequestLog).filter_by(request_id="second-concurrent-wallet-debit").count() == 0


def test_wallet_refresh_preserves_unflushed_charges_in_the_same_transaction(db, demo_user):
    wallet = gateway_wallet(db, demo_user.id)
    wallet.available_balance_usd = Decimal("10")
    db.commit()

    logs = [
        GatewayRequestLog(
            request_id=request_id,
            user_id=demo_user.id,
            public_model="offline-wallet-test",
            status="success",
            http_status=200,
        )
        for request_id in ("first-pending-wallet-debit", "second-pending-wallet-debit")
    ]
    db.add_all(logs)
    db.flush()
    debit_gateway_wallet_for_request(db, user_id=demo_user.id, request_log=logs[0], amount_usd=Decimal("7"))
    debit_gateway_wallet_for_request(db, user_id=demo_user.id, request_log=logs[1], amount_usd=Decimal("2"))
    db.commit()
    db.refresh(wallet)

    assert wallet.available_balance_usd == Decimal("1")
    assert wallet.lifetime_debited_usd == Decimal("9")
    assert sum(row.amount_usd for row in db.query(GatewayWalletLedger).filter_by(user_id=demo_user.id)) == Decimal("-9")
