"""
Tests for GET bill read-only behaviour (Task B).

Confirms:
1. GET /api/v1/customer-orders/customer/table/{code}/bill returns None (null)
   when no open bill exists, and does NOT create a Bill row.
2. After a bill is created by some other means (e.g. direct DB insert), GET
   returns that bill's details.
"""

import pytest
from decimal import Decimal
from sqlalchemy import select

from app.models.bill import Bill
from app.models.enums import BillStatus, SessionStatus, SessionTableStatus, MenuItemType
from app.models.session import Session as SessionModel
from app.models.table import Table, SessionTable
from app.models.menu import MenuCategory, MenuItem


# ---------------------------------------------------------------------------
# Helpers to seed minimal data
# ---------------------------------------------------------------------------

def _seed_active_session_and_table(db) -> tuple[SessionModel, Table, SessionTable]:
    """Insert the bare minimum to satisfy get_current_active_session and
    get_session_table_by_table_code."""
    from datetime import date
    session = SessionModel(
        name="Test Session",
        service_date=date.today(),
        status=SessionStatus.active,
    )
    db.add(session)
    db.flush()

    table = Table(code="T1", seats=4, is_active=True, is_shareable=False)
    db.add(table)
    db.flush()

    st = SessionTable(
        session_id=session.id,
        table_id=table.id,
        status=SessionTableStatus.available,
    )
    db.add(st)
    db.flush()
    db.commit()
    return session, table, st


def _seed_open_bill(db, session_table_id: int) -> Bill:
    bill = Bill(
        session_table_id=session_table_id,
        status=BillStatus.open,
        subtotal=Decimal("0.00"),
        tax=Decimal("0.00"),
        service_charge=Decimal("0.00"),
        total=Decimal("0.00"),
    )
    db.add(bill)
    db.commit()
    return bill


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

class TestGetBillReadOnly:
    def test_no_bill_returns_null_and_does_not_create(self, client, db_session):
        """When no open bill exists, GET returns null and bill count stays 0."""
        _seed_active_session_and_table(db_session)

        before_count = db_session.execute(select(Bill)).scalars().all()
        assert len(before_count) == 0, "precondition: no bills"

        resp = client.get("/api/v1/customer-orders/customer/table/T1/bill")
        # Endpoint returns Optional[BillDetailRead] → null body is valid
        assert resp.status_code == 200
        assert resp.json() is None

        after_count = db_session.execute(select(Bill)).scalars().all()
        assert len(after_count) == 0, "GET must NOT create a Bill row"

    def test_existing_bill_is_returned(self, client, db_session):
        """When an open bill already exists, GET returns it."""
        _, _, st = _seed_active_session_and_table(db_session)
        bill = _seed_open_bill(db_session, st.id)

        resp = client.get("/api/v1/customer-orders/customer/table/T1/bill")
        assert resp.status_code == 200
        body = resp.json()
        assert body is not None
        assert body["id"] == bill.id
        assert body["status"] == "open"
        assert body["items"] == []

    def test_repeated_gets_do_not_multiply_bills(self, client, db_session):
        """Calling GET bill twice must not create any additional bills."""
        _seed_active_session_and_table(db_session)

        client.get("/api/v1/customer-orders/customer/table/T1/bill")
        client.get("/api/v1/customer-orders/customer/table/T1/bill")

        count = len(db_session.execute(select(Bill)).scalars().all())
        assert count == 0
