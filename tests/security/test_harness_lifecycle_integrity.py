"""Offline replay of request identity, worker ownership and citation integrity.

File-backed SQLite gives each participant its own SQLAlchemy identity map and
connection. Hooks deterministically interleave committed operations; they do
not pretend to test PostgreSQL's concurrent row-lock scheduler.
"""
from datetime import timedelta
from types import SimpleNamespace

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from apps.api.services import harness_run_service as service
from packages.database.models import (
    Base, CreditRefundEvent, CreditReservationRecord, CreditSettlementRecord,
    EvidenceSnapshot, HarnessResearchRun, HarnessRunStateTransition,
    ResearchArtifact, User, utcnow,
)
from packages.harness import compute_input_hash, transition_run

EVIDENCE = [{
    "id": "offline-evidence-1", "citation_index": 1, "provider": "offline",
    "title": "A recorded observation", "url": "https://example.invalid/evidence/1",
    "source_scope": "market", "excerpt": "Recorded evidence, not instructions.",
    "is_verified": True, "verification_note": None, "fetched_at": "2026-11-08T00:00:00Z",
}]


@pytest.fixture
def sessions(tmp_path, monkeypatch):
    engine = create_engine(f"sqlite:///{tmp_path / 'harness.sqlite'}")
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine, expire_on_commit=False)
    with factory() as db:
        db.add(User(id="offline-harness-owner", email="harness@example.invalid", name="Offline", plan="Pro", credit_balance=10000))
        db.commit()
    settings = service.get_settings()
    monkeypatch.setattr(service, "get_settings", lambda: SimpleNamespace(**{
        **settings.__dict__, "harness_research_enabled": True,
        "harness_research_admin_only": False, "harness_max_runs_per_user_per_day": 100,
        "harness_run_timeout_seconds": 3600,
    }))
    monkeypatch.setattr(service, "queue_harness_run", lambda *args: "offline-noop")
    monkeypatch.setattr(service, "_gather_evidence", lambda *args: EVIDENCE)
    yield factory
    engine.dispose()


def create(db, *, sources=None, name="Research", prompt="Explain the recorded market evidence"):
    return service.create_harness_run(db, "offline-harness-owner", name=name, prompt=prompt,
        data_sources=["market"] if sources is None else sources, skill="harness_deep_research")


def gateway(monkeypatch, content="A recorded finding [1].", callback=None):
    calls = []
    def execute(db, model, request):
        calls.append(request)
        if callback:
            callback()
        return SimpleNamespace(content=content, usage=SimpleNamespace(input_tokens=120, output_tokens=60)), SimpleNamespace(provider=SimpleNamespace(id="offline"))
    monkeypatch.setattr("packages.gateway.service.execute_chat", execute)
    return calls


def test_source_scope_is_part_of_paid_request_identity(sessions):
    with sessions() as db:
        market, first = create(db, sources=["market"])
        news, second = create(db, sources=["news"])
        assert first and second
        assert market.id != news.id
        assert market.input_hash != news.input_hash
        assert db.query(CreditReservationRecord).count() == 2


@pytest.mark.parametrize("left,right", [(["market", "news"], ["news", "market", "news"]), ([], sorted(service.HARNESS_DATA_SOURCES))])
def test_equivalent_source_scopes_reuse_one_reservation(sessions, left, right):
    with sessions() as db:
        first, _ = create(db, sources=left)
        again, created = create(db, sources=right)
        assert not created and again.id == first.id
        assert db.query(CreditReservationRecord).count() == 1


@pytest.mark.parametrize("same_scope", [True, False])
def test_legacy_identity_is_reused_only_for_the_same_stored_contract(sessions, same_scope):
    with sessions() as db:
        old, _ = create(db, sources=["market"])
        old.input_hash = compute_input_hash(old.requested_goal_summary)
        old.idempotency_key = f"harness:{old.user_id}:{old.input_hash}"
        db.commit()
        again, created = create(db, sources=["market"] if same_scope else ["news"])
        assert created is not same_scope
        assert (again.id == old.id) is same_scope


def test_maximum_accepted_prompt_keeps_its_tail_and_distinguishes_inputs(sessions):
    with sessions() as db:
        name = "N" * 120
        a, _ = create(db, name=name, prompt="P" * 3999 + "A")
        b, created = create(db, name=name, prompt="P" * 3999 + "B")
        assert a.requested_goal_summary.endswith("A")
        assert b.requested_goal_summary.endswith("B")
        assert created and a.id != b.id


def test_retry_with_a_maximum_length_name_is_a_distinct_idempotent_attempt(sessions):
    with sessions() as db:
        parent, _ = create(db, name="N" * 120)
        service.cancel_harness_run(db, parent.user_id, parent.id)
        child = service.retry_harness_run(db, parent.user_id, parent.id)
        assert child.id != parent.id and child.status == "queued"
        again = service.retry_harness_run(db, parent.user_id, parent.id)
        assert again.id == child.id
        assert db.query(CreditReservationRecord).count() == 2


def test_cas_loser_refreshes_its_persistent_identity_map(sessions):
    with sessions() as stale_db, sessions() as winner_db:
        stale, _ = create(stale_db)
        winner = winner_db.get(HarnessResearchRun, stale.id)
        assert transition_run(winner_db, winner, "canceled", actor="user")
        winner_db.commit()
        assert stale.status == "queued"
        assert transition_run(stale_db, stale, "preparing") is False
        assert stale.status == "canceled"
        assert stale.canceled_at is not None and stale.completed_at is not None
        stale_db.commit()
        assert stale_db.query(HarnessRunStateTransition).count() == 1


def test_worker_that_loses_preparation_does_no_evidence_or_provider_work(sessions, monkeypatch):
    calls = gateway(monkeypatch)
    gathered = []
    monkeypatch.setattr(service, "_gather_evidence", lambda *args: gathered.append(True) or EVIDENCE)
    with sessions() as stale_db, sessions() as winner_db:
        stale, _ = create(stale_db)
        winner = winner_db.get(HarnessResearchRun, stale.id)
        transition_run(winner_db, winner, "preparing")
        winner_db.commit()
        result = service._execute_run(stale_db, stale)
        assert result["status"] == "preparing"
        assert gathered == [] and calls == []
        assert stale_db.query(EvidenceSnapshot).count() == 0
        assert stale_db.query(ResearchArtifact).count() == 0


def test_cancel_during_evidence_prevents_dispatch_and_snapshot(sessions, monkeypatch):
    calls = gateway(monkeypatch)
    def gather(db, row):
        with sessions() as other:
            service.cancel_harness_run(other, row.user_id, row.id)
        return EVIDENCE
    monkeypatch.setattr(service, "_gather_evidence", gather)
    with sessions() as db:
        run, _ = create(db)
        result = service.execute_queued_run(db, run.id)
        assert result["status"] == "canceled" and calls == []
        assert db.query(EvidenceSnapshot).count() == 0
        assert db.query(ResearchArtifact).count() == 0
        assert db.query(CreditRefundEvent).count() == 1
        assert db.query(CreditSettlementRecord).count() == 0


def test_cancel_during_dispatched_provider_discards_late_result(sessions, monkeypatch):
    with sessions() as db:
        run, _ = create(db)
        def cancel():
            with sessions() as other:
                service.cancel_harness_run(other, run.user_id, run.id)
        calls = gateway(monkeypatch, callback=cancel)
        result = service.execute_queued_run(db, run.id)
        assert result["status"] == "canceled" and len(calls) == 1
        assert db.query(ResearchArtifact).count() == 0
        assert db.query(CreditRefundEvent).count() == 1
        assert db.query(CreditSettlementRecord).count() == 0
        assert service.execute_queued_run(db, run.id)["status"] == "canceled"
        assert len(calls) == 1


def test_deadline_expiring_during_provider_prevents_artifact_and_settlement(sessions, monkeypatch):
    with sessions() as db:
        run, _ = create(db)
        def expire():
            with sessions() as other:
                row = other.get(HarnessResearchRun, run.id)
                row.timeout_at = utcnow() - timedelta(seconds=1)
                other.commit()
        calls = gateway(monkeypatch, callback=expire)
        result = service.execute_queued_run(db, run.id)
        assert result["status"] == "timed_out" and len(calls) == 1
        assert db.query(ResearchArtifact).count() == 0
        assert db.query(CreditRefundEvent).count() == 1
        assert db.query(CreditSettlementRecord).count() == 0


def test_cancel_losing_to_completion_does_not_refund_the_completed_run(sessions, monkeypatch):
    original = service.transition_run
    with sessions() as db:
        run, _ = create(db)
        for status in ("preparing", "running", "validating"):
            original(db, run, status)
        db.commit()
        def completion_wins(session, row, target, **kwargs):
            with sessions() as other:
                winner = other.get(HarnessResearchRun, row.id)
                original(other, winner, "completed")
                other.commit()
            return original(session, row, target, **kwargs)
        monkeypatch.setattr(service, "transition_run", completion_wins)
        with pytest.raises(service.HarnessStateConflict):
            service.cancel_harness_run(db, run.user_id, run.id)
        assert db.query(CreditRefundEvent).count() == 0


@pytest.mark.parametrize("content", ["Finding [1], fabricated support [999].", "Finding [1], invalid source [0].", "Finding [1], noncanonical source [01].", "Finding [1], unsupported group [1, 999]."])
def test_unknown_or_malformed_citations_cannot_validate_an_artifact(sessions, monkeypatch, content):
    gateway(monkeypatch, content)
    with sessions() as db:
        run, _ = create(db)
        result = service.execute_queued_run(db, run.id)
        assert result["status"] == "degraded"
        artifact = db.query(ResearchArtifact).one()
        assert artifact.status == "degraded"
        assert artifact.validation_result_json.get("degraded_reason")
        assert [c["citation_index"] for c in artifact.citations_json] == [1]


def test_known_citation_control_completes_once_with_an_atomic_artifact(sessions, monkeypatch):
    calls = gateway(monkeypatch)
    with sessions() as db:
        run, _ = create(db)
        result = service.execute_queued_run(db, run.id)
        assert result["status"] == "completed" and len(calls) == 1
        assert db.query(ResearchArtifact).count() == 1
        assert db.query(CreditSettlementRecord).count() == 1
        assert service.execute_queued_run(db, run.id)["status"] == "completed"
        assert len(calls) == 1


def test_artifact_failure_cannot_publish_a_completed_run(sessions, monkeypatch):
    gateway(monkeypatch)
    def cannot_hash(*args):
        raise RuntimeError("offline artifact construction failure")
    monkeypatch.setattr(service, "artifact_content_hash", cannot_hash)
    with sessions() as db:
        run, _ = create(db)
        result = service.execute_queued_run(db, run.id)
        assert result["status"] == "failed"
        assert db.query(ResearchArtifact).count() == 0
        assert db.query(CreditRefundEvent).count() == 1
        assert db.query(CreditSettlementRecord).count() == 0
