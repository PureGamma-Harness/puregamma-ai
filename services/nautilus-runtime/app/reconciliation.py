from __future__ import annotations

TERMINAL_STATES = {"FILLED", "CANCELED", "REJECTED", "EXPIRED"}


def _fill_notional(fill: dict) -> float:
    """Notional of one fill row, tolerating quantity/price or amount fields."""
    quantity = _fill_quantity(fill)
    if "filled_quantity" in fill:
        # An order snapshot may also carry the requested limit price/quantity.
        price = float(fill.get("average_price") or fill.get("price") or 0)
    else:
        price = float(fill.get("price") or fill.get("average_price") or 0)
    if quantity and price:
        return quantity * price
    return float(fill.get("amount") or fill.get("notional") or 0)


def _fill_quantity(fill: dict) -> float:
    """Filled quantity of one fill row, tolerating quantity variants."""
    if "filled_quantity" in fill:
        return float(fill.get("filled_quantity") or 0)
    return float(fill.get("quantity") or 0)


def _symbol(row: dict) -> str:
    return str(row.get("instrument") or row.get("symbol") or "").upper()


def _order_fill_totals(orders: list[dict], fills: list[dict]) -> dict | None:
    """Group trade rows by journal order; None preserves anonymous-fill support."""
    by_client = {str(order["client_order_id"]): order for order in orders}
    by_exchange = {
        (_symbol(order), str(order["exchange_order_id"])): order
        for order in orders
        if order.get("exchange_order_id")
    }
    totals = {}
    for fill in fills:
        symbol = _symbol(fill)
        if fill.get("client_order_id"):
            identifier = str(fill["client_order_id"])
            order = by_client.get(identifier)
            kind = "client"
        elif fill.get("exchange_order_id"):
            identifier = str(fill["exchange_order_id"])
            # Venue order IDs may repeat for different instruments.
            order = by_exchange.get((symbol, identifier))
            kind = "exchange"
        else:
            return None
        if order:
            kind, identifier = "client", str(order["client_order_id"])
            local_symbol = _symbol(order)
            # Missing optional symbols remain compatible; explicit differences
            # stay in separate buckets even if the order ID is the same.
            symbol = symbol if symbol and local_symbol else local_symbol
        key = (kind, identifier, symbol)
        quantity, notional = totals.get(key, (0.0, 0.0))
        totals[key] = (quantity + _fill_quantity(fill), notional + _fill_notional(fill))
    return totals


class RuntimeReconciler:
    def __init__(self, store, exchange, risk):
        self.store = store
        self.exchange = exchange
        self.risk = risk

    def reconcile(self, account_id: str) -> dict:
        journal = self.store.latest_orders(account_id)
        # Compare only the LATEST journal row per order: append-only history
        # rows of terminal orders are not open orders.
        local = [
            order for order in journal if order["state"] not in TERMINAL_STATES
        ]
        remote = self.exchange.reconcile(account_id)
        remote_orders = remote.get("open_orders", [])
        remote_ids = {item["client_order_id"] for item in remote_orders}
        local_ids = {item["client_order_id"] for item in local}

        # Compare open-order sets: a journaled terminal order still open remotely
        # is also unexpected and must keep opening paused.
        remote_only = [
            item["client_order_id"]
            for item in remote_orders
            if item["client_order_id"] not in local_ids
        ]

        unknown = [
            item["client_order_id"]
            for item in local
            if item["client_order_id"] not in remote_ids
            and item["state"] not in {"CREATED", "PREPARED"}
        ]

        # Cumulative executions survive partial fills, cancellation and expiry.
        local_fills = [
            order
            for order in journal
            if order["state"] == "FILLED"
            or float(order.get("filled_quantity") or 0) > 0
        ]
        local_fill_count = len(local_fills)
        local_fill_notional = sum(
            float(order.get("filled_quantity") or 0)
            * float(order.get("average_price", order.get("mark_price", 0)) or 0)
            for order in local_fills
        )
        local_fill_quantity = sum(
            float(order.get("filled_quantity") or 0) for order in local_fills
        )
        remote_fills = remote.get("fills", [])
        remote_fill_count = len(remote_fills)
        remote_fill_notional = sum(_fill_notional(fill) for fill in remote_fills)
        remote_fill_quantity = sum(_fill_quantity(fill) for fill in remote_fills)
        fills_diverged = (
            local_fill_count != remote_fill_count
            or abs(local_fill_notional - remote_fill_notional) > 1e-6
        )
        quantity_diverged = (
            abs(local_fill_quantity - remote_fill_quantity) > 1e-6
        )

        # Adapters can return many trades for one cumulative journal order.
        # Compare each identifiable order instead of raw row counts or only
        # account totals, where independent differences could cancel out.
        remote_by_order = _order_fill_totals(journal, remote_fills)
        if remote_by_order is not None:
            local_by_order = {
                ("client", str(order["client_order_id"]), _symbol(order)): (
                    float(order.get("filled_quantity") or 0),
                    float(order.get("filled_quantity") or 0)
                    * float(order.get("average_price", order.get("mark_price", 0)) or 0),
                )
                for order in local_fills
            }
            keys = local_by_order.keys() | remote_by_order.keys()
            fills_diverged = (
                abs(local_fill_notional - remote_fill_notional) > 1e-6
                or local_by_order.keys() != remote_by_order.keys()
                or any(
                    abs(
                        local_by_order.get(key, (0, 0))[1]
                        - remote_by_order.get(key, (0, 0))[1]
                    ) > 1e-6
                    for key in keys
                )
            )
            quantity_diverged = quantity_diverged or any(
                abs(
                    local_by_order.get(key, (0, 0))[0]
                    - remote_by_order.get(key, (0, 0))[0]
                ) > 1e-6
                for key in keys
            )

        drift = {
            "unknown_open_orders": unknown,
            "remote_only_orders": remote_only,
            "local_fills": local_fill_count,
            "adapter_fills": remote_fill_count,
            "local_fill_notional": round(local_fill_notional, 8),
            "adapter_fill_notional": round(remote_fill_notional, 8),
            "local_fill_quantity": round(local_fill_quantity, 8),
            "adapter_fill_quantity": round(remote_fill_quantity, 8),
            "fills_diverged": fills_diverged,
            "fill_amount_diverged": fills_diverged,
            "fill_quantity_diverged": quantity_diverged,
        }

        needs_pause = bool(unknown or remote_only or fills_diverged or quantity_diverged)
        if needs_pause:
            self.risk.pause_opening(account_id)
        else:
            self.risk.resume_opening(account_id)
        return {
            "status": "RECONCILIATION_REQUIRED" if needs_pause else "RECONCILED",
            "account_id": account_id,
            "unknown_orders": unknown,
            "remote_only_orders": remote_only,
            "local_open_orders": local,
            "exchange": remote,
            "drift": drift,
            "opening_paused": needs_pause,
        }
