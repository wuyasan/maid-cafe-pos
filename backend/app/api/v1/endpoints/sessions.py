from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.enums import SessionStatus, SessionTableStatus
from app.models.session import Session as SessionModel
from app.models.table import SessionTable, Table
from app.schemas.session import (
    CurrentSessionRead,
    SessionCreate,
    SessionRead,
    SessionUpdate,
)
from app.services.session_service import get_current_active_session

router = APIRouter(prefix="/sessions", tags=["sessions"])


def link_active_tables_to_session(db: Session, session_id: int) -> None:
    active_tables = list(
        db.execute(
            select(Table)
            .where(Table.is_active.is_(True))
            .order_by(Table.code.asc(), Table.id.asc())
        )
        .scalars()
        .all()
    )

    existing_table_ids = set(
        db.execute(
            select(SessionTable.table_id).where(
                SessionTable.session_id == session_id
            )
        )
        .scalars()
        .all()
    )

    for table in active_tables:
        if table.id in existing_table_ids:
            continue

        db.add(
            SessionTable(
                session_id=session_id,
                table_id=table.id,
                status=SessionTableStatus.available,
                current_party_size=0,
            )
        )


@router.get("/current", response_model=CurrentSessionRead)
def read_current_session(db: Session = Depends(get_db)):
    session = get_current_active_session(db)
    return {"session": session}


@router.get("/", response_model=list[SessionRead])
def list_sessions(db: Session = Depends(get_db)):
    stmt = select(SessionModel).order_by(
        SessionModel.service_date.desc(),
        SessionModel.id.desc(),
    )
    return list(db.execute(stmt).scalars().all())


@router.post("/", response_model=SessionRead)
def create_session(payload: SessionCreate, db: Session = Depends(get_db)):
    session = SessionModel(
        name=payload.name,
        service_date=payload.service_date,
        start_time=payload.start_time,
        end_time=payload.end_time,
        status=payload.status,
    )
    db.add(session)
    db.commit()
    db.refresh(session)
    return session


@router.patch("/{session_id}", response_model=SessionRead)
def update_session(
    session_id: int,
    payload: SessionUpdate,
    db: Session = Depends(get_db),
):
    session = db.get(SessionModel, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found.")

    update_data = payload.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(session, key, value)

    db.commit()
    db.refresh(session)
    return session


@router.post("/{session_id}/set-current", response_model=SessionRead)
def set_current_session(session_id: int, db: Session = Depends(get_db)):
    target = db.get(SessionModel, session_id)
    if not target:
        raise HTTPException(status_code=404, detail="Session not found.")

    db.execute(
        update(SessionModel)
        .where(
            SessionModel.status == SessionStatus.active,
            SessionModel.id != session_id,
        )
        .values(status=SessionStatus.winding_down)
    )

    target.status = SessionStatus.active
    link_active_tables_to_session(db, target.id)

    db.commit()
    db.refresh(target)
    return target


@router.delete("/{session_id}")
def delete_session(session_id: int, db: Session = Depends(get_db)):
    session = db.get(SessionModel, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found.")

    db.delete(session)
    db.commit()
    return {"success": True, "deleted_id": session_id}


@router.post("/{session_id}/set-scheduled", response_model=SessionRead)
def set_session_scheduled(
    session_id: int,
    db: Session = Depends(get_db),
):
    session = db.get(SessionModel, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found.")

    session.status = SessionStatus.scheduled
    db.commit()
    db.refresh(session)
    return session


@router.post("/{session_id}/set-closed", response_model=SessionRead)
def set_session_closed(
    session_id: int,
    db: Session = Depends(get_db),
):
    session = db.get(SessionModel, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found.")

    session.status = SessionStatus.closed
    db.commit()
    db.refresh(session)
    return session
