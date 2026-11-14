"""Replay raw-source observation through the real research/Harness boundary.

The fixed rows below are constructed fixtures, not captured market facts or
model-quality labels. Only external provider/model boundaries are replaced;
candidate generation, deduplication, gathering and snapshot freezing are real.
"""
from __future__ import annotations

from copy import deepcopy
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from apps.api.services import harness_run_service as harness
from apps.api.services import research_event_service as research
from packages.data import earnings_calendar, macro_calendar
from packages.data.earnings_calendar import ProviderUnavailable
from packages.database.models import (
    Base, EvidenceSnapshot, HarnessResearchRun, MarketEvent, MarketQuoteRecord,
    ResearchArtifact, ResearchSnapshot, User,
)

NOW = datetime(2026, 11, 14, 12, tzinfo=timezone.utc)
OWNER = "observed-evidence-owner"
EARNINGS_ROW = {
    "symbol": "AAPL", "name": "Apple", "as_of": "2026-11-16",
    "source_url": "https://example.invalid/recorded-calendar",
    "time_label": "after close",
}


@pytest.fixture
def db():
    engine = create_engine("sqlite://")
    Base.metadata.create_all(engine)
    with Session(engine) as session:
        session.add(User(id=OWNER, email="observed@example.invalid", name="Offline", plan="Pro", credit_balance=10000))
        session.commit()
        yield session
    engine.dispose()


@pytest.fixture(autouse=True)
def offline_providers(monkeypatch):
    monkeypatch.setattr(research, "utcnow", lambda: NOW)
    monkeypatch.setattr(research, "_fetch_deribit_metrics", lambda: None)
    monkeypatch.setattr(earnings_calendar, "upcoming_confirmed_earnings", lambda *a, **kw: [])
    monkeypatch.setattr(macro_calendar, "events_for", lambda *a, **kw: [])


def quote(db, *, change=7.5):
    row = MarketQuoteRecord(
        id="recorded-raw-btc", symbol="BTCUSDT", base_asset="BTC", quote_asset="USDT",
        asset_type="spot", provider="offline-recorded", price=100.0,
        change_24h_pct=change, source_timestamp=NOW, fetched_at=NOW,
        provenance_json={"source_url": "https://example.invalid/recorded-btc"},
    )
    db.add(row)
    db.commit()
    return row


def gather(db, *sources):
    return harness._gather_evidence(db, SimpleNamespace(usage_json={"data_sources": list(sources)}))


def snapshots(db):
    return db.query(ResearchSnapshot).order_by(ResearchSnapshot.created_at, ResearchSnapshot.id).all()


def test_repeated_current_observation_keeps_evidence_without_new_events(db):
    quote(db)
    first = gather(db, "market")
    original = db.query(MarketEvent).one()
    original_owner = original.research_snapshot_id
    second = gather(db, "market")

    assert len(first) == 1
    assert first == second
    assert first[0]["title"] == "BTC up 7.5% in 24h"
    assert "+7.50%" in first[0]["excerpt"]
    assert db.query(MarketEvent).count() == 1
    assert original.research_snapshot_id == original_owner
    builds = snapshots(db)
    assert builds[0].source_counts_json == {"price_move": 1}
    assert builds[1].source_counts_json == {}
    assert builds[1].health_json["price_move"]["observed_event_ids"] == [original.id]
    # Re-observation does not invent a new source collection timestamp.
    assert second[0]["fetched_at"] == first[0]["fetched_at"]


def test_scheduled_build_does_not_consume_evidence_for_later_research(db):
    quote(db)
    scheduled = research.build_research_events(db, kind="intraday", window_hours=24)
    event = db.query(MarketEvent).one()

    evidence = gather(db, "market")

    assert [item["id"] for item in evidence] == [event.id]
    assert event.research_snapshot_id == scheduled.id
    assert db.query(MarketEvent).count() == 1


@pytest.mark.parametrize("change", ["removed", "below_threshold", "outside_window"])
def test_old_active_event_is_not_a_fallback_when_no_longer_observed(db, change):
    raw = quote(db)
    first = gather(db, "market")
    if change == "removed":
        db.delete(raw)
    elif change == "below_threshold":
        raw.change_24h_pct = 1.0
    else:
        raw.fetched_at = NOW - timedelta(hours=25)
        raw.source_timestamp = raw.fetched_at
    db.commit()

    assert gather(db, "market") == []
    old = db.query(MarketEvent).one()
    assert old.id == first[0]["id"] and old.status == "active"
    assert snapshots(db)[-1].health_json["price_move"]["observed_event_ids"] == []


@pytest.mark.parametrize("second_result", ["unavailable", "empty"])
def test_provider_failure_or_empty_result_does_not_reuse_previous_event(db, monkeypatch, second_result):
    calls = []

    def provider(*args, **kwargs):
        calls.append(True)
        if len(calls) == 1:
            return [EARNINGS_ROW]
        if second_result == "unavailable":
            raise ProviderUnavailable("recorded provider outage")
        return []

    monkeypatch.setattr(earnings_calendar, "upcoming_confirmed_earnings", provider)
    assert len(gather(db, "earnings")) == 1

    assert gather(db, "earnings") == []
    assert len(calls) == 2
    assert db.query(MarketEvent).one().status == "active"
    health = snapshots(db)[-1].health_json["earnings_confirmed"]
    assert health["observed_event_ids"] == []
    assert health["status"] == ("unavailable" if second_result == "unavailable" else "ok")


def test_withdrawn_event_is_not_reactivated_by_a_repeated_raw_candidate(db):
    quote(db)
    assert len(gather(db, "market")) == 1
    event = db.query(MarketEvent).one()
    event.status = "withdrawn"
    db.commit()

    assert gather(db, "market") == []
    assert db.query(MarketEvent).count() == 1
    assert event.status == "withdrawn"


@pytest.mark.parametrize("requested,expected", [
    (["market"], {"price_move"}),
    (["earnings"], {"earnings_confirmed"}),
    ([], {"price_move", "earnings_confirmed"}),
])
def test_reused_observations_still_respect_requested_types_and_exclude_macro(db, monkeypatch, requested, expected):
    quote(db)
    monkeypatch.setattr(earnings_calendar, "upcoming_confirmed_earnings", lambda *a, **kw: [EARNINGS_ROW])
    monkeypatch.setattr(macro_calendar, "events_for", lambda *a, **kw: ["Constructed scheduled event"])
    research.build_research_events(db, kind="intraday", window_hours=24)
    original_count = db.query(MarketEvent).count()
    assert db.query(MarketEvent).filter_by(event_type="macro_scheduled").count() > 0

    evidence = gather(db, *requested)

    assert {item["source_scope"] for item in evidence} == expected
    assert len(evidence) == len(expected)
    assert db.query(MarketEvent).count() == original_count


@pytest.mark.parametrize("different_owner", [False, True])
def test_distinct_runs_freeze_reused_observations_without_mutating_prior_bundle(db, monkeypatch, different_owner):
    raw = quote(db)
    settings = harness.get_settings()
    monkeypatch.setattr(harness, "get_settings", lambda: SimpleNamespace(**{
        **settings.__dict__, "harness_research_enabled": True,
        "harness_research_admin_only": False, "harness_max_runs_per_user_per_day": 100,
        "harness_run_timeout_seconds": 3600,
    }))
    monkeypatch.setattr(harness, "queue_harness_run", lambda *a: "offline-noop")
    calls = []

    def gateway(db, model, request):
        calls.append(request)
        return SimpleNamespace(content="The recorded BTC move is described in evidence [1].", usage=SimpleNamespace(input_tokens=100, output_tokens=30)), SimpleNamespace(provider=SimpleNamespace(id="offline-recorded"))

    monkeypatch.setattr("packages.gateway.service.execute_chat", gateway)

    def execute(owner, prompt):
        run, created = harness.create_harness_run(db, owner, name="Recorded research", prompt=prompt, data_sources=["market"], skill="harness_deep_research")
        assert created
        result = harness.execute_queued_run(db, run.id)
        assert result["status"] == "completed", result
        assert result["evidence_count"] == result["citation_count"] == 1
        return db.get(HarnessResearchRun, run.id)

    first = execute(OWNER, "Describe the recorded BTC movement.")
    frozen = db.get(EvidenceSnapshot, first.evidence_snapshot_id)
    before = deepcopy(frozen.normalized_evidence_json)
    before_hash = frozen.content_hash
    original_event = db.query(MarketEvent).one()
    original_owner = original_event.research_snapshot_id
    second_owner = OWNER
    if different_owner:
        second_owner = "another-evidence-owner"
        db.add(User(id=second_owner, email="other-observed@example.invalid", name="Other", plan="Pro", credit_balance=10000))
        db.commit()
    second = execute(second_owner, "Explain the risks of the same recorded movement.")

    assert first.id != second.id
    assert harness.run_evidence(db, first) == harness.run_evidence(db, second)
    assert (first.evidence_snapshot_id == second.evidence_snapshot_id) is not different_owner
    assert db.get(EvidenceSnapshot, second.evidence_snapshot_id).user_id == second_owner
    assert db.query(MarketEvent).count() == 1

    raw.change_24h_pct = 9.0
    db.commit()
    third = execute(OWNER, "Describe the updated recorded movement.")

    db.refresh(frozen)
    assert third.evidence_snapshot_id != first.evidence_snapshot_id
    assert harness.run_evidence(db, third)[0]["title"] == "BTC up 9.0% in 24h"
    assert frozen.normalized_evidence_json == before
    assert frozen.content_hash == before_hash
    assert harness.run_evidence(db, first)[0]["title"] == "BTC up 7.5% in 24h"
    assert original_event.research_snapshot_id == original_owner
    assert db.query(MarketEvent).count() == 2
    assert db.query(ResearchArtifact).count() == len(calls) == 3
