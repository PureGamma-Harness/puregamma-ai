"""Replay committed worker updates through the real SSE response iterator.

Two file-backed SQLite sessions reproduce identity-map staleness without
network services or wall-clock sleeps. This does not assert PostgreSQL SLOs.
"""
import asyncio
import json
from types import SimpleNamespace

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from apps.api.routers import harness_runs as router
from packages.database.models import Base, HarnessResearchRun, User
from packages.harness import transition_run


@pytest.fixture
def sessions(tmp_path):
    engine = create_engine(f"sqlite:///{tmp_path / 'stream.sqlite'}")
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine, expire_on_commit=False)
    with factory() as db:
        db.add(User(id="stream-owner", email="stream@example.invalid", name="Offline"))
        db.add(HarnessResearchRun(
            id="owned-run", user_id="stream-owner", status="running",
            input_hash="offline-input", harness_version="offline", runtime_version="offline",
            cordis_config_hash="offline", plugin_lock_hash="offline",
            idempotency_key="offline-stream", trace_id="owned-run",
        ))
        db.commit()
    yield factory, engine
    engine.dispose()


def collect(response, db, engine):
    async def consume():
        events = []
        idle = []
        async for chunk in response.body_iterator:
            text = chunk.decode() if isinstance(chunk, bytes) else chunk
            fields = dict(line.split(": ", 1) for line in text.strip().splitlines())
            events.append((fields["event"], json.loads(fields["data"])))
            idle.append((db.in_transaction(), engine.pool.checkedout()))
        return events, idle
    return asyncio.run(consume())


@pytest.mark.parametrize("terminal,event", [
    ("completed", "run.completed"), ("degraded", "run.completed"),
    ("failed", "run.failed"), ("canceled", "run.canceled"),
    ("timed_out", "run.failed"),
])
def test_stream_observes_another_workers_committed_terminal(sessions, monkeypatch, terminal, event):
    factory, engine = sessions
    clock = SimpleNamespace(now=0, sleeps=0)
    def sleep(seconds):
        clock.now += seconds
        clock.sleeps += 1
        if clock.sleeps == 1:
            with factory() as worker:
                run = worker.get(HarnessResearchRun, "owned-run")
                if terminal in {"completed", "degraded"}:
                    transition_run(worker, run, "validating")
                transition_run(worker, run, terminal)
                run.error_summary = "Offline failure" if terminal == "failed" else None
                worker.commit()
    monkeypatch.setattr(router, "time", SimpleNamespace(monotonic=lambda: clock.now, sleep=sleep))
    with factory() as reader:
        owner = reader.get(User, "stream-owner")
        # The endpoint itself preloads the row; keeping this strong reference
        # reproduces the production identity-map failure on the old version.
        response = router.stream_events("owned-run", reader, owner)
        events, idle = collect(response, reader, engine)
    assert [data["status"] for name, data in events if name == "run.state"] == ["running", terminal]
    assert events[-1][0] == event
    assert events[-1][1]["status"] == terminal
    assert events[-1][1]["updated_at"]
    if terminal in {"completed", "degraded"}:
        assert events[-1][1]["degraded"] is (terminal == "degraded")
        assert events[-1][1]["verified"] is (terminal == "completed")
    assert clock.sleeps == 1
    assert all(not transaction and connections == 0 for transaction, connections in idle)


def test_already_terminal_stream_emits_without_waiting_or_holding_transaction(sessions, monkeypatch):
    factory, engine = sessions
    with factory() as worker:
        worker.get(HarnessResearchRun, "owned-run").status = "degraded"
        worker.commit()
    def no_wait(_seconds):
        raise AssertionError("a known terminal run must not sleep")
    monkeypatch.setattr(router, "time", SimpleNamespace(monotonic=lambda: 0, sleep=no_wait))
    with factory() as reader:
        response = router.stream_events("owned-run", reader, reader.get(User, "stream-owner"))
        events, idle = collect(response, reader, engine)
    assert [name for name, _ in events] == ["run.state", "run.completed"]
    assert events[-1][1]["degraded"] is True
    assert all(not transaction and connections == 0 for transaction, connections in idle)


def test_each_poll_rechecks_owner_without_disclosing_new_owners_result(sessions, monkeypatch):
    factory, engine = sessions
    clock = SimpleNamespace(now=0)
    def sleep(seconds):
        clock.now += seconds
        if clock.now != seconds:
            return
        with factory() as worker:
            worker.add(User(id="other-owner", email="other@example.invalid", name="Other"))
            run = worker.get(HarnessResearchRun, "owned-run")
            run.user_id = "other-owner"
            run.status = "failed"
            run.error_summary = "OTHER OWNER PRIVATE RESULT"
            worker.commit()
    monkeypatch.setattr(router, "time", SimpleNamespace(monotonic=lambda: clock.now, sleep=sleep))
    with factory() as reader:
        response = router.stream_events("owned-run", reader, reader.get(User, "stream-owner"))
        events, idle = collect(response, reader, engine)
    assert events[-1][0] == "run.failed"
    assert events[-1][1]["message"] == "run disappeared"
    assert "OTHER OWNER" not in json.dumps(events)
    assert all(not transaction and connections == 0 for transaction, connections in idle)
