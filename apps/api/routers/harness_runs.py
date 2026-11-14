"""Harness deep-research HTTP contract (docs/mobile/MOBILE_API_CONTRACT.md §2).

GET/POST /api/research/runs* — create, list, detail, cancel, retry,
evidence, artifacts and a lightweight SSE progress stream. All rows are
ownership-checked against the authenticated user; no admin surface here.
"""

from __future__ import annotations

import time

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from apps.api.dependencies import get_current_user, get_db
from apps.api.services import harness_run_service
from apps.api.services.harness_run_service import (
    HarnessDisabledError,
    HarnessQuotaError,
    HarnessStateConflict,
    HARNESS_SKILL_ALLOWLIST,
)
from packages.database.models import HarnessResearchRun, User

router = APIRouter(prefix="/research", tags=["harness-research"])


class HarnessRunCreate(BaseModel):
    name: str = Field(default="", max_length=120)
    prompt: str = Field(min_length=1, max_length=4000)
    data_sources: list[str] = Field(default_factory=list, max_length=4)
    skill: str = Field(default="harness_deep_research", max_length=64)


def _serialize(db: Session, run: HarnessResearchRun) -> dict:
    return harness_run_service.serialize_harness_run(
        run,
        evidence_count=len(harness_run_service.run_evidence(db, run)),
    )


@router.post("/runs", status_code=201)
def create_run(
    payload: HarnessRunCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict:
    try:
        row, created = harness_run_service.create_harness_run(
            db,
            user.id,
            name=payload.name,
            prompt=payload.prompt,
            data_sources=payload.data_sources,
            skill=payload.skill,
        )
    except HarnessDisabledError as exc:
        raise HTTPException(status_code=403, detail={"code": "HARNESS_DISABLED", "message": str(exc)}) from exc
    except HarnessQuotaError as exc:
        raise HTTPException(status_code=429, detail={"code": "HARNESS_QUOTA_EXCEEDED", "message": str(exc)}) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail={"code": "HARNESS_BAD_REQUEST", "message": str(exc)}) from exc

    if row.status == "queued":
        try:
            harness_run_service.queue_harness_run(db, row.id)
            db.refresh(row)
        except RuntimeError as exc:
            raise HTTPException(status_code=503, detail={"code": "HARNESS_QUEUE_UNAVAILABLE", "message": str(exc)}) from exc
    return {"run": _serialize(db, row), "created": created}


@router.get("/runs")
def list_runs(
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict:
    rows, total = harness_run_service.list_harness_runs(db, user.id, limit=limit, offset=offset)
    return {"runs": [_serialize(db, row) for row in rows], "total": total, "limit": limit, "offset": offset}


def _own_run(db: Session, user: User, run_id: str) -> HarnessResearchRun:
    row = (
        db.query(HarnessResearchRun)
        .filter(HarnessResearchRun.id == run_id, HarnessResearchRun.user_id == user.id)
        .one_or_none()
    )
    if row is None:
        raise HTTPException(status_code=404, detail="Research run not found")
    return row


@router.get("/runs/{run_id}")
def get_run(
    run_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict:
    return {"run": _serialize(db, _own_run(db, user, run_id))}


@router.post("/runs/{run_id}/cancel")
def cancel_run(
    run_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict:
    try:
        row = harness_run_service.cancel_harness_run(db, user.id, run_id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except HarnessStateConflict as exc:
        raise HTTPException(status_code=409, detail={"code": "STATE_CONFLICT", "message": str(exc)}) from exc
    return {"run": _serialize(db, row)}


@router.post("/runs/{run_id}/retry")
def retry_run(
    run_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict:
    try:
        row = harness_run_service.retry_harness_run(db, user.id, run_id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except HarnessStateConflict as exc:
        raise HTTPException(status_code=409, detail={"code": "STATE_CONFLICT", "message": str(exc)}) from exc
    except HarnessQuotaError as exc:
        raise HTTPException(status_code=429, detail={"code": "HARNESS_QUOTA_EXCEEDED", "message": str(exc)}) from exc
    return {"run": _serialize(db, row)}


@router.get("/runs/{run_id}/evidence")
def get_evidence(
    run_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict:
    run = _own_run(db, user, run_id)
    evidence = harness_run_service.run_evidence(db, run)
    return {"evidence": evidence, "total": len(evidence)}


@router.get("/runs/{run_id}/artifacts")
def get_artifacts(
    run_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict:
    run = _own_run(db, user, run_id)
    return {"artifacts": harness_run_service.run_artifacts(db, run)}


@router.get("/runs/{run_id}/events")
def stream_events(
    run_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> StreamingResponse:
    """Lightweight SSE: poll the run status every 2s until terminal (max 90s).

    Clients must ignore unknown events and fall back to GET /runs/{id} on
    reconnect — this stream never blocks forever and never holds a DB
    transaction open between polls.
    """
    row = _own_run(db, user, run_id)
    owner_id = user.id
    initial = {"status": row.status, "updated_at": str(row.updated_at), "error": row.error_summary}
    bind = db.get_bind()
    # Authentication and ownership checks started a read transaction. Release
    # it before streaming; retaining it also hides worker commits under repeatable
    # read isolation. Each poll below owns a separate, short-lived read session.
    db.rollback()

    def event_stream():
        current = initial
        yield _sse("run.state", {"run_id": run_id, "status": current["status"], "updated_at": current["updated_at"]})
        deadline = time.monotonic() + 90
        while True:
            status = current["status"]
            terminal = {"run_id": run_id, "status": status, "updated_at": current["updated_at"]}
            if status in {"completed", "degraded"}:
                yield _sse("run.completed", {**terminal, "verified": status == "completed", "degraded": status == "degraded"})
                return
            if status in {"failed", "timed_out"}:
                yield _sse("run.failed", {**terminal, "message": current["error"] or ("timed out" if status == "timed_out" else "failed")})
                return
            if status == "canceled":
                yield _sse("run.canceled", terminal)
                return
            if time.monotonic() >= deadline:
                yield _sse("run.state", terminal)
                return
            time.sleep(2)
            # Select scalar fields so no expired ORM entity escapes the session.
            # Close/rollback before yielding or sleeping, including early exits.
            with Session(bind=bind) as reader:
                fresh = reader.query(
                    HarnessResearchRun.status, HarnessResearchRun.updated_at,
                    HarnessResearchRun.error_summary,
                ).filter(
                    HarnessResearchRun.id == run_id,
                    HarnessResearchRun.user_id == owner_id,
                ).one_or_none()
                observed = None if fresh is None else {
                    "status": fresh.status, "updated_at": str(fresh.updated_at), "error": fresh.error_summary,
                }
            if observed is None:
                yield _sse("run.failed", {"run_id": run_id, "message": "run disappeared"})
                return
            if observed["status"] != current["status"]:
                yield _sse("run.state", {"run_id": run_id, "status": observed["status"], "updated_at": observed["updated_at"]})
            current = observed

    return StreamingResponse(event_stream(), media_type="text/event-stream")


def _sse(event: str, data: dict) -> str:
    import json

    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"
