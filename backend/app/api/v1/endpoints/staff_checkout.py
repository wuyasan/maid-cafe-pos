from datetime import datetime
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.bill import Bill
from app.models.enums import BillStatus, SessionTableStatus
from app.models.maid import Maid
from app.models.menu import MenuItem
from app.models.order import Order, OrderItem, OrderItemMaid
from app.models.session import Session as SessionModel
from app.models.table import SessionTable, Table
from app.schemas.staff import (
    SessionSummaryItem,
    SessionSummaryMaidCount,
    SessionSummaryResponse,
)
from app.schemas.table import SessionTableListResponse, SessionTableSummary
from app.services.session_service import get_current_active_session

router = APIRouter(prefix="/staff", tags=["staff"])


def get_current_session_table_by_code(
    db: Session,
    table_code: str,
) -> tuple[SessionModel, SessionTable, Table]:
    current_session = get_current_active_session(db)
    if not current_session:
        raise HTTPException(status_code=404, detail="No active session found.")

    row = (
        db.execute(
            select(SessionTable, Table)
            .join(Table, SessionTable.table_id == Table.id)
            .where(
                SessionTable.session_id == current_session.id,
                Table.code == table_code,
            )
        )
        .first()
    )

    if not row:
        raise HTTPException(
            status_code=404,
            detail="Table not found in current session.",
        )

    session_table, table = row
    return current_session, session_table, table


def get_open_or_paying_bill_for_session_table(
    db: Session,
    session_table_id: int,
) -> Bill | None:
    return (
        db.execute(
            select(Bill)
            .where(
                Bill.session_table_id == session_table_id,
                Bill.status.in_([BillStatus.open, BillStatus.paying]),
            )
            .order_by(Bill.id.desc())
        )
        .scalars()
        .first()
    )


@router.get("/tables", response_model=SessionTableListResponse)
def get_staff_tables_overview(db: Session = Depends(get_db)):
    current_session = get_current_active_session(db)
    if not current_session:
        raise HTTPException(status_code=404, detail="No active session found.")

    rows = list(
        db.execute(
            select(SessionTable, Table)
            .join(Table, SessionTable.table_id == Table.id)
            .where(SessionTable.session_id == current_session.id)
            .order_by(Table.code.asc(), Table.id.asc())
        ).all()
    )

    tables: list[SessionTableSummary] = []
    for session_table, table in rows:
        open_bill = get_open_or_paying_bill_for_session_table(
            db,
            session_table.id,
        )

        tables.append(
            SessionTableSummary(
                id=session_table.id,
                session_id=session_table.session_id,
                table_id=table.id,
                table_code=table.code,
                seats=table.seats,
                is_shareable=table.is_shareable,
                status=session_table.status,
                current_party_size=session_table.current_party_size,
                open_bill_id=open_bill.id if open_bill else None,
                open_bill_total=(
                    open_bill.total if open_bill else Decimal("0.00")
                ),
            )
        )

    return SessionTableListResponse(
        session_id=current_session.id,
        session_name=current_session.name,
        tables=tables,
    )


@router.get(
    "/session-summary/{session_id}",
    response_model=SessionSummaryResponse,
)
def get_session_summary(
    session_id: int,
    db: Session = Depends(get_db),
):
    session_obj = db.get(SessionModel, session_id)
    if not session_obj:
        raise HTTPException(status_code=404, detail="Session not found.")

    item_rows = db.execute(
        select(
            MenuItem.id.label("menu_item_id"),
            MenuItem.name.label("menu_item_name"),
            MenuItem.item_type.label("item_type"),
            func.coalesce(func.sum(OrderItem.quantity), 0).label(
                "total_ordered"
            ),
            func.coalesce(func.sum(OrderItem.total_price), 0).label(
                "total_sales"
            ),
        )
        .join(OrderItem, OrderItem.menu_item_id == MenuItem.id)
        .join(Order, Order.id == OrderItem.order_id)
        .join(Bill, Bill.id == Order.bill_id)
        .join(SessionTable, SessionTable.id == Bill.session_table_id)
        .where(SessionTable.session_id == session_id)
        .group_by(MenuItem.id, MenuItem.name, MenuItem.item_type)
        .order_by(MenuItem.name.asc())
    ).all()

    maid_rows = db.execute(
        select(
            MenuItem.id.label("menu_item_id"),
            Maid.id.label("maid_id"),
            Maid.name.label("maid_name"),
            func.count(OrderItemMaid.id).label("total_ordered"),
        )
        .join(OrderItem, OrderItem.id == OrderItemMaid.order_item_id)
        .join(MenuItem, MenuItem.id == OrderItem.menu_item_id)
        .join(Order, Order.id == OrderItem.order_id)
        .join(Bill, Bill.id == Order.bill_id)
        .join(SessionTable, SessionTable.id == Bill.session_table_id)
        .join(Maid, Maid.id == OrderItemMaid.maid_id)
        .where(
            SessionTable.session_id == session_id,
            MenuItem.item_type == "maid_service",
        )
        .group_by(MenuItem.id, Maid.id, Maid.name)
        .order_by(MenuItem.id.asc(), Maid.name.asc())
    ).all()

    maid_map: dict[int, list[SessionSummaryMaidCount]] = {}
    for row in maid_rows:
        maid_map.setdefault(row.menu_item_id, []).append(
            SessionSummaryMaidCount(
                maid_id=row.maid_id,
                maid_name=row.maid_name,
                total_ordered=row.total_ordered,
            )
        )

    items = [
        SessionSummaryItem(
            menu_item_id=row.menu_item_id,
            menu_item_name=row.menu_item_name,
            item_type=row.item_type,
            total_ordered=row.total_ordered,
            total_sales=row.total_sales,
            maid_breakdown=maid_map.get(row.menu_item_id, []),
        )
        for row in item_rows
    ]

    return SessionSummaryResponse(
        session_id=session_obj.id,
        session_name=session_obj.name,
        items=items,
    )


@router.post("/table/{table_code}/start-checkout")
def start_checkout(
    table_code: str,
    db: Session = Depends(get_db),
):
    _current_session, session_table, _table = (
        get_current_session_table_by_code(db, table_code)
    )

    bill = get_open_or_paying_bill_for_session_table(db, session_table.id)
    if not bill:
        raise HTTPException(
            status_code=404,
            detail="No open bill found for this table.",
        )

    if bill.status == BillStatus.paid:
        raise HTTPException(
            status_code=400,
            detail="This bill is already paid.",
        )

    bill.status = BillStatus.paying
    session_table.status = SessionTableStatus.paying

    db.commit()
    db.refresh(bill)
    db.refresh(session_table)

    return {
        "success": True,
        "table_code": table_code,
        "bill_id": bill.id,
        "bill_status": bill.status,
        "session_table_status": session_table.status,
    }


@router.post("/table/{table_code}/mark-paid")
def mark_paid(
    table_code: str,
    db: Session = Depends(get_db),
):
    _current_session, session_table, _table = (
        get_current_session_table_by_code(db, table_code)
    )

    bill = get_open_or_paying_bill_for_session_table(db, session_table.id)
    if not bill:
        raise HTTPException(
            status_code=404,
            detail="No open or paying bill found for this table.",
        )

    bill.status = BillStatus.paid
    bill.closed_at = datetime.utcnow()

    # Payment completed: make the table immediately reusable.
    session_table.status = SessionTableStatus.available
    session_table.current_party_size = 0

    db.commit()
    db.refresh(bill)
    db.refresh(session_table)

    return {
        "success": True,
        "table_code": table_code,
        "bill_id": bill.id,
        "bill_status": bill.status,
        "session_table_status": session_table.status,
        "current_party_size": session_table.current_party_size,
        "closed_at": bill.closed_at,
    }
