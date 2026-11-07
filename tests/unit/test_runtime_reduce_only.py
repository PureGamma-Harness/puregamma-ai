from __future__ import annotations

import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from threading import Barrier, Event

import pytest

RUNTIME_ROOT = Path(__file__).parents[2] / "services" / "nautilus-runtime"
if str(RUNTIME_ROOT) not in sys.path:
    sys.path.insert(0, str(RUNTIME_ROOT))

from app.runtime_manager import RuntimeManager  # noqa: E402


class BookOnlyAdapter:
    def fetch_order_book(self, instrument):
        return {"asks": [[100.0, 10.0]], "bids": [[100.0, 10.0]]}

    def submit_order(self, order):
        raise AssertionError("SHADOW must never submit to the real adapter")


@pytest.fixture(params=["PAPER", "SHADOW"])
def runtime(request, tmp_path, monkeypatch):
    manager = RuntimeManager(str(tmp_path / "runtime.sqlite3"))
    mode = request.param
    account = {"venue": "MOCK", "environment": "paper"}
    if mode == "SHADOW":
        account["venue"] = "COINBASE_ADVANCED"
        monkeypatch.setattr(manager, "gateway_for_account", lambda _: BookOnlyAdapter())

    def submit(name, side, quantity, *, reduce_only=False, instrument="BTCUSDT", direction=None):
        return manager.command("submit_order", f"command-{name}", {
            "client_order_id": name,
            "account_id": "account-1",
            "account": account,
            "run_id": "run-1",
            "mode": mode,
            "instrument": instrument,
            "side": side,
            "direction": direction,
            "quantity": quantity,
            "notional": quantity * 100.0,
            "leverage": 1.0,
            "order_type": "MARKET",
            "mark_price": 100.0,
            "fill_immediately": True,
            "reduce_only": reduce_only,
            "risk_policy": {"max_position": 10.0, "max_orders_per_minute": 60},
            "idempotency_key": f"order-{name}",
        })

    return manager, submit


@pytest.mark.parametrize("initial,side,quantity", [
    (0.0, "BUY", 0.5),
    (1.0, "BUY", 0.5),
    (-1.0, "SELL", 0.5),
    (1.0, "SELL", 1.5),
    (-1.0, "BUY", 1.5),
])
def test_reduce_only_cannot_open_increase_or_reverse_a_paused_position(runtime, initial, side, quantity):
    manager, submit = runtime
    if initial:
        seeded = submit("seed", "BUY" if initial > 0 else "SELL", abs(initial))
        assert seeded["state"] == "FILLED"
    before = manager.store.list_paper_positions("account-1")
    manager.risk.pause_opening("account-1")
    manager.risk.paused_run_ids.add("run-1")

    result = submit("invalid-reduction", side, quantity, reduce_only=True)

    assert result["state"] == "REJECTED"
    assert "REDUCE_ONLY_WOULD_INCREASE_POSITION" in result["risk_decision"]["reasons"]
    assert manager.store.list_paper_positions("account-1") == before


@pytest.mark.parametrize("initial", [1.0, -1.0])
@pytest.mark.parametrize("lowercase_side", [False, True])
def test_genuine_reduce_only_fill_remains_available_while_openings_are_paused(runtime, initial, lowercase_side):
    manager, submit = runtime
    assert submit("seed", "BUY" if initial > 0 else "SELL", abs(initial))["state"] == "FILLED"
    manager.risk.pause_opening("account-1")
    manager.risk.paused_run_ids.add("run-1")

    side = "SELL" if initial > 0 else "BUY"
    result = submit("valid-reduction", side.lower() if lowercase_side else side, 0.25, reduce_only=True)

    assert result["state"] == "FILLED"
    assert result["risk_decision"]["decision"] == "ALLOW"
    position = manager.store.list_paper_positions("account-1")[0]
    assert position["quantity"] == pytest.approx(0.75 if initial > 0 else -0.75)


def test_reduce_only_cannot_borrow_a_position_in_another_instrument(runtime):
    manager, submit = runtime
    assert submit("seed", "BUY", 1.0)["state"] == "FILLED"
    manager.risk.pause_opening("account-1")

    result = submit("other-instrument", "SELL", 0.5, reduce_only=True, instrument="ETHUSDT")

    assert result["state"] == "REJECTED"
    assert "REDUCE_ONLY_WOULD_INCREASE_POSITION" in result["risk_decision"]["reasons"]
    assert [p["instrument"] for p in manager.store.list_paper_positions("account-1")] == ["BTCUSDT"]


@pytest.mark.parametrize("flag", ["true", "false", 1])
def test_non_boolean_reduce_only_flags_cannot_bypass_pauses(runtime, flag):
    manager, submit = runtime
    manager.risk.pause_opening("account-1")

    result = submit("ambiguous-flag", "BUY", 0.5, reduce_only=flag)

    assert result["state"] == "REJECTED"
    assert "INVALID_REDUCE_ONLY_FLAG" in result["risk_decision"]["reasons"]
    assert manager.store.list_paper_positions("account-1") == []


@pytest.mark.parametrize("side", ["", None, 0])
def test_direction_cannot_replace_an_invalid_execution_side(runtime, side):
    manager, submit = runtime
    assert submit("seed", "SELL", 1.0)["state"] == "FILLED"
    manager.risk.pause_opening("account-1")

    result = submit("invalid-side", side, 0.5, reduce_only=True, direction="BUY")

    assert result["state"] == "REJECTED"
    assert "REDUCE_ONLY_WOULD_INCREASE_POSITION" in result["risk_decision"]["reasons"]
    assert manager.store.list_paper_positions("account-1")[0]["quantity"] == pytest.approx(-1.0)


def _exchange(manager):
    return next(iter(manager._shadow_gateway_cache.values()), manager.exchange)


def test_execution_rechecks_reduce_only_and_serializes_competing_fills(runtime):
    manager, submit = runtime
    assert submit("seed", "BUY", 1.0)["state"] == "FILLED"
    exchange = _exchange(manager)
    request = manager.store.latest_order("seed")
    gate = Barrier(2)

    def close(name):
        gate.wait(timeout=5)
        return exchange.submit_order({
            **request, "client_order_id": name, "side": "SELL", "quantity": 0.75,
            "reduce_only": True, "idempotency_key": name,
        })

    with ThreadPoolExecutor(max_workers=2) as workers:
        results = list(workers.map(close, ["close-a", "close-b"]))

    assert sorted(result["state"] for result in results) == ["FILLED", "REJECTED"]
    assert exchange.fetch_positions("account-1")[0]["quantity"] == pytest.approx(0.25)
    assert manager.store.list_paper_positions("account-1")[0]["quantity"] == pytest.approx(0.25)


def test_marking_prices_cannot_restore_a_position_changed_by_a_fill(runtime):
    manager, submit = runtime
    assert submit("seed", "BUY", 1.0)["state"] == "FILLED"
    exchange = _exchange(manager)
    marking = Event()
    resume_mark = Event()
    fill_started = Event()
    fill_completed = Event()

    class PausedPrice:
        def __float__(self):
            marking.set()
            assert resume_mark.wait(timeout=5)
            return 101.0

    request = manager.store.latest_order("seed")

    def reduce():
        fill_started.set()
        try:
            return exchange.submit_order({
                **request, "client_order_id": "close-during-mark", "side": "SELL",
                "quantity": 0.75, "reduce_only": True, "idempotency_key": "close-during-mark",
            })
        finally:
            fill_completed.set()

    with ThreadPoolExecutor(max_workers=2) as workers:
        marked = workers.submit(exchange.mark_positions, [{"asset": "BTC", "price": PausedPrice()}])
        try:
            assert marking.wait(timeout=5)
            filled = workers.submit(reduce)
            assert fill_started.wait(timeout=5)
            # An unlocked writer could finish here and then be overwritten by
            # the older position snapshot held by the price-marking loop.
            fill_completed.wait(timeout=0.2)
        finally:
            resume_mark.set()
        assert marked.result(timeout=5) == 1
        assert filled.result(timeout=5)["state"] == "FILLED"

    assert exchange.fetch_positions("account-1")[0]["quantity"] == pytest.approx(0.25)
    assert manager.store.list_paper_positions("account-1")[0]["quantity"] == pytest.approx(0.25)


def test_market_refresh_cannot_restore_another_adapters_stale_position(tmp_path, monkeypatch):
    manager = RuntimeManager(str(tmp_path / "mixed-runtime.sqlite3"))
    monkeypatch.setattr(manager, "gateway_for_account", lambda _: BookOnlyAdapter())

    def submit(name, account_id, venue, mode, side, quantity, reduce_only=False):
        return manager.command("submit_order", name, {
            "client_order_id": name, "account_id": account_id,
            "account": {"venue": venue, "environment": "paper"},
            "mode": mode, "instrument": "BTCUSDT", "side": side,
            "quantity": quantity, "notional": 100.0 * quantity,
            "mark_price": 100.0, "fill_immediately": True, "leverage": 1.0,
            "reduce_only": reduce_only, "idempotency_key": name,
        })

    assert submit("paper-seed", "paper", "MOCK", "PAPER", "BUY", 1.0)["state"] == "FILLED"
    assert submit("shadow-seed", "shadow", "COINBASE_ADVANCED", "SHADOW", "BUY", 0.1)["state"] == "FILLED"
    assert submit("paper-reduce", "paper", "MOCK", "PAPER", "SELL", 0.75, True)["state"] == "FILLED"
    assert manager.store.list_paper_positions("paper")[0]["quantity"] == pytest.approx(0.25)

    class Quotes:
        def fetch(self, symbols, force=False):
            return {"quotes": [{
                "asset": "BTC", "symbol": "BTCUSDT", "price": 101.0,
                "provider": "offline", "timestamp": "2026-11-07T12:00:00+00:00",
                "stale": False,
            }], "missing": [], "errors": [], "providers": []}

    manager.market_data_enabled = True
    manager.market_data = Quotes()
    manager.refresh_market_data(["BTCUSDT"], force=True)

    paper = manager.store.list_paper_positions("paper")[0]
    shadow = manager.store.list_paper_positions("shadow")[0]
    assert paper["quantity"] == pytest.approx(0.25)
    assert shadow["quantity"] == pytest.approx(0.1)
    assert paper["mark_price"] == shadow["mark_price"] == 101.0
