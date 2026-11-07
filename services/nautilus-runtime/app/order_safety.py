from __future__ import annotations

import math


def reduce_only_rejection(order: dict, positions: list[dict] | None) -> str | None:
    """Check reduction against an account's signed position, never a flag alone."""
    if not order.get("reduce_only"):
        return None
    if order["reduce_only"] is not True:
        return "INVALID_REDUCE_ONLY_FLAG"
    if positions is None:
        return "REDUCE_ONLY_POSITION_UNAVAILABLE"
    try:
        quantity = float(order.get("quantity", 0))
        position = sum(
            float(item.get("quantity") or 0)
            for item in positions
            if item.get("instrument") == order.get("instrument")
            and item.get("account_id", order["account_id"]) == order["account_id"]
        )
    except (TypeError, ValueError, OverflowError):
        return "REDUCE_ONLY_POSITION_UNAVAILABLE"
    side = str(order.get("side") or "").upper()
    if (
        not order.get("instrument")
        or not math.isfinite(quantity)
        or not math.isfinite(position)
        or quantity <= 0
        or quantity > abs(position)
        or not ((position > 0 and side == "SELL") or (position < 0 and side == "BUY"))
    ):
        return "REDUCE_ONLY_WOULD_INCREASE_POSITION"
    return None
