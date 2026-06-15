from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.core.database import get_db
from app.models.maid import Maid, SessionMaid
from app.models.session import Session as SessionModel
from app.schemas.maid import SessionMaidAdminRead, SessionMaidCreate

router = APIRouter(prefix="/session-maids", tags=["session-maids"])


def to_admin_read(row: SessionMaid) -> SessionMaidAdminRead:
    return SessionMaidAdminRead(
        id=row.id,
        session_id=row.session_id,
        maid_id=row.maid_id,
        is_available=row.is_available,
        maid_name=row.maid.name,
        maid_photo_url=row.maid.photo_url,
    )


def load_session_maid_with_maid(db: Session, session_maid_id: int) -> SessionMaid | None:
    return (
        db.execute(
            select(SessionMaid)
            .options(joinedload(SessionMaid.maid))
            .where(SessionMaid.id == session_maid_id)
        )
        .scalars()
        .first()
    )


@router.get("/", response_model=list[SessionMaidAdminRead])
def list_session_maids(
    session_id: int = Query(...),
    db: Session = Depends(get_db),
):
    rows = list(
        db.execute(
            select(SessionMaid)
            .options(joinedload(SessionMaid.maid))
            .where(SessionMaid.session_id == session_id)
            .order_by(SessionMaid.id.asc())
        )
        .scalars()
        .all()
    )

    return [to_admin_read(row) for row in rows]


@router.post("/", response_model=SessionMaidAdminRead)
def create_session_maid(payload: SessionMaidCreate, db: Session = Depends(get_db)):
    session_obj = db.get(SessionModel, payload.session_id)
    if not session_obj:
        raise HTTPException(status_code=404, detail="Session not found.")

    maid = db.get(Maid, payload.maid_id)
    if not maid:
        raise HTTPException(status_code=404, detail="Maid not found.")

    existing = (
        db.execute(
            select(SessionMaid).where(
                SessionMaid.session_id == payload.session_id,
                SessionMaid.maid_id == payload.maid_id,
            )
        )
        .scalars()
        .first()
    )

    if existing:
        raise HTTPException(status_code=400, detail="This maid is already linked to the session.")

    session_maid = SessionMaid(
        session_id=payload.session_id,
        maid_id=payload.maid_id,
        is_available=payload.is_available,
    )
    db.add(session_maid)
    db.commit()

    row = load_session_maid_with_maid(db, session_maid.id)
    return to_admin_read(row)


@router.patch("/{session_maid_id}", response_model=SessionMaidAdminRead)
def update_session_maid(
    session_maid_id: int,
    payload: SessionMaidCreate,
    db: Session = Depends(get_db),
):
    session_maid = db.get(SessionMaid, session_maid_id)
    if not session_maid:
        raise HTTPException(status_code=404, detail="Session maid not found.")

    session_obj = db.get(SessionModel, payload.session_id)
    if not session_obj:
        raise HTTPException(status_code=404, detail="Session not found.")

    maid = db.get(Maid, payload.maid_id)
    if not maid:
        raise HTTPException(status_code=404, detail="Maid not found.")

    existing = (
        db.execute(
            select(SessionMaid).where(
                SessionMaid.session_id == payload.session_id,
                SessionMaid.maid_id == payload.maid_id,
                SessionMaid.id != session_maid_id,
            )
        )
        .scalars()
        .first()
    )

    if existing:
        raise HTTPException(status_code=400, detail="This maid is already linked to the session.")

    session_maid.session_id = payload.session_id
    session_maid.maid_id = payload.maid_id
    session_maid.is_available = payload.is_available

    db.commit()

    row = load_session_maid_with_maid(db, session_maid.id)
    return to_admin_read(row)


@router.patch("/{session_maid_id}/toggle", response_model=SessionMaidAdminRead)
def toggle_session_maid(session_maid_id: int, db: Session = Depends(get_db)):
    session_maid = db.get(SessionMaid, session_maid_id)
    if not session_maid:
        raise HTTPException(status_code=404, detail="Session maid not found.")

    session_maid.is_available = not session_maid.is_available
    db.commit()

    row = load_session_maid_with_maid(db, session_maid.id)
    return to_admin_read(row)


@router.delete("/{session_maid_id}")
def delete_session_maid(session_maid_id: int, db: Session = Depends(get_db)):
    session_maid = db.get(SessionMaid, session_maid_id)
    if not session_maid:
        raise HTTPException(status_code=404, detail="Session maid not found.")

    db.delete(session_maid)
    db.commit()
    return {"success": True, "deleted_id": session_maid_id}