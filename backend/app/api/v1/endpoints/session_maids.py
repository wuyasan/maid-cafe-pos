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


def load_session_maid_with_maid(
    db: Session,
    session_maid_id: int,
) -> SessionMaid | None:
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


@router.put(
    "/session/{session_id}/maid/{maid_id}/availability",
    response_model=SessionMaidAdminRead,
)
def set_session_maid_availability(
    session_id: int,
    maid_id: int,
    is_available: bool = Query(...),
    db: Session = Depends(get_db),
):
    if not db.get(SessionModel, session_id):
        raise HTTPException(status_code=404, detail="Session not found.")
    if not db.get(Maid, maid_id):
        raise HTTPException(status_code=404, detail="Maid not found.")

    row = (
        db.execute(
            select(SessionMaid).where(
                SessionMaid.session_id == session_id,
                SessionMaid.maid_id == maid_id,
            )
        )
        .scalars()
        .first()
    )

    if row is None:
        row = SessionMaid(
            session_id=session_id,
            maid_id=maid_id,
            is_available=is_available,
        )
        db.add(row)
        db.flush()
    else:
        row.is_available = is_available

    db.commit()
    return to_admin_read(
        load_session_maid_with_maid(db, row.id)
    )


@router.post("/", response_model=SessionMaidAdminRead)
def create_session_maid(
    payload: SessionMaidCreate,
    db: Session = Depends(get_db),
):
    if not db.get(SessionModel, payload.session_id):
        raise HTTPException(status_code=404, detail="Session not found.")
    if not db.get(Maid, payload.maid_id):
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
        raise HTTPException(
            status_code=400,
            detail="This maid is already linked to the session.",
        )

    row = SessionMaid(
        session_id=payload.session_id,
        maid_id=payload.maid_id,
        is_available=payload.is_available,
    )
    db.add(row)
    db.commit()
    return to_admin_read(
        load_session_maid_with_maid(db, row.id)
    )


@router.patch("/{session_maid_id}", response_model=SessionMaidAdminRead)
def update_session_maid(
    session_maid_id: int,
    payload: SessionMaidCreate,
    db: Session = Depends(get_db),
):
    row = db.get(SessionMaid, session_maid_id)
    if not row:
        raise HTTPException(status_code=404, detail="Session maid not found.")

    row.session_id = payload.session_id
    row.maid_id = payload.maid_id
    row.is_available = payload.is_available
    db.commit()
    return to_admin_read(
        load_session_maid_with_maid(db, row.id)
    )


@router.patch(
    "/{session_maid_id}/toggle",
    response_model=SessionMaidAdminRead,
)
def toggle_session_maid(
    session_maid_id: int,
    db: Session = Depends(get_db),
):
    row = db.get(SessionMaid, session_maid_id)
    if not row:
        raise HTTPException(status_code=404, detail="Session maid not found.")

    row.is_available = not row.is_available
    db.commit()
    return to_admin_read(
        load_session_maid_with_maid(db, row.id)
    )


@router.delete("/{session_maid_id}")
def delete_session_maid(
    session_maid_id: int,
    db: Session = Depends(get_db),
):
    row = db.get(SessionMaid, session_maid_id)
    if not row:
        raise HTTPException(status_code=404, detail="Session maid not found.")

    db.delete(row)
    db.commit()
    return {"success": True, "deleted_id": session_maid_id}
