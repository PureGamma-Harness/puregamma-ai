"""Citation identity must come from prose, never Markdown code examples.

The fixtures use the web product's CommonMark code conventions. They assert
public validation results, not the scanner's internal masking representation.
They do not claim that a resolved reference entails a research conclusion.
"""

import pytest

from packages.harness.citations import validate_citation_markers


@pytest.mark.parametrize("content", [
    "Uncited assertion.\n\n```python\nvalues = [1]\n```",
    "Uncited assertion.\n\n~~~python\nvalues = [1]\n~~~",
    "Uncited assertion with literal `[1]`.",
    "Uncited assertion with literal ``one ` [1]``.",
    "Uncited assertion with literal ```one `` [1]```.",
    "Uncited assertion with multiline `one\n[1]`.",
    "Uncited assertion.\n\n```python\nvalues = [1]",
    "Uncited assertion.\n\n~~~python\nvalues = [1]",
    "Uncited assertion.\n\n    values = [1]\n",
    "Uncited assertion.\n\n\tvalues = [1]\n",
    "> ```python\n> values = [1]\n> ```",
    "- ```python\n  values = [1]\n  ```",
    "1. ~~~python\n   values = [1]\n   ~~~",
    "> - ```python\n>   values = [1]\n>   ```",
])
def test_code_literals_cannot_supply_a_research_citation(content):
    result = validate_citation_markers(content, [1])
    assert result.referenced == ()
    assert result.unknown == ()
    assert result.malformed == ()


@pytest.mark.parametrize("content", [
    "```python\n[999] [0] [01] [1, 2] [９] [+2]\n```\n\nFinding [1].",
    "~~~python\n[999] [0] [01] [1, 2] [９] [+2]\n~~~\n\nFinding [1].",
    "Literal `[999] [0] [01] [1, 2] [９] [+2]`; finding [1].",
    "````python\n```\n[999]\n```\n````\nFinding [1].",
    "~~~python\n```\n[999]\n```\n~~~\nFinding [1].",
    "```python\n[999]\n`````\nFinding [1].",
    "~~~python\n[999]\n~~~~~\nFinding [1].",
    "   ```python\n[999]\n   ```\nFinding [1].",
    "```python\n[999]\n``` trailing text\n[888]\n```\nFinding [1].",
    "```python\n[999]\n    ```\n[888]\n```\nFinding [1].",
    "```python\r\n[999]\r\n```\r\nFinding [1].",
    "> ```\n> [999]\n> ```\n\nFinding [1].",
    "> ```\n> [999]\nFinding [1].",
    "- ```\n  [999]\n  ```\n\nFinding [1].",
    "- ```\n  [999]\nFinding [1].",
    "Finding [1].\n\n    [999]\n\n    [888]\n\nMore prose.",
])
def test_code_does_not_poison_a_real_prose_citation(content):
    result = validate_citation_markers(content, [1])
    assert result.referenced == (1,)
    assert result.unknown == ()
    assert result.malformed == ()


@pytest.mark.parametrize("content", [
    "Unmatched ` means this [1] is prose.",
    "Unmatched `` means this [1] is prose.",
    "`first paragraph\n\n[1]`",
    r"Escaped \` literal does not hide [1].",
    "Escaped \\` with a later unmatched `; finding [1].",
    "Paragraph\n    continuation [1].",
    "Inline ``` without a matching run: [1].",
])
def test_unmatched_or_escaped_delimiters_do_not_hide_prose(content):
    assert validate_citation_markers(content, [1]).referenced == (1,)


@pytest.mark.parametrize("content", [
    r"An even pair \\`[1]` is a code span.",
    r"An opening `[1]\` closes despite the backslash inside code.",
    "Longer span ``[1] ` [999]`` remains code.",
    "``` a ` b [1] ```",
])
def test_inline_delimiter_lengths_and_code_escape_rules(content):
    result = validate_citation_markers(content, [1])
    assert result.referenced == ()
    assert result.unknown == ()


@pytest.mark.parametrize("boundary", ["# heading", "- list", "> quote", "---", "==="])
def test_inline_delimiters_do_not_cross_new_markdown_blocks(boundary):
    result = validate_citation_markers(f"`open\n{boundary}\n[1]` prose [2].", [1, 2])
    assert result.referenced == (1, 2)


@pytest.mark.parametrize("marker", [
    "0", "01", "+1", "−1", "1.0", "1, 2", "1:2", "１", " 1 ",
    "1,\n999", "9" * 5000,
])
def test_strict_numeric_prose_policy_is_preserved(marker):
    result = validate_citation_markers(f"Literal `[1]`, authored [{marker}].", [1])
    assert result.referenced == ()
    assert result.unknown == ()
    assert result.malformed == (marker,)


def test_real_prose_reference_set_is_still_sorted_deduplicated_and_checked():
    result = validate_citation_markers("Finding [2], [1], [2], missing [999]; code `[888]`.", [1, 2])
    assert result.referenced == (1, 2, 999)
    assert result.unknown == (999,)
    assert result.malformed == ()


def test_existing_backslash_bracket_escape_policy_is_preserved():
    result = validate_citation_markers(r"Escaped \[1], escaped \[999], actual [2].", [1, 2])
    assert result.referenced == (2,)
    assert result.unknown == ()


@pytest.mark.parametrize("slashes,unknown", [(1, ()), (2, (999,)), (3, ()), (4, (999,))])
def test_bracket_escaping_uses_backslash_parity(slashes, unknown):
    result = validate_citation_markers("Literal " + "\\" * slashes + "[999]", [1])
    assert result.unknown == unknown


@pytest.mark.parametrize("content", [
    ">     [1]\n", "-     [1]\n", "1.     [1]\n", "> -     [1]\n",
    "> quote\n>\n>     [1]\n",
])
def test_container_indented_code_is_not_prose(content):
    assert validate_citation_markers(content, [1]).referenced == ()


@pytest.mark.parametrize("content,referenced,malformed", [
    ("[**1**]", (), ()),
    ("[1**]", (), ("1**",)),
    ("[ 1 ]", (), (" 1 ",)),
    ("[\\1]", (), ()),
    (r"\[1]", (), ()),
])
def test_ast_formatting_cannot_manufacture_a_canonical_numeric_marker(content, referenced, malformed):
    result = validate_citation_markers(content, [1])
    assert result.referenced == referenced
    assert result.malformed == malformed


def test_gfm_table_code_and_cell_boundaries_match_the_reader():
    content = "| Example | Finding |\n|---|---|\n| `[999]` | Finding [1] |\n| `unclosed | [2]` |"
    result = validate_citation_markers(content, [1, 2])
    assert result.referenced == (1, 2)
    assert result.unknown == ()


@pytest.mark.parametrize("separated", [
    "[999\n\n].", "[999\n# Heading\n].", "| [999 | ] |\n|---|---|",
])
def test_v2_marker_syntax_cannot_be_assembled_across_inline_blocks(separated):
    result = validate_citation_markers("Finding [1].\n\n" + separated, [1])
    assert result.referenced == (1,)
    assert result.unknown == ()
    assert result.malformed == ()


def test_table_escape_normalization_does_not_create_a_canonical_marker():
    result = validate_citation_markers("| Finding |\n|---|\n| [1\\|2] |", [1])
    assert result.referenced == ()
    assert result.malformed == ("1|2",)


@pytest.mark.parametrize("html", [
    "<div>\nUnsupported claim [999].\n</div>",
    "<!-- Unsupported claim [999]. -->",
    "<div>\nLiteral `[999]` remains visible.\n</div>",
    "<div>\nLiteral \\[999] remains visible.\n</div>",
    "<script>\nconst values = [999]\n</script>",
])
def test_escaped_html_blocks_remain_visible_literal_evidence_text(html):
    result = validate_citation_markers(html + "\n\nFinding [1].", [1])
    assert result.referenced == (1, 999)
    assert result.unknown == (999,)


def test_fenced_html_is_still_a_code_example():
    content = "```html\n<div>[999]</div>\n```\n\nFinding [1]."
    result = validate_citation_markers(content, [1])
    assert result.referenced == (1,)
    assert result.unknown == ()


@pytest.mark.parametrize("html", [
    r"<span data-ref='\[999]'>label</span>",
    r"<!-- literal \[999] -->",
    r"<span data-ref='\[999]' data-code='`[888]`'>label</span>",
    "<span\n data-ref='\\[999]'>label</span>",
])
def test_inline_html_is_visible_literal_text_not_markdown_escaping(html):
    result = validate_citation_markers("Finding [1]. " + html, [1])
    assert 999 in result.unknown


def test_html_literal_ranges_do_not_change_adjacent_prose_or_code():
    content = r"Finding [1]. <span title='\[999]'>label</span> prose \[888] and code `<span>\[777]</span>`."
    result = validate_citation_markers(content, [1])
    assert result.referenced == (1, 999)
    assert result.unknown == (999,)


@pytest.mark.parametrize("content,referenced", [
    ("Uncited assertion.\n\n[^hidden]: Evidence [1].", ()),
    ("Finding [1].\n\n[^hidden]: Unsupported [999].", (1,)),
    ("Footnote[^visible].\n\n[^visible]: Finding [1].", (1,)),
    ("Footnote[^visible].\n\n[^visible]: Literal `[999]`, finding [1].", (1,)),
    ("Literal ^[1] is not a GFM inline-footnote extension.", (1,)),
])
def test_only_rendered_gfm_footnote_content_can_supply_markers(content, referenced):
    result = validate_citation_markers(content, [1])
    assert result.referenced == referenced
    assert result.unknown == ()


@pytest.mark.parametrize("url", [
    "https://example.invalid/`[999]`", "http://example.invalid/`[999]`",
    "www.example.com/`[999]`", "WWW.example.com/`[999]`",
])
def test_gfm_literal_url_backticks_cannot_hide_a_visible_unknown_marker(url):
    result = validate_citation_markers("Finding [1]. URL " + url + " outside `[888]`.", [1])
    assert result.referenced == (1, 999)
    assert result.unknown == (999,)


@pytest.mark.parametrize("content", [
    "Literal `www.example.com/[999]`, finding [1].",
    "Literal `https://example.invalid/[999]`, finding [1].",
    "URL www.example.com/`literal followed by real `[888]`; finding [1].",
])
def test_gfm_url_recognition_does_not_consume_real_code_or_cross_url_end(content):
    result = validate_citation_markers(content, [1])
    assert result.referenced == (1,)
    assert result.unknown == ()


@pytest.mark.parametrize("content", [
    "Uncited [1](https://example.invalid).",
    "Uncited [1][source].\n\n[source]: https://example.invalid",
    "Uncited [details][1].\n\n[1]: https://example.invalid",
    "Uncited ![1](https://example.invalid).",
    "Uncited ![alt][1].\n\n[1]: https://example.invalid",
])
def test_link_or_image_syntax_cannot_manufacture_a_visible_marker(content):
    result = validate_citation_markers(content, [1])
    assert result.referenced == ()


@pytest.mark.parametrize("content", [
    "Finding [1]. [details](https://example.invalid/[999]).",
    'Finding [1]. [details](https://example.invalid "title [999]").',
    "Finding [1]. ![alt [999]](https://example.invalid/[888]).",
    "Finding [1]. [details][source].\n\n[source]: https://example.invalid/[999]",
    "Visible [[1]](https://example.invalid/[999]).",
    "Visible [Read source [1]](https://example.invalid/[999]).",
    "Finding [1]. [Read source `[999]`](https://example.invalid).",
])
def test_visible_link_labels_preserve_inner_markers_but_hide_metadata(content):
    result = validate_citation_markers(content, [1])
    assert result.referenced == (1,)
    assert result.unknown == ()


def test_fence_cannot_be_closed_by_the_other_fence_character():
    result = validate_citation_markers("```python\n[999]\n~~~\nFinding [1].", [1])
    assert result.referenced == ()
    assert result.unknown == ()


def test_many_different_unmatched_backtick_runs_remain_literal_prose():
    # Distinct delimiter lengths have no partner. They cannot hide the final
    # citation or trigger a scan of the whole suffix for every backtick run.
    content = " ".join("`" * length for length in range(1, 200)) + " [1]"
    assert validate_citation_markers(content, [1]).referenced == (1,)
