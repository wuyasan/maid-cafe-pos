from sqlalchemy.orm import Session
from sqlalchemy import select
from fastapi import APIRouter, Depends, HTTPException, Query

from app.core.database import get_db
from app.models.table import SessionTable, Table
from app.models.session import Session as SessionModel
from app.schemas.table import (
    SessionTableAdminSummary,
    SessionTableCreate,
    SessionTableUpdate,
    TableCreate,
    TableRead,
    TableUpdate,
)

router = APIRouter(prefix="/tables", tags=["tables"])


@router.get("/", response_model=list[TableRead])
def list_tables(db: Session = Depends(get_db)):
    stmt = select(Table).order_by(Table.code.asc(), Table.id.asc())
    return list(db.execute(stmt).scalars().all())


@router.post("/", response_model=TableRead)
def create_table(payload: TableCreate, db: Session = Depends(get_db)):
    existing = db.execute(
        select(Table).where(Table.code == payload.code)
    ).scalars().first()

    if existing:
        raise HTTPException(status_code=400, detail="Table code already exists.")

    table = Table(
        code=payload.code,
        seats=payload.seats,
        is_active=payload.is_active,
    )
    db.add(table)
    db.commit()
    db.refresh(table)
    return table


@router.patch("/{table_id}", response_model=TableRead)
def update_table(table_id: int, payload: TableUpdate, db: Session = Depends(get_db)):
    table = db.get(Table, table_id)
    if not table:
        raise HTTPException(status_code=404, detail="Table not found.")

    update_data = payload.model_dump(exclude_unset=True)

    if "code" in update_data:
        existing = db.execute(
            select(Table).where(Table.code == update_data["code"], Table.id != table_id)
        ).scalars().first()
        if existing:
            raise HTTPException(status_code=400, detail="Table code already exists.")

    for key, value in update_data.items():
        setattr(table, key, value)

    db.commit()
    db.refresh(table)
    return table


@router.delete("/{table_id}")
def delete_table(table_id: int, db: Session = Depends(get_db)):
    table = db.get(Table, table_id)
    if not table:
        raise HTTPException(status_code=404, detail="Table not found.")

    db.delete(table)
    db.commit()
    return {"success": True, "deleted_id": table_id}

@router.get("/session-tables", response_model=list[SessionTableAdminSummary])
def list_session_tables(
    session_id: int = Query(...),
    db: Session = Depends(get_db),
):
    session_obj = db.get(SessionModel, session_id)
    if not session_obj:
        raise HTTPException(status_code=404, detail="Session not found.")

    rows = list(
        db.execute(
            select(SessionTable, Table)
            .join(Table, SessionTable.table_id == Table.id)
            .where(SessionTable.session_id == session_id)
            .order_by(Table.code.asc())
        ).all()
    )

    return [
        SessionTableAdminSummary(
            id=session_table.id,
            session_id=session_table.session_id,
            table_id=table.id,
            table_code=table.code,
            seats=table.seats,
            status=session_table.status,
            current_party_size=session_table.current_party_size,
        )
        for session_table, table in rows
    ]

@router.post("/session-tables", response_model=SessionTableAdminSummary)
def create_session_table(payload: SessionTableCreate, db: Session = Depends(get_db)):
    session_obj = db.get(SessionModel, payload.session_id)
    if not session_obj:
        raise HTTPException(status_code=404, detail="Session not found.")

    table = db.get(Table, payload.table_id)
    if not table:
        raise HTTPException(status_code=404, detail="Table not found.")

    existing = (
        db.execute(
            select(SessionTable).where(
                SessionTable.session_id == payload.session_id,
                SessionTable.table_id == payload.table_id,
            )
        )
        .scalars()
        .first()
    )
    if existing:
        raise HTTPException(status_code=400, detail="This table is already linked to the session.")

    session_table = SessionTable(
    session_id=payload.session_id,
    table_id=payload.table_id,
    status=payload.status,
    current_party_size=payload.current_party_size,
    )
    db.add(session_table)
    db.commit()
    db.refresh(session_table)

    return SessionTableAdminSummary(
        id=session_table.id,
        session_id=session_table.session_id,
        table_id=table.id,
        table_code=table.code,
        seats=table.seats,
        status=session_table.status,
        current_party_size=session_table.current_party_size,
    )


@router.patch("/session-tables/{session_table_id}", response_model=SessionTableAdminSummary)
def update_session_table(
    session_table_id: int,
    payload: SessionTableUpdate,
    db: Session = Depends(get_db),
):
    session_table = db.get(SessionTable, session_table_id)
    if not session_table:
        raise HTTPException(status_code=404, detail="Session table not found.")

    if payload.status is not None:
        session_table.status = payload.status

    if payload.current_party_size is not None:
        if payload.current_party_size < 0:
            raise HTTPException(status_code=400, detail="current_party_size cannot be negative.")
        session_table.current_party_size = payload.current_party_size

    db.commit()
    db.refresh(session_table)

    table = db.get(Table, session_table.table_id)

    return SessionTableAdminSummary(
        id=session_table.id,
        session_id=session_table.session_id,
        table_id=table.id,
        table_code=table.code,
        seats=table.seats,
        status=session_table.status,
        current_party_size=session_table.current_party_size,
    )

@router.delete("/session-tables/{session_table_id}")
def delete_session_table(session_table_id: int, db: Session = Depends(get_db)):
    session_table = db.get(SessionTable, session_table_id)
    if not session_table:
        raise HTTPException(status_code=404, detail="Session table not found.")

    db.delete(session_table)
    db.commit()
    return {"success": True, "deleted_id": session_table_id}