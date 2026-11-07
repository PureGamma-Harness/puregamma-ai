from __future__ import annotations

import sys
from pathlib import Path

import pytest

RUNTIME_ROOT = Path(__file__).parents[2] / "services" / "nautilus-runtime"
if str(RUNTIME_ROOT) not in sys.path:
    sys.path.insert(0, str(RUNTIME_ROOT))

from app.runtime_manager import RuntimeManager  # noqa: E402


class EmptyBookAdapter:
    def fetch_order_book(self, instrument):
        return {"asks": [], "bids": []}

    def cancel_order(self, *args):
        raise AssertionError("SHADOW must never cancel through the real adapter")


def resting_shadow_order(manager, monkeypatch, *, with_run):
    account = {"venue": "HYPERLIQUID", "environment": "paper"}
    monkeypatch.setattr(manager, "gateway_for_account", lambda _: EmptyBookAdapter())
    payload = {
        "account_id": "shadow-account",
        "account": account,
        "mode": "SHADOW",
        "instrument": "BTCUSDT",
        "side": "BUY",
        "quantity": 0.01,
        "notional": 600,
        "leverage": 1,
        "order_type": "LIMIT",
        "idempotency_key": "shadow-order",
    }
    if with_run:
        manager.command("activate", "activate-shadow", {
            "run_id": "shadow-run",
            "strategy_id": "shadow-strategy",
            "strategy_version": 1,
            "account_id": payload["account_id"],
            "account": account,
            "mode": "SHADOW",
            "strategy": {},
        })
        payload["run_id"] = "shadow-run"
        # Run-bound requests may omit account configuration.
        payload.pop("account")
    order = manager.command("submit_order", "submit-shadow", payload)
    assert order["state"] == "ACCEPTED"
    return order, manager.shadow_gateway_for_account(account)


@pytest.mark.parametrize("with_run", [False, True])
@pytest.mark.parametrize("after_restart", [False, True])
def test_cancel_routes_to_shadow_adapter_and_replays_idempotently(
    tmp_path, monkeypatch, with_run, after_restart
):
    state_db = str(tmp_path / "runtime.sqlite3")
    manager = RuntimeManager(state_db)
    order, shadow = resting_shadow_order(manager, monkeypatch, with_run=with_run)
    if after_restart:
        manager = RuntimeManager(state_db)
        monkeypatch.setattr(manager, "gateway_for_account", lambda _: EmptyBookAdapter())
        shadow = manager.shadow_gateway_for_account({"venue": "HYPERLIQUID", "environment": "paper"})
    payload = {
        "account_id": "shadow-account",
        "client_order_id": order["client_order_id"],
        # Routing metadata in a cancel request cannot change the stored route.
        "mode": "PAPER",
        "account": {"venue": "COINBASE_ADVANCED", "environment": "mainnet"},
    }

    result = manager.command("cancel_order", "cancel-shadow", payload)

    assert result["state"] == "CANCELED"
    assert shadow.fetch_open_orders("shadow-account") == []
    assert manager.store.latest_order(order["client_order_id"])["state"] == "CANCELED"
    journal = manager.store.order_journal(order["client_order_id"])
    replay = manager.command("cancel_order", "cancel-shadow", payload)
    assert replay["state"] == "CANCELED"
    assert replay["idempotent"] is True
    assert manager.store.order_journal(order["client_order_id"]) == journal


def test_cancel_rejects_another_account_before_mutating_journal(tmp_path, monkeypatch):
    manager = RuntimeManager(str(tmp_path / "runtime.sqlite3"))
    order, shadow = resting_shadow_order(manager, monkeypatch, with_run=False)
    journal = manager.store.order_journal(order["client_order_id"])

    result = manager.command("cancel_order", "cancel-foreign", {
        "account_id": "another-account",
        "client_order_id": order["client_order_id"],
    })

    assert result["status"] == "REJECTED"
    assert manager.store.order_journal(order["client_order_id"]) == journal
    assert shadow.fetch_order(order["client_order_id"])["state"] == "ACCEPTED"


def test_cancel_unknown_order_does_not_create_journal_rows(tmp_path):
    manager = RuntimeManager(str(tmp_path / "runtime.sqlite3"))

    result = manager.command("cancel_order", "cancel-unknown", {
        "account_id": "paper-account",
        "client_order_id": "missing-order",
    })

    assert result["state"] == "UNKNOWN"
    assert manager.store.order_journal("missing-order") == []
