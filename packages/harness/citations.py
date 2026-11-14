"""Deterministic reference-integrity policy for frozen research evidence.

This checks reference identity, not whether a source entails a model claim.
Only the documented [n] notation in Markdown prose is a research citation;
code examples cannot supply or invalidate references.

Version 2 follows CommonMark/GFM-table inline-block boundaries. Separate
paragraphs, headings or table cells cannot combine into a marker. The block
parser normalizes line endings and table escapes; inline syntax is retained
instead of converting formatted AST text into new numeric markers.
Unused footnote definitions, link destinations and images cannot supply a
marker; rendered link labels and GFM literal URL text retain visible markers.
"""
from __future__ import annotations

from dataclasses import dataclass
import re
from typing import Iterable

from markdown_it import MarkdownIt
from markdown_it.rules_inline.backticks import backtick
from markdown_it.rules_inline.html_inline import html_inline
from markdown_it.rules_inline.image import image
from markdown_it.rules_inline.link import link
from markdown_it.rules_inline.state_inline import StateInline
from mdit_py_plugins.footnote import footnote_plugin

CITATION_POLICY_VERSION = "numeric-marker-prose-v2"
_BRACKET_MARKER = re.compile(r"\[([^\[\]]*)\]")
_CODE_SPANS = "puregamma_citation_code_spans"
_HTML_SPANS = "puregamma_citation_html_spans"
_HIDDEN_SPANS = "puregamma_citation_hidden_spans"
_LINK_LABELS = "puregamma_citation_link_labels"
_URL_SPANS = "puregamma_citation_url_spans"


@dataclass(frozen=True)
class CitationValidation:
    referenced: tuple[int, ...]
    unknown: tuple[int, ...]
    malformed: tuple[str, ...]


def _capture_backticks(state: StateInline, silent: bool) -> bool:
    """Let the pinned CommonMark rule identify actual code, retaining offsets.

    An unmatched run also returns True from that rule but creates no code
    token. Silent lookahead must not mark text as code in the final parse.
    """
    start, count = state.pos, len(state.tokens)
    if state.src[start] == "`" and state.linkLevel == 0:
        # GFM literal autolinks consume ticks in their URL path before code
        # parsing. The maintained matcher supplies the URL extent; in
        # particular www URLs are not handled by MarkdownIt's :// inline rule.
        if any(begin <= start < end for begin, end in _url_spans(state.src, state.md, state.env)):
            end = start + 1
            while end < state.posMax and state.src[end] == "`":
                end += 1
            if not silent:
                state.append_pending(state.src[start:end])
            state.pos = end
            return True
    matched = backtick(state, silent)
    if matched and not silent and len(state.tokens) > count and state.tokens[-1].type == "code_inline":
        spans = state.env.setdefault(_CODE_SPANS, {})
        spans.setdefault(state.src, []).append((start, state.pos))
    return matched


def _url_spans(source: str, markdown: MarkdownIt, environment: dict) -> list[tuple[int, int]]:
    cache = environment.setdefault(_URL_SPANS, {})
    if source not in cache:
        matches = markdown.linkify.match(source) if markdown.linkify else []
        cache[source] = [
            (item.index, item.last_index)
            for item in matches or []
            if item.schema in {"http:", "https:"}
            or (item.raw.lower().startswith("www.") and (
                item.index == 0 or source[item.index - 1] in "(*_[]~ \t\r\n"
            ))
        ]
    return cache[source]


def _capture_html(state: StateInline, silent: bool) -> bool:
    start, count = state.pos, len(state.tokens)
    matched = html_inline(state, silent)
    if matched and not silent and len(state.tokens) > count and state.tokens[-1].type == "html_inline":
        spans = state.env.setdefault(_HTML_SPANS, {})
        spans.setdefault(state.src, []).append((start, state.pos))
    return matched


def _capture_link(state: StateInline, silent: bool) -> bool:
    start = state.pos
    label_end = state.md.helpers.parseLinkLabel(state, start, True) if state.src[start] == "[" else -1
    matched = link(state, silent)
    if matched and not silent:
        # Only the rendered label is prose. Preserve nested markers inside it,
        # while excluding the outer brackets, destination, title/ref suffix.
        spans = state.env.setdefault(_HIDDEN_SPANS, {})
        spans.setdefault(state.src, []).extend(((start, start + 1), (label_end, state.pos)))
        labels = state.env.setdefault(_LINK_LABELS, {})
        labels.setdefault(state.src, []).append((start + 1, label_end))
    return matched


def _capture_image(state: StateInline, silent: bool) -> bool:
    start = state.pos
    matched = image(state, silent)
    if matched and not silent:
        spans = state.env.setdefault(_HIDDEN_SPANS, {})
        spans.setdefault(state.src, []).append((start, state.pos))
    return matched


def _prose_blocks(content: str) -> Iterable[tuple[str, list[tuple[int, int]]]]:
    # Use the same CommonMark block and GFM table boundaries as the web reader.
    # In particular, list/quote indentation and unmatched fences are not a
    # second handwritten Markdown parser. Parser state is local to this call.
    markdown = MarkdownIt("commonmark", {"linkify": True}).enable(["table", "linkify"])
    markdown.use(footnote_plugin, inline=False)
    markdown.inline.ruler.at("backticks", _capture_backticks)
    markdown.inline.ruler.at("html_inline", _capture_html)
    markdown.inline.ruler.at("link", _capture_link)
    markdown.inline.ruler.at("image", _capture_image)
    environment: dict = {}
    tokens = markdown.parse(content, environment)
    spans = environment.get(_CODE_SPANS, {})
    literal_html = environment.get(_HTML_SPANS, {})
    hidden = environment.get(_HIDDEN_SPANS, {})
    for token in tokens:
        if token.type == "html_block":
            # The product escapes raw HTML into visible literal text. Neither
            # backticks nor backslashes inside it invoke Markdown code/escapes.
            yield token.content, [(0, len(token.content))]
            continue
        if token.type != "inline":
            continue
        # This is the block parser's inline Markdown, not AST text: [**1**]
        # cannot become [1], and an escaped opening bracket cannot become a
        # citation. Block-level line/table normalization is documented above.
        raw = list(token.content)
        for start, end in (*spans.get(token.content, ()), *hidden.get(token.content, ())):
            raw[start:end] = [char if char == "\n" else " " for char in raw[start:end]]
        # Do not concatenate blocks/cells into newly invented marker syntax.
        labels = environment.get(_LINK_LABELS, {}).get(token.content, [])
        # Unlike prose, actual literal URL text does not apply Markdown's
        # bracket escaping. Explicit Markdown link labels retain that escaping.
        urls = _url_spans(token.content, markdown, environment)
        literals = [span for span in urls if not any(a <= span[0] < b for a, b in labels)]
        yield "".join(raw), [*literal_html.get(token.content, []), *literals]


def _escaped(content: str, offset: int) -> bool:
    index = offset - 1
    while index >= 0 and content[index] == "\\":
        index -= 1
    return (offset - index - 1) % 2 == 1


def validate_citation_markers(content: str, evidence_indexes: Iterable[int]) -> CitationValidation:
    known = set(evidence_indexes)
    references: set[int] = set()
    malformed: dict[str, None] = {}
    for prose, literal_html in _prose_blocks(content):
        for match in _BRACKET_MARKER.finditer(prose):
            in_html = any(start <= match.start() < end for start, end in literal_html)
            if not in_html and _escaped(prose, match.start()):
                continue
            marker = match.group(1)
            candidate = marker.strip()
            if not candidate:
                continue
            numeric_start = candidate[0].isnumeric() or (
                candidate[0] in "+-−" and len(candidate) > 1 and candidate[1].isnumeric()
            )
            if not numeric_start:
                continue
            # Evidence indexes are small. Bound conversion independently of
            # Python's integer digit limit. Numeric-looking noncanonical forms
            # (fullwidth digits, signs, decimal/group/range notation) fail closed.
            if len(marker) > 9 or not marker.isascii() or not marker.isdigit() or marker.startswith("0"):
                malformed[marker] = None
            else:
                references.add(int(marker))
    return CitationValidation(
        referenced=tuple(sorted(references)),
        unknown=tuple(sorted(references - known)),
        malformed=tuple(malformed),
    )
