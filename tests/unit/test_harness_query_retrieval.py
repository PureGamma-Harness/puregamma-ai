"""Raw-source replays of explicit asset coverage; no live provider/model calls."""
from copy import deepcopy
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import flag_modified

from apps.api.services import harness_run_service as service, research_event_service as research
from packages.data import earnings_calendar, macro_calendar
from packages.database.models import (
    Base, User, Source, RawDocument, NormalizedDocument, MarketQuoteRecord,
    MarketEvent, ResearchArtifact, EvidenceSnapshot, CreditReservationRecord,
    CreditSettlementRecord,
)
from packages.harness.retrieval import Candidate, model_selection_note, normalized_assets, resolve_query_assets, select_evidence

NOW = datetime(2026, 11, 14, 12, tzinfo=timezone.utc)


@pytest.fixture
def db(monkeypatch):
    engine = create_engine("sqlite://")
    Base.metadata.create_all(engine)
    settings = service.get_settings()
    monkeypatch.setattr(service, "get_settings", lambda: SimpleNamespace(**{
        **settings.__dict__, "harness_research_enabled": True,
        "harness_research_admin_only": False, "harness_max_runs_per_user_per_day": 100,
    }))
    monkeypatch.setattr(service, "queue_harness_run", lambda *args: "offline-no-queue")
    monkeypatch.setattr(service, "utcnow", lambda: NOW)
    monkeypatch.setattr(research, "utcnow", lambda: NOW)
    monkeypatch.setattr(research, "_fetch_deribit_metrics", lambda: None)
    monkeypatch.setattr(earnings_calendar, "upcoming_confirmed_earnings", lambda *a, **kw: [])
    monkeypatch.setattr(macro_calendar, "events_for", lambda *a, **kw: [])
    with Session(engine) as session:
        session.add(User(id="query-owner", email="query@example.invalid", name="Offline", plan="Pro", credit_balance=100000))
        session.commit()
        yield session
    engine.dispose()


def create(db, prompt, *, name="Research", sources=None):
    return service.create_harness_run(db, "query-owner", name=name, prompt=prompt,
        data_sources=["market"] if sources is None else sources,
        skill="harness_deep_research")[0]


def quotes(db, target="AAPL"):
    for index, symbol in enumerate([target] + [f"UNRELATED{n}" for n in range(12)]):
        observed = NOW - timedelta(minutes=60 if index == 0 else 1)
        db.add(MarketQuoteRecord(id=f"raw-{symbol}", symbol=symbol, base_asset=symbol,
            quote_asset="USD", asset_type="spot", provider="offline", price=100,
            change_24h_pct=7.5, source_timestamp=observed, fetched_at=NOW,
            provenance_json={"source_url": f"https://example.invalid/raw/{symbol}"}))
    db.commit()


def news(db):
    db.add(Source(id="query-source", provider="offline", provider_type="news", external_key="query", name="Constructed source"))
    db.flush()
    for index in range(13):
        asset = "ETH" if index == 12 else "BTC"
        raw = f"raw-news-{index}"
        url = f"https://example.invalid/news/{index}"
        db.add(RawDocument(id=raw, source_id="query-source", provider="offline",
            external_id=str(index), content_hash=f"raw-hash-{index}", raw_payload={"url": url},
            source_url=url, published_at=NOW, fetched_at=NOW))
        db.flush()
        db.add(NormalizedDocument(id=f"doc-{index}", raw_document_id=raw,
            source_id="query-source", provider="offline", source_type="reported_fact",
            source_name="Constructed source", title=f"{asset} observation {index}",
            summary=f"Constructed {asset} source {index}", url=url, published_at=NOW,
            created_at=NOW, symbols=[asset], final_score=0.6 if asset == "ETH" else 0.95,
            stable_hash=f"normalized-{index}", event_fingerprint=f"normal-event-{index}"))
    db.commit()


@pytest.mark.parametrize("target,question", [("AAPL", "Explain AAPL price movement."), ("BTC", "解释比特币价格变化和风险。")])
def test_explicit_target_survives_twelve_higher_confidence_unrelated_quotes(db, target, question):
    quotes(db, target)
    run = create(db, question)
    selected = service._gather_evidence(db, run)
    assert len(selected) == 12
    assert selected[0]["assets"] == [target]
    assert selected[0]["url"] == f"https://example.invalid/raw/{target}"
    assert [item["citation_index"] for item in selected] == list(range(1, 13))
    assert selected.selection["covered"] == [target]
    assert selected.selection["missing"] == []
    assert selected.selection["eligible_count"] == 13
    assert "evidence_selection" not in run.usage_json  # gather has no query-metadata write


def test_comparison_keeps_available_eth_evidence_when_btc_dominates_quality(db):
    news(db)
    run = create(db, "Compare BTC and ETH catalysts.", sources=["news"])
    selected = service._gather_evidence(db, run)
    assert len(selected) == 12
    assert [item["assets"] for item in selected[:2]] == [["BTC"], ["ETH"]]
    assert selected.selection["covered"] == ["BTC", "ETH"]
    assert selected.selection["missing"] == []


def test_legacy_run_without_input_provenance_keeps_quality_order(db):
    quotes(db)
    run = create(db, "Explain AAPL price movement.")
    run.usage_json = {key: value for key, value in run.usage_json.items() if key != "research_input"}
    db.commit()
    selected = service._gather_evidence(db, run)
    assert len(selected) == 12
    assert all(item["assets"] != ["AAPL"] for item in selected)
    assert selected.selection["reason"] == "original_question_unavailable"
    assert selected.selection["mentions"] == []


def test_prompt_provenance_excludes_conflicting_multiline_title(db):
    quotes(db, "ETH")
    run = create(db, "  Explain ETH movement.\nUse recorded sources.  ", name="BTC\nAAPL title")
    assert service._trusted_research_input(run)["raw_prompt"] == "Explain ETH movement.\nUse recorded sources."
    selected = service._gather_evidence(db, run)
    assert selected.selection["mentions"] == ["ETH"]
    assert selected[0]["assets"] == ["ETH"]


@pytest.mark.parametrize("query", ["What is market hype today?", "Do not spy on users", "sol is a normal word", "meta analysis of research", "Explain ON and IT", "General market outlook", "UNKNOWNXYZ"])
def test_ordinary_or_unknown_words_do_not_guess_target_assets(query):
    assert resolve_query_assets(query) == ()


@pytest.mark.parametrize("query,expected", [
    ("分析BTC新闻", ("BTC",)), ("Ethereum和比特币", ("ETH", "BTC")),
    ("$NEWC fundamentals", ("NEWC",)), ("NASDAQ:ON outlook", ("ON",)),
    ("BTCUSDT vs ETH/USDT", ("BTC", "ETH")), ("Apple Inc earnings", ("AAPL",)),
    ("苹果公司财报", ("AAPL",)), ("$SPY and QQQ", ("SPY", "QQQ")),
])
def test_explicit_asset_syntax_and_safe_names(query, expected):
    assert resolve_query_assets(query) == expected


def test_capacity_covers_requested_assets_without_unbounded_model_note():
    targets = tuple(f"X{index}" for index in range(100))
    candidates = [Candidate(str(index), (target,)) for index, target in enumerate(targets)]
    selected = select_evidence(candidates, targets, limit=12)
    assert len(selected.ids) == 12 and len(selected.covered) == 12 and len(selected.missing) == 88
    note = model_selection_note(selected.summary(input_source="request"))
    assert len(note) <= 600
    assert "omitted" in note and "background" in note and "not establish" in note


def test_shared_event_can_cover_two_targets_and_background_retains_quality_order():
    candidates = [Candidate("background", ("OTHER",)), Candidate("shared", ("BTC", "ETH")), Candidate("btc", ("BTC",))]
    selected = select_evidence(candidates, ("ETH", "BTC"), limit=3)
    assert selected.ids == ("shared", "btc", "background")
    assert selected.covered == ("ETH", "BTC")
    assert normalized_assets(["btc", " BTCUSDT ", "ETH", "eth"]) == ("BTC", "ETH")


@pytest.mark.parametrize("query,expected", [
    ("$AAPL.B", ("AAPL.B",)), ("$AAPL_B", ("AAPL_B",)),
    ("NASDAQ:BTC.X", ("BTC.X",)), ("$STRC-B", ("STRC-B",)),
    ("AAPL_B AAPL-XYZ AAPL.B", ()), ("$NEWC.", ("NEWC",)),
    ("Explain AAPL.", ("AAPL",)), ("$BTC/USDT", ("BTC",)),
    ("$BTC/XYZ", ("BTC/XYZ",)), ("strategy credit usage", ()),
])
def test_compound_tickers_are_never_shortened_to_known_prefixes(query, expected):
    assert resolve_query_assets(query) == expected


def test_supported_pair_forms_normalize_symmetrically_in_source_assets():
    assert normalized_assets(["btc/usdt", "BTC-USDT", "BTCUSDT", "ETH/USDT"]) == ("BTC", "ETH")


@pytest.mark.parametrize("mutation", [
    {"version": True}, {"source": []}, {"raw_name": " Research "}, {"parent_run_id": []},
], ids=["boolean-version", "unhashable-source", "untrimmed-name", "non-string-parent"])
def test_malformed_question_provenance_conservatively_keeps_legacy_selection(db, mutation):
    quotes(db)
    run = create(db, "Explain $AAPL price movement.")
    recorded = {**run.usage_json["research_input"], **mutation}
    run.usage_json = {**run.usage_json, "research_input": recorded, "retry_of": recorded["parent_run_id"]}
    # JSON dirty comparison treats True == 1; force persistence of the malformed
    # boolean so the database round trip does not silently restore integer 1.
    flag_modified(run, "usage_json")
    run.requested_goal_summary = f"{recorded['raw_name']}\n{recorded['raw_prompt']}"
    db.commit()

    assert service._trusted_research_input(run) is None
    selected = service._gather_evidence(db, run)
    assert len(selected) == 12
    assert all(item["assets"] != ["AAPL"] for item in selected)
    assert selected.selection["mentions"] == []
    assert selected.selection["reason"] == "original_question_unavailable"


def test_constructor_truncated_title_can_end_in_whitespace_without_losing_question(db):
    quotes(db)
    run = create(db, "Explain $AAPL price movement.", name="A" * 119 + " " + "truncated suffix")
    recorded = service._trusted_research_input(run)
    assert recorded is not None
    assert recorded["raw_name"] == "A" * 119 + " "
    selected = service._gather_evidence(db, run)
    assert selected[0]["assets"] == ["AAPL"]
    assert selected.selection["mentions"] == ["AAPL"]


def stub_gateway(monkeypatch):
    calls = []

    def execute(db, model, request):
        calls.append(deepcopy(request))
        return (
            SimpleNamespace(content="The recorded target movement is described in evidence [1].",
                usage=SimpleNamespace(input_tokens=100, output_tokens=30)),
            SimpleNamespace(provider=SimpleNamespace(id="offline-query-worker")),
        )

    monkeypatch.setattr("packages.gateway.service.execute_chat", execute)
    return calls


def test_worker_uses_actual_question_freezes_target_first_and_settles_once(db, monkeypatch):
    quotes(db)
    calls = stub_gateway(monkeypatch)
    prompt = "Explain $AAPL price movement.\nUse recorded observations."
    title = "BTC headline\nETH display title"
    run = create(db, prompt, name=title)
    assert db.query(CreditReservationRecord).count() == 1

    result = service.execute_queued_run(db, run.id)

    assert result["status"] == "completed", result
    assert len(calls) == 1 and calls[0]["max_tokens"] == 1200
    message = calls[0]["messages"][1]["content"]
    header, evidence_prompt = message.split("\n\nEvidence:\n", 1)
    assert header.startswith(f"Research question:\n{prompt}\n\nSelection coverage:")
    assert title not in message and "BTC headline" not in message and "ETH display title" not in message
    assert evidence_prompt.startswith("[1] Assets: AAPL. AAPL up")
    snapshot = db.get(EvidenceSnapshot, run.evidence_snapshot_id)
    frozen = deepcopy(snapshot.normalized_evidence_json)
    items = frozen["items"]
    assert len(items) == 12
    assert items[0]["assets"] == ["AAPL"]
    assert [item["citation_index"] for item in items] == list(range(1, 13))
    assert all(isinstance(item["assets"], list) for item in items)
    assert all(not {"evidence_selection", "mentions", "covered", "missing", "input_source"}.intersection(item) for item in items)
    artifact = db.get(ResearchArtifact, run.artifact_id)
    assert artifact.status == "validated"
    assert artifact.validation_result_json["evidence_selection"] == run.usage_json["evidence_selection"]
    assert run.usage_json["evidence_selection"]["mentions"] == ["AAPL"]
    assert run.usage_json["evidence_selection"]["covered"] == ["AAPL"]
    assert artifact.citations_json[0]["citation_index"] == 1
    assert artifact.citations_json[0]["url"] == items[0]["url"]
    reservation = db.query(CreditReservationRecord).one()
    settlement = db.query(CreditSettlementRecord).one()
    assert reservation.status == "SETTLED" and settlement.reservation_id == reservation.id
    balance = db.get(User, "query-owner").credit_balance
    settlement_amount = settlement.settled_credits

    replay = service.execute_queued_run(db, run.id)

    assert replay["status"] == "completed"
    assert len(calls) == db.query(ResearchArtifact).count() == 1
    assert db.query(CreditReservationRecord).count() == db.query(CreditSettlementRecord).count() == 1
    assert db.get(User, "query-owner").credit_balance == balance
    assert db.query(CreditSettlementRecord).one().settled_credits == settlement_amount
    assert db.get(EvidenceSnapshot, snapshot.id).normalized_evidence_json == frozen


def test_distinct_questions_reuse_identical_ordered_sources_without_mutating_bundle(db, monkeypatch):
    quotes(db)
    calls = stub_gateway(monkeypatch)
    first = create(db, "Describe $AAPL movement from recorded observations.")
    assert service.execute_queued_run(db, first.id)["status"] == "completed"
    frozen = db.get(EvidenceSnapshot, first.evidence_snapshot_id)
    payload = deepcopy(frozen.normalized_evidence_json)
    content_hash = frozen.content_hash
    first_selection = deepcopy(first.usage_json["evidence_selection"])

    second = create(db, "Explain the limitations of the recorded $AAPL movement.", name="Another analysis")
    assert service.execute_queued_run(db, second.id)["status"] == "completed"

    assert first.id != second.id and first.artifact_id != second.artifact_id
    assert first.evidence_snapshot_id == second.evidence_snapshot_id
    assert db.query(EvidenceSnapshot).count() == 1
    assert db.query(MarketEvent).count() == 13
    db.refresh(frozen)
    assert frozen.normalized_evidence_json == payload and frozen.content_hash == content_hash
    assert service.run_evidence(db, first) == service.run_evidence(db, second) == payload["items"]
    assert first.usage_json["evidence_selection"] == first_selection
    for run in (first, second):
        artifact = db.get(ResearchArtifact, run.artifact_id)
        assert artifact.validation_result_json["evidence_selection"] == run.usage_json["evidence_selection"]
    assert len(calls) == db.query(ResearchArtifact).count() == 2
    assert db.query(CreditReservationRecord).count() == db.query(CreditSettlementRecord).count() == 2
