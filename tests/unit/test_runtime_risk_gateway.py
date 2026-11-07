from __future__ import annotations

import sys
from pathlib import Path

import pytest

RUNTIME_ROOT = Path(__file__).parents[2] / "services" / "nautilus-runtime"
if str(RUNTIME_ROOT) not in sys.path:
    sys.path.insert(0, str(RUNTIME_ROOT))

from app.risk_gateway import RuntimeRiskGateway  # noqa: E402


class PositionStore:
    def __init__(self, positions: list[dict]):
        self.positions = positions

    def list_paper_positions(self, account_id: str) -> list[dict]:
        assert account_id == "acct-1"
        return self.positions


def _order(*, reduce_only: bool = False) -> dict:
    return {
        "account_id": "acct-1",
        "run_id": "run-1",
        "mode": "PAPER",
        "quantity": 0.2,
        "notional": 2000.0,
        "leverage": 1.0,
        "reduce_only": reduce_only,
    }


ACCOUNT = {"balance": 100_000.0, "equity": 100_000.0, "available_margin": 100_000.0}


@pytest.mark.parametrize("position_quantity", [1.0, -1.0], ids=["long", "short"])
@pytest.mark.parametrize("reduce_only", [False, True], ids=["opening", "reduce-only"])
def test_gross_position_exposure_enforces_aggregate_limit(position_quantity, reduce_only):
    risk = RuntimeRiskGateway(PositionStore([{"quantity": position_quantity, "mark_price": 10_000.0}]))

    decision = risk.evaluate(_order(reduce_only=reduce_only), {"max_aggregate_notional": 5000.0}, ACCOUNT)

    assert decision["decision"] == "REJECT"
    assert "MAX_AGGREGATE_NOTIONAL" in decision["reasons"]
    assert decision["state"]["aggregate"]["position_notional"] == 10_000.0
    assert decision["state"]["aggregate"]["aggregate_after"] == 12_000.0


def test_positions_in_different_instruments_do_not_offset_aggregate_exposure():
    risk = RuntimeRiskGateway(PositionStore([
        {"instrument": "BTCUSDT", "quantity": 1.0, "mark_price": 4000.0},
        {"instrument": "ETHUSDT", "quantity": -2.0, "mark_price": 3000.0},
    ]))

    decision = risk.evaluate(_order(), {"max_aggregate_notional": 9000.0}, ACCOUNT)

    assert decision["decision"] == "REJECT"
    assert "MAX_AGGREGATE_NOTIONAL" in decision["reasons"]
    assert decision["state"]["aggregate"]["position_notional"] == 10_000.0


@pytest.mark.parametrize("position_quantity", [1.0, -1.0], ids=["long", "short"])
def test_gross_exposure_is_checked_against_margin(position_quantity):
    risk = RuntimeRiskGateway(PositionStore([{"quantity": position_quantity, "mark_price": 10_000.0}]))
    account = {"balance": 5000.0, "equity": 5000.0, "available_margin": 5000.0}

    decision = risk.evaluate(_order(), {}, account)

    assert decision["decision"] == "REJECT"
    assert "EXPOSURE_EXCEEDS_MARGIN" in decision["reasons"]


@pytest.mark.parametrize("position_quantity", [1.0, -1.0], ids=["long", "short"])
def test_reduce_only_keeps_pause_exemption_within_exposure_limit(position_quantity):
    risk = RuntimeRiskGateway(PositionStore([{"instrument": "BTCUSDT", "quantity": position_quantity, "mark_price": 1000.0}]))
    risk.pause_opening("acct-1")
    risk.paused_run_ids.add("run-1")
    policy = {"max_aggregate_notional": 5000.0}

    opening = risk.evaluate(_order(), policy, ACCOUNT)
    reducing = risk.evaluate({**_order(reduce_only=True), "instrument": "BTCUSDT", "side": "SELL" if position_quantity > 0 else "BUY"}, policy, ACCOUNT)

    assert opening["decision"] == "REJECT"
    assert "OPENING_PAUSED" in opening["reasons"]
    assert "RUN_PAUSED" in opening["reasons"]
    assert reducing["decision"] == "ALLOW"
