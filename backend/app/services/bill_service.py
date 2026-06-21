from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.models.bill import Bill
from app.models.enums import BillStatus, SessionTableStatus
from app.models.table import SessionTable, Table


def get_session_table_by_table_code(
    db: Session,
    session_id: int,
    table_code: str,
) -> SessionTable | None:
    stmt = (
        select(SessionTable)
        .join(Table, SessionTable.table_id == Table.id)
        .where(SessionTable.session_id == session_id, Table.code == table_code)
        .options(joinedload(SessionTable.table))
    )
    return db.execute(stmt).scalars().first()


def get_open_bill_for_session_table(db: Session, session_table_id: int) -> Bill | None:
    stmt = (
        select(Bill)
        .where(
            Bill.session_table_id == session_table_id,
            Bill.status.in_([BillStatus.open, BillStatus.paying]),
        )
        .order_by(Bill.id.desc())
    )
    return db.execute(stmt).scalars().first()


def get_or_create_open_bill(db: Session, session_table_id: int) -> Bill:
    bill = get_open_bill_for_session_table(db, session_table_id)
    if bill:
        # Table is already occupied (or in a later state); no status change needed.
        return bill

    bill = Bill(
        session_table_id=session_table_id,
        status=BillStatus.open,
        subtotal=Decimal("0.00"),
        tax=Decimal("0.00"),
        service_charge=Decimal("0.00"),
        total=Decimal("0.00"),
    )
    db.add(bill)

    # Mark the table occupied as soon as a bill is opened for the first time.
    session_table = db.get(SessionTable, session_table_id)
    if session_table and session_table.status == SessionTableStatus.available:
        session_table.status = SessionTableStatus.occupied

    db.flush()
    return bill


def recalculate_bill_totals(bill: Bill) -> Bill:
    subtotal = Decimal("0.00")

    for order in bill.orders:
        for item in order.items:
            subtotal += Decimal(item.total_price)

    bill.subtotal = subtotal
    bill.tax = Decimal("0.00")
    bill.service_charge = Decimal("0.00")
    bill.total = subtotal + bill.tax + bill.service_charge
    return bill