from __future__ import annotations

import sys
from pathlib import Path

import pytest

RUNTIME_ROOT = Path(__file__).parents[2] / "services" / "nautilus-runtime"
if str(RUNTIME_ROOT) not in sys.path:
    sys.path.insert(0, str(RUNTIME_ROOT))

from app.reconciliation import RuntimeReconciler  # noqa: E402
from app.risk_gateway import RuntimeRiskGateway  # noqa: E402


def _order(cid: str, state: str, *, quantity: float = 1.0, filled_quantity: float = 0.0, average_price: float | None = None) -> dict:
    order = {
        "client_order_id": cid,
        "state": state,
        "quantity": quantity,
        "filled_quantity": filled_quantity,
        "account_id": "acct-1",
    }
    if average_price is not None:
        order["average_price"] = average_price
    return order


class FakeStore:
    def __init__(self, orders: list[dict]):
        self._orders = orders

    def latest_orders(self, account_id: str | None = None) -> list[dict]:
        return list(self._orders)


class FakeExchange:
    def __init__(self, open_orders: list[dict], fills: list[dict]):
        self._open = open_orders
        self._fills = fills

    def reconcile(self, account_id: str) -> dict:
        return {"open_orders": self._open, "fills": self._fills}


def _reconciler(orders, open_orders, fills, risk=None):
    store = FakeStore(orders)
    exchange = FakeExchange(open_orders, fills)
    risk = risk or RuntimeRiskGateway()
    reconciler = RuntimeReconciler(store, exchange, risk)
    return reconciler.reconcile("acct-1"), risk


def test_reconciled_when_local_open_matches_remote():
    local = [_order("a1", "SUBMITTED")]
    result, risk = _reconciler(local, [_order("a1", "SUBMITTED")], [])
    assert result["status"] == "RECONCILED"
    assert result["opening_paused"] is False
    assert "acct-1" not in risk.pause_opening_accounts


def test_unknown_local_open_order_pauses_opening():
    # Local open order the exchange knows nothing about (state != CREATED/PREPARED).
    local = [_order("a1", "SUBMITTED")]
    result, risk = _reconciler(local, [], [])
    assert result["status"] == "RECONCILIATION_REQUIRED"
    assert result["drift"]["unknown_open_orders"] == ["a1"]
    assert "acct-1" in risk.pause_opening_accounts


def test_created_or_prepared_local_not_flagged_unknown():
    local = [_order("a1", "PREPARED")]
    result, _ = _reconciler(local, [], [])
    assert result["drift"]["unknown_open_orders"] == []


def test_remote_only_order_pauses_opening():
    # Order the exchange holds that this runtime has no journal row for at all.
    local = []
    remote = [_order("rogue-1", "ACCEPTED")]
    result, risk = _reconciler(local, remote, [])
    assert result["status"] == "RECONCILIATION_REQUIRED"
    assert result["drift"]["remote_only_orders"] == ["rogue-1"]
    assert "acct-1" in risk.pause_opening_accounts


def test_fill_notional_divergence_pauses_opening():
    # Equal fill COUNT but different notional (quantity x price) must be flagged.
    local = [_order("f1", "FILLED", quantity=1.0, filled_quantity=1.0, average_price=100.0)]
    remote_fills = [_order("f1", "FILLED", quantity=1.0, filled_quantity=1.0, average_price=101.0)]
    result, risk = _reconciler(local, [], remote_fills)
    assert result["drift"]["fills_diverged"] is True
    assert result["drift"]["fill_amount_diverged"] is True
    assert result["status"] == "RECONCILIATION_REQUIRED"
    assert "acct-1" in risk.pause_opening_accounts


def test_fill_quantity_divergence_paused():
    local = [_order("f1", "FILLED", quantity=1.0, filled_quantity=0.5, average_price=100.0)]
    remote_fills = [_order("f1", "FILLED", quantity=1.0, filled_quantity=1.0, average_price=100.0)]
    result, risk = _reconciler(local, [], remote_fills)
    assert result["drift"]["fill_quantity_diverged"] is True
    assert result["drift"]["fills_diverged"] is True
    assert result["status"] == "RECONCILIATION_REQUIRED"
    assert "acct-1" in risk.pause_opening_accounts


def test_fill_quantity_divergence_with_equal_notional_keeps_opening_paused():
    local = [_order("f1", "FILLED", quantity=1.0, filled_quantity=1.0, average_price=100.0)]
    remote_fills = [_order("f1", "FILLED", quantity=2.0, filled_quantity=2.0, average_price=50.0)]
    risk = RuntimeRiskGateway()
    risk.pause_opening("acct-1")

    result, _ = _reconciler(local, [], remote_fills, risk=risk)

    assert result["drift"]["local_fill_notional"] == result["drift"]["adapter_fill_notional"]
    assert result["drift"]["fill_quantity_diverged"] is True
    assert result["status"] == "RECONCILIATION_REQUIRED"
    assert result["opening_paused"] is True
    assert "acct-1" in risk.pause_opening_accounts


def test_matching_fills_clear_opening_pause():
    local = [_order("f1", "FILLED", quantity=1.0, filled_quantity=1.0, average_price=100.0)]
    remote_fills = [{"client_order_id": "f1", "quantity": 1.0, "price": 100.0}]
    risk = RuntimeRiskGateway()
    risk.pause_opening("acct-1")

    result, _ = _reconciler(local, [], remote_fills, risk=risk)

    assert result["drift"]["fill_quantity_diverged"] is False
    assert result["drift"]["fills_diverged"] is False
    assert result["status"] == "RECONCILED"
    assert result["opening_paused"] is False
    assert "acct-1" not in risk.pause_opening_accounts


def test_pause_cleared_when_reconciled_again():
    local = [_order("a1", "SUBMITTED")]
    risk = RuntimeRiskGateway()
    risk.pause_opening("acct-1")
    result, _ = _reconciler(local, [_order("a1", "SUBMITTED")], [], risk=risk)
    assert result["status"] == "RECONCILED"
    assert "acct-1" not in risk.pause_opening_accounts


@pytest.mark.parametrize("state", ["FILLED", "CANCELED", "REJECTED", "EXPIRED"])
def test_remote_open_order_with_local_terminal_state_keeps_opening_paused(state):
    local = [_order("a1", state, filled_quantity=1.0 if state == "FILLED" else 0.0,
                    average_price=100.0)]
    fills = [{"client_order_id": "a1", "quantity": 1.0, "price": 100.0}] if state == "FILLED" else []
    risk = RuntimeRiskGateway()
    risk.pause_opening("acct-1")

    result, _ = _reconciler(local, [_order("a1", "ACCEPTED")], fills, risk=risk)

    assert result["remote_only_orders"] == ["a1"]
    assert result["drift"]["remote_only_orders"] == ["a1"]
    assert result["status"] == "RECONCILIATION_REQUIRED"
    assert result["opening_paused"] is True
    assert "acct-1" in risk.pause_opening_accounts


@pytest.mark.parametrize("state", ["PARTIALLY_FILLED", "CANCELED", "EXPIRED"])
def test_missing_partial_execution_pauses_opening(state):
    local = [_order("p1", state, quantity=2.0, filled_quantity=0.5, average_price=100.0)]
    open_orders = local if state == "PARTIALLY_FILLED" else []

    result, risk = _reconciler(local, open_orders, [])

    assert result["drift"]["local_fill_quantity"] == 0.5
    assert result["drift"]["local_fill_notional"] == 50.0
    assert result["drift"]["fill_quantity_diverged"] is True
    assert result["status"] == "RECONCILIATION_REQUIRED"
    assert "acct-1" in risk.pause_opening_accounts


@pytest.mark.parametrize("state", ["PARTIALLY_FILLED", "CANCELED", "EXPIRED"])
def test_matching_partial_execution_can_reconcile(state):
    local = [_order("p1", state, quantity=2.0, filled_quantity=0.5, average_price=100.0)]
    open_orders = local if state == "PARTIALLY_FILLED" else []
    fills = [{"client_order_id": "p1", "quantity": 0.5, "price": 100.0}]

    result, _ = _reconciler(local, open_orders, fills)

    assert result["drift"]["local_fill_quantity"] == 0.5
    assert result["drift"]["fills_diverged"] is False
    assert result["drift"]["fill_quantity_diverged"] is False
    assert result["status"] == "RECONCILED"


def test_order_snapshot_uses_executed_quantity_and_average_price():
    local = [_order("p1", "PARTIALLY_FILLED", quantity=2.0, filled_quantity=0.5,
                    average_price=100.0)]
    # Snapshot adapters retain the original order quantity and limit price.
    fills = [{**local[0], "price": 101.0}]

    result, _ = _reconciler(local, local, fills)

    assert result["drift"]["adapter_fill_quantity"] == 0.5
    assert result["drift"]["adapter_fill_notional"] == 50.0
    assert result["status"] == "RECONCILED"


def test_multiple_trade_fills_reconcile_against_one_order_execution():
    local = [{**_order("f1", "FILLED", filled_quantity=1.0, average_price=102.0),
              "exchange_order_id": "42", "instrument": "BTCUSDT"}]
    # Binance supplies one row per trade, identified by symbol + venue order ID.
    fills = [
        {"exchange_order_id": "42", "instrument": "BTCUSDT", "quantity": 0.4, "price": 90.0},
        {"exchange_order_id": "42", "instrument": "BTCUSDT", "quantity": 0.6, "price": 110.0},
    ]

    result, _ = _reconciler(local, [], fills)

    assert result["drift"]["local_fills"] == 1
    assert result["drift"]["adapter_fills"] == 2
    assert result["drift"]["fills_diverged"] is False
    assert result["drift"]["fill_quantity_diverged"] is False
    assert result["status"] == "RECONCILED"


@pytest.mark.parametrize("symbols", [("BTCUSDT", "BTCUSDT"), ("BTCUSDT", "ETHUSDT")])
@pytest.mark.parametrize("metric", ["quantity", "notional"])
def test_offsetting_execution_differences_still_pause_opening(symbols, metric):
    quantities = (1.0, 2.0) if metric == "quantity" else (1.0, 1.0)
    prices = (100.0, 100.0) if metric == "quantity" else (100.0, 200.0)
    local = [
        {**_order(cid, "FILLED", quantity=qty, filled_quantity=qty, average_price=price),
         "instrument": symbol, "exchange_order_id": str(index)}
        for index, (cid, qty, price, symbol) in enumerate(zip(("f1", "f2"), quantities, prices, symbols))
    ]
    fills = [
        {"exchange_order_id": str(index), "instrument": symbol,
         "quantity": quantities[1 - index], "price": prices[1 - index]}
        for index, symbol in enumerate(symbols)
    ]

    result, risk = _reconciler(local, [], fills)

    assert result["drift"]["local_fill_quantity"] == result["drift"]["adapter_fill_quantity"]
    assert result["drift"]["local_fill_notional"] == result["drift"]["adapter_fill_notional"]
    assert result["drift"]["fills_diverged"] is True
    assert result["drift"]["fill_quantity_diverged"] is (metric == "quantity")
    assert result["status"] == "RECONCILIATION_REQUIRED"
    assert "acct-1" in risk.pause_opening_accounts


@pytest.mark.parametrize("identity", [
    {"client_order_id": "unrelated", "instrument": "BTCUSDT"},
    {"client_order_id": "f1", "instrument": "ETHUSDT"},
    {"exchange_order_id": "42", "instrument": "ETHUSDT"},
])
def test_equal_totals_with_different_execution_identity_pause_opening(identity):
    local = [{**_order("f1", "FILLED", filled_quantity=1.0, average_price=100.0),
              "exchange_order_id": "42", "instrument": "BTCUSDT"}]
    fills = [{**identity, "quantity": 1.0, "price": 100.0}]

    result, _ = _reconciler(local, [], fills)

    assert result["drift"]["fills_diverged"] is True
    assert result["status"] == "RECONCILIATION_REQUIRED"


def test_venue_order_ids_are_scoped_to_instrument():
    local = [
        {**_order("btc", "FILLED", quantity=1.0, filled_quantity=1.0, average_price=100.0),
         "exchange_order_id": "42", "instrument": "BTCUSDT"},
        {**_order("eth", "FILLED", quantity=2.0, filled_quantity=2.0, average_price=200.0),
         "exchange_order_id": "42", "instrument": "ETHUSDT"},
    ]
    fills = [
        {"exchange_order_id": "42", "instrument": "BTCUSDT", "quantity": 1.0, "price": 100.0},
        {"exchange_order_id": "42", "instrument": "ETHUSDT", "quantity": 2.0, "price": 200.0},
    ]

    result, _ = _reconciler(local, [], fills)

    assert result["status"] == "RECONCILED"


def test_anonymous_fill_keeps_aggregate_reconciliation_compatibility():
    local = [{**_order("f1", "FILLED", filled_quantity=1.0, average_price=100.0),
              "instrument": "BTCUSDT"}]

    result, _ = _reconciler(local, [], [{"quantity": 1.0, "amount": 100.0}])

    assert result["status"] == "RECONCILED"
    assert result["drift"]["fill_quantity_diverged"] is False
