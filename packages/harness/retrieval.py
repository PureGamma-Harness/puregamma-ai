"""Deterministic, explicit-asset selection inside an observed evidence set.

This is lexical asset coverage, not semantic relevance or factual verification.
Candidate order is the existing quality order. Unknown questions leave it alone.
"""
from __future__ import annotations

from dataclasses import dataclass
import re
from typing import Iterable, Sequence

RETRIEVAL_POLICY_VERSION = "explicit-asset-coverage-v1"
MAX_MODEL_SELECTION_CHARS = 600

# Existing financial lexicon plus the shipped NASDAQ research pool. Unknown
# tickers require a $ marker or a recognized exchange prefix, not guessed words.
_BARE_SYMBOLS = frozenset({
    "BTC", "ETH", "SOL", "HYPE", "MSTR", "STRC", "SPY", "QQQ",
    "AAPL", "NVDA", "MSFT", "TSLA", "AMZN", "META", "GOOGL", "AVGO",
    "PLTR", "NFLX", "AMD", "SMCI",
})
_AMBIGUOUS_WORDS = frozenset({"SOL", "HYPE", "SPY", "META"})
_ALIASES: dict[str, tuple[str, ...]] = {
    "BTC": ("bitcoin", "比特币"),
    "ETH": ("ethereum", "以太坊"),
    "SOL": ("solana",),
    "HYPE": ("hyperliquid",),
    "MSTR": ("microstrategy", "strategy inc"),
    "SPY": ("s&p 500", "s&p500", "标普500", "标普 500"),
    "QQQ": ("nasdaq 100", "nasdaq100", "纳斯达克100", "纳指100"),
    "AAPL": ("apple inc", "苹果公司"),
    "META": ("meta platforms",),
}
# Controlled pairs mirror the existing Binance asset mapping. No arbitrary
# USD/USDT suffix stripping: e.g. a symbol merely containing USD stays intact.
_PAIR_ASSETS = {f"{asset}{separator}USDT": asset for asset in ("BTC", "ETH", "SOL") for separator in ("", "/", "-")}
_SYMBOL = r"[A-Za-z][A-Za-z0-9]*(?:[._/=\-][A-Za-z0-9]+)*"
_LEFT_BOUNDARY = r"(?<![A-Za-z0-9_.=/\-])"
_RIGHT_BOUNDARY = r"(?![A-Za-z0-9_]|[./=\-][A-Za-z0-9_])"
_EXPLICIT = re.compile(
    rf"{_LEFT_BOUNDARY}(?:\$(?P<dollar>{_SYMBOL})|"
    rf"(?:NASDAQ|NYSE|AMEX|ARCA|BINANCE|COINBASE|DERIBIT|OKX|BYBIT|HYPERLIQUID):\s*(?P<exchange>{_SYMBOL}))"
    rf"{_RIGHT_BOUNDARY}", re.IGNORECASE,
)


def normalize_asset(value: str) -> str:
    symbol = value.strip().upper()
    return _PAIR_ASSETS.get(symbol, symbol)


def normalized_assets(values: Iterable[str] | None) -> tuple[str, ...]:
    if not isinstance(values, (list, tuple, set, frozenset)):
        return ()
    return tuple(sorted({normalize_asset(value) for value in values if isinstance(value, str) and value.strip()}))


def resolve_query_assets(question: str) -> tuple[str, ...]:
    """Resolve documented explicit syntax, preserving first-mention order.

    Lowercase ordinary hype/spy/sol/meta do not become asset intent. An exact
    uppercase standalone ticker is accepted as a short financial query; in a
    sentence these ambiguous words require a sigil or their unambiguous name.
    This intentionally does not parse negation, exclusions, or the word only.
    """
    found: list[tuple[int, int, str]] = []
    explicit_spans: list[tuple[int, int]] = []
    for match in _EXPLICIT.finditer(question):
        explicit_spans.append(match.span())
        raw = match.group("dollar") or match.group("exchange")
        if len(raw) <= 32:
            found.append((match.start(), 0, normalize_asset(raw)))
    for symbol in sorted(_BARE_SYMBOLS):
        if symbol not in _AMBIGUOUS_WORDS or question.strip() == symbol:
            for match in re.finditer(rf"{_LEFT_BOUNDARY}{re.escape(symbol)}{_RIGHT_BOUNDARY}", question, re.IGNORECASE):
                if not any(start <= match.start() < end for start, end in explicit_spans):
                    found.append((match.start(), 1, symbol))
        for alias in _ALIASES.get(symbol, ()):
            for match in re.finditer(rf"{_LEFT_BOUNDARY}{re.escape(alias)}{_RIGHT_BOUNDARY}", question, re.IGNORECASE):
                if not any(start <= match.start() < end for start, end in explicit_spans):
                    found.append((match.start(), 1, symbol))
    for pair, asset in _PAIR_ASSETS.items():
        # The only recognized quote currency is the actually supported USDT.
        pattern = rf"{_LEFT_BOUNDARY}{re.escape(pair)}{_RIGHT_BOUNDARY}"
        for match in re.finditer(pattern, question, re.IGNORECASE):
            if not any(start <= match.start() < end for start, end in explicit_spans):
                found.append((match.start(), 1, asset))
    ordered: dict[str, None] = {}
    for _, _, symbol in sorted(found):
        ordered.setdefault(symbol, None)
    return tuple(ordered)


@dataclass(frozen=True)
class Candidate:
    id: str
    assets: tuple[str, ...]


@dataclass(frozen=True)
class Selection:
    ids: tuple[str, ...]
    mentions: tuple[str, ...]
    covered: tuple[str, ...]
    missing: tuple[str, ...]
    eligible_count: int | None
    capacity: int
    reason: str

    def summary(self, *, input_source: str) -> dict:
        return {
            "policy_version": RETRIEVAL_POLICY_VERSION,
            "method": "explicit_asset_first" if self.mentions else "quality_order",
            "input_source": input_source,
            "mentions": list(self.mentions),
            "covered": list(self.covered),
            "missing": list(self.missing),
            "eligible_count": self.eligible_count,
            "selected_count": len(self.ids),
            "capacity": self.capacity,
            "reason": self.reason,
            "scope": "asset_tags_only_not_factual_verification",
        }


def select_evidence(candidates: Sequence[Candidate], mentions: Sequence[str], *, limit: int) -> Selection:
    """Cover available requested assets first, then target matches/background.

    The input must be in authoritative quality order. Selection never changes
    source data and never includes a candidate outside that eligible sequence.
    """
    capacity = max(0, limit)
    targets = tuple(dict.fromkeys(mentions))
    target_set = set(targets)
    selected: dict[str, Candidate] = {}
    covered: set[str] = set()
    for target in targets:
        if target in covered or len(selected) >= capacity:
            continue
        representative = next((candidate for candidate in candidates if target in candidate.assets), None)
        if representative is not None:
            selected[representative.id] = representative
            covered.update(target_set.intersection(representative.assets))
    for priority in (True, False):
        for candidate in candidates:
            if len(selected) >= capacity:
                break
            if candidate.id not in selected and bool(target_set.intersection(candidate.assets)) is priority:
                selected[candidate.id] = candidate
    actual_covered = {asset for candidate in selected.values() for asset in candidate.assets}.intersection(target_set)
    return Selection(
        ids=tuple(selected), mentions=targets,
        covered=tuple(asset for asset in targets if asset in actual_covered),
        missing=tuple(asset for asset in targets if asset not in actual_covered),
        eligible_count=len(candidates), capacity=capacity,
        reason="explicit_asset_priority" if targets else "no_explicit_asset",
    )


def model_selection_note(summary: dict | None) -> str:
    """A bounded asset-tag summary; complete internal lists are not model input."""
    if not summary:
        return "Asset-tag selection coverage was not recorded. Do not assume every requested asset has evidence."

    def display(values: object) -> str:
        items = values if isinstance(values, list) else []
        shown = [str(value).replace("\n", " ")[:32] for value in items[:3]]
        result = ", ".join(shown) or "none"
        if len(items) > len(shown):
            result += f" (+{len(items) - len(shown)} omitted)"
        return result

    note = (
        f"Explicit query assets: {display(summary.get('mentions'))}. "
        f"Selected evidence asset tags cover: {display(summary.get('covered'))}. "
        f"No selected evidence for: {display(summary.get('missing'))}. "
        "Other selected items can be background. Asset tags do not establish relevance or factual support."
    )
    return note[:MAX_MODEL_SELECTION_CHARS]
