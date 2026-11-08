"""Deterministic reference-integrity policy for frozen research evidence.

This checks reference identity, not whether a source entails a model claim.
Only the documented [n] notation is accepted as a research citation.
"""
from __future__ import annotations

from dataclasses import dataclass
import re
from typing import Iterable

CITATION_POLICY_VERSION = "numeric-marker-v1"
_NUMERIC_MARKER = re.compile(r"(?<!\\)\[([0-9][0-9,;\s-]*|-[0-9]+)\]")


@dataclass(frozen=True)
class CitationValidation:
    referenced: tuple[int, ...]
    unknown: tuple[int, ...]
    malformed: tuple[str, ...]


def validate_citation_markers(content: str, evidence_indexes: Iterable[int]) -> CitationValidation:
    known = set(evidence_indexes)
    references: set[int] = set()
    malformed: dict[str, None] = {}
    for match in _NUMERIC_MARKER.finditer(content):
        marker = match.group(1)
        # Evidence indexes are small. Bound conversion independently of Python's
        # integer digit limit, and reject zero/leading-zero/group/range notation.
        if len(marker) > 9 or not marker.isascii() or not marker.isdigit() or marker.startswith("0"):
            malformed[marker] = None
        else:
            references.add(int(marker))
    return CitationValidation(
        referenced=tuple(sorted(references)),
        unknown=tuple(sorted(references - known)),
        malformed=tuple(malformed),
    )
