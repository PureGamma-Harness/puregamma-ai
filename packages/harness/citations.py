"""Deterministic reference-integrity policy for frozen research evidence.

This checks reference identity, not whether a source entails a model claim.
Only the documented [n] notation is accepted as a research citation.
"""
from __future__ import annotations

from dataclasses import dataclass
import re
from typing import Iterable

CITATION_POLICY_VERSION = "numeric-marker-v1"
_BRACKET_MARKER = re.compile(r"(?<!\\)\[([^\[\]\r\n]*)\]")


@dataclass(frozen=True)
class CitationValidation:
    referenced: tuple[int, ...]
    unknown: tuple[int, ...]
    malformed: tuple[str, ...]


def validate_citation_markers(content: str, evidence_indexes: Iterable[int]) -> CitationValidation:
    known = set(evidence_indexes)
    references: set[int] = set()
    malformed: dict[str, None] = {}
    for match in _BRACKET_MARKER.finditer(content):
        marker = match.group(1)
        candidate = marker.strip()
        if not candidate:
            continue
        numeric_start = candidate[0].isnumeric() or (
            candidate[0] in "+-−" and len(candidate) > 1 and candidate[1].isnumeric()
        )
        if not numeric_start:
            continue
        # Evidence indexes are small. Bound conversion independently of Python's
        # integer digit limit. Numeric-looking noncanonical forms (including
        # fullwidth digits, signs, decimal/group/range notation) fail closed.
        if len(marker) > 9 or not marker.isascii() or not marker.isdigit() or marker.startswith("0"):
            malformed[marker] = None
        else:
            references.add(int(marker))
    return CitationValidation(
        referenced=tuple(sorted(references)),
        unknown=tuple(sorted(references - known)),
        malformed=tuple(malformed),
    )
