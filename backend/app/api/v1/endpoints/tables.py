from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.enums import SessionTableStatus
from app.models.session import Session as SessionModel
from app.models.table import SessionTable, Table
from app.schemas.table import (
    SessionTableAddParty,
    SessionTableAdminSummary,
    SessionTableCreate,
    SessionTableUpdate,
    TableCreate,
    TableRead,
    TableUpdate,
)
from app.services.session_service import get_current_active_session

router = APIRouter(prefix="/tables", tags=["tables"])


def build_session_table_summary(
    session_table: SessionTable,
    table: Table,
) -> SessionTableAdminSummary:
    return SessionTableAdminSummary(
        id=session_table.id,
        session_id=session_table.session_id,
        table_id=table.id,
        table_code=table.code,
        seats=table.seats,
        is_shareable=table.is_shareable,
        status=session_table.status,
        current_party_size=session_table.current_party_size,
        layout_x=table.layout_x,
        layout_y=table.layout_y,
        layout_width=table.layout_width,
        layout_height=table.layout_height,
        layout_shape=table.layout_shape,
    )


def validate_party_size(table: Table, party_size: int) -> None:
    if party_size < 0:
        raise HTTPException(status_code=400, detail="Party size cannot be negative.")

    if party_size > table.seats:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Table {table.code} has only {table.seats} seat(s). "
                f"Party size cannot be {party_size}."
            ),
        )


def sync_active_tables_to_session(db: Session, session_id: int) -> None:
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
        if table.id not in existing_table_ids:
            db.add(
                SessionTable(
                    session_id=session_id,
                    table_id=table.id,
                    status=SessionTableStatus.available,
                    current_party_size=0,
                )
            )


@router.get("/", response_model=list[TableRead])
def list_tables(db: Session = Depends(get_db)):
    return list(
        db.execute(select(Table).order_by(Table.code.asc(), Table.id.asc()))
        .scalars()
        .all()
    )


@router.post("/", response_model=TableRead)
def create_table(payload: TableCreate, db: Session = Depends(get_db)):
    normalized_code = payload.code.strip()
    if not normalized_code:
        raise HTTPException(status_code=400, detail="Table code is required.")

    existing = (
        db.execute(select(Table).where(Table.code == normalized_code))
        .scalars()
        .first()
    )
    if existing:
        raise HTTPException(status_code=400, detail="Table code already exists.")

    table = Table(
        code=normalized_code,
        seats=payload.seats,
        is_active=payload.is_active,
        is_shareable=payload.is_shareable,
        layout_x=payload.layout_x,
        layout_y=payload.layout_y,
        layout_width=payload.layout_width,
        layout_height=payload.layout_height,
        layout_shape=payload.layout_shape,
    )
    db.add(table)
    db.flush()

    current_session = get_current_active_session(db)
    if current_session and table.is_active:
        db.add(
            SessionTable(
                session_id=current_session.id,
                table_id=table.id,
                status=SessionTableStatus.available,
                current_party_size=0,
            )
        )

    db.commit()
    db.refresh(table)
    return table


@router.patch("/{table_id}", response_model=TableRead)
def update_table(
    table_id: int,
    payload: TableUpdate,
    db: Session = Depends(get_db),
):
    table = db.get(Table, table_id)
    if not table:
        raise HTTPException(status_code=404, detail="Table not found.")

    update_data = payload.model_dump(exclude_unset=True)

    if "code" in update_data:
        update_data["code"] = update_data["code"].strip()
        if not update_data["code"]:
            raise HTTPException(status_code=400, detail="Table code is required.")

        duplicate = (
            db.execute(
                select(Table).where(
                    Table.code == update_data["code"],
                    Table.id != table_id,
                )
            )
            .scalars()
            .first()
        )
        if duplicate:
            raise HTTPException(status_code=400, detail="Table code already exists.")

    current_session = get_current_active_session(db)

    if "seats" in update_data and current_session:
        current_session_table = (
            db.execute(
                select(SessionTable).where(
                    SessionTable.session_id == current_session.id,
                    SessionTable.table_id == table.id,
                )
            )
            .scalars()
            .first()
        )
        if (
            current_session_table
            and update_data["seats"] < current_session_table.current_party_size
        ):
            raise HTTPException(
                status_code=400,
                detail=(
                    f"Cannot reduce table {table.code} to {update_data['seats']} "
                    f"seat(s) while {current_session_table.current_party_size} "
                    "guest(s) are seated."
                ),
            )

    for key, value in update_data.items():
        setattr(table, key, value)

    db.flush()

    if current_session and table.is_active:
        existing_session_table = (
            db.execute(
                select(SessionTable).where(
                    SessionTable.session_id == current_session.id,
                    SessionTable.table_id == table.id,
                )
            )
            .scalars()
            .first()
        )
        if not existing_session_table:
            db.add(
                SessionTable(
                    session_id=current_session.id,
                    table_id=table.id,
                    status=SessionTableStatus.available,
                    current_party_size=0,
                )
            )

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
            .order_by(Table.code.asc(), Table.id.asc())
        ).all()
    )

    return [
        build_session_table_summary(session_table, table)
        for session_table, table in rows
    ]


@router.post(
    "/session-tables/sync-active",
    response_model=list[SessionTableAdminSummary],
)
def sync_active_session_tables(
    session_id: int = Query(...),
    db: Session = Depends(get_db),
):
    session_obj = db.get(SessionModel, session_id)
    if not session_obj:
        raise HTTPException(status_code=404, detail="Session not found.")

    sync_active_tables_to_session(db, session_id)
    db.commit()

    rows = list(
        db.execute(
            select(SessionTable, Table)
            .join(Table, SessionTable.table_id == Table.id)
            .where(SessionTable.session_id == session_id)
            .order_by(Table.code.asc(), Table.id.asc())
        ).all()
    )
    return [
        build_session_table_summary(session_table, table)
        for session_table, table in rows
    ]


@router.post("/session-tables", response_model=SessionTableAdminSummary)
def create_session_table(
    payload: SessionTableCreate,
    db: Session = Depends(get_db),
):
    session_obj = db.get(SessionModel, payload.session_id)
    if not session_obj:
        raise HTTPException(status_code=404, detail="Session not found.")

    table = db.get(Table, payload.table_id)
    if not table:
        raise HTTPException(status_code=404, detail="Table not found.")

    validate_party_size(table, payload.current_party_size)

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
        raise HTTPException(
            status_code=400,
            detail="This table is already linked to the session.",
        )

    status = (
        SessionTableStatus.available
        if payload.current_party_size == 0
        else SessionTableStatus.occupied
    )
    if payload.status == SessionTableStatus.paying:
        status = SessionTableStatus.paying

    session_table = SessionTable(
        session_id=payload.session_id,
        table_id=payload.table_id,
        status=status,
        current_party_size=payload.current_party_size,
    )
    db.add(session_table)
    db.commit()
    db.refresh(session_table)
    return build_session_table_summary(session_table, table)


@router.post(
    "/session-tables/{session_table_id}/add-party",
    response_model=SessionTableAdminSummary,
)
def add_party_to_session_table(
    session_table_id: int,
    payload: SessionTableAddParty,
    db: Session = Depends(get_db),
):
    session_table = db.get(SessionTable, session_table_id)
    if not session_table:
        raise HTTPException(status_code=404, detail="Session table not found.")

    table = db.get(Table, session_table.table_id)
    if not table:
        raise HTTPException(status_code=404, detail="Table not found.")

    if session_table.current_party_size > 0 and not table.is_shareable:
        raise HTTPException(
            status_code=400,
            detail=f"Table {table.code} does not allow shared seating.",
        )

    new_size = session_table.current_party_size + payload.party_size
    validate_party_size(table, new_size)

    session_table.current_party_size = new_size
    session_table.status = SessionTableStatus.occupied

    db.commit()
    db.refresh(session_table)
    return build_session_table_summary(session_table, table)


@router.patch(
    "/session-tables/{session_table_id}",
    response_model=SessionTableAdminSummary,
)
def update_session_table(
    session_table_id: int,
    payload: SessionTableUpdate,
    db: Session = Depends(get_db),
):
    session_table = db.get(SessionTable, session_table_id)
    if not session_table:
        raise HTTPException(status_code=404, detail="Session table not found.")

    table = db.get(Table, session_table.table_id)
    if not table:
        raise HTTPException(status_code=404, detail="Table not found.")

    if payload.current_party_size is not None:
        validate_party_size(table, payload.current_party_size)
        session_table.current_party_size = payload.current_party_size

        if payload.current_party_size == 0:
            session_table.status = SessionTableStatus.available
        elif session_table.status != SessionTableStatus.paying:
            session_table.status = SessionTableStatus.occupied

    if payload.status is not None:
        session_table.status = payload.status

    db.commit()
    db.refresh(session_table)
    return build_session_table_summary(session_table, table)


@router.delete("/session-tables/{session_table_id}")
def delete_session_table(
    session_table_id: int,
    db: Session = Depends(get_db),
):
    session_table = db.get(SessionTable, session_table_id)
    if not session_table:
        raise HTTPException(status_code=404, detail="Session table not found.")

    db.delete(session_table)
    db.commit()
    return {"success": True, "deleted_id": session_table_id}
