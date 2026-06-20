"""
P1 regression tests: pickup queue must exclude paid/cancelled bills.

The /staff/production/pickup/orders endpoint was previously filtering only on
picked_up_at IS NULL, which meant that completed tasks on paid or cancelled
bills would still surface in the runner queue.  This suite verifies the fix.

Behaviour matrix:
  - paid bill with completed task    → NOT in pickup queue
  - cancelled bill with completed task → NOT in pickup queue
  - open bill with completed task    → IS in pickup queue
"""

from __future__ import annotations

from datetime import date
from decimal import Decimal

import pytest
from sqlalchemy import select

from app.models.bill import Bill
from app.models.enums import (
    BillStatus,
    MenuItemType,
    OrderSource,
    ProductionStation,
    ProductionStatus,
    SessionStatus,
    SessionTableStatus,
)
from app.models.menu import MenuCategory, MenuItem
from app.models.order import Order, OrderItem, ProductionTask
from app.models.session import Session as SessionModel
from app.models.table import SessionTable, Table


# ---------------------------------------------------------------------------
# Seed helpers
# ---------------------------------------------------------------------------

def _seed_session_table(db, table_code: str = "PU1") -> tuple[SessionModel, Table, SessionTable]:
    session = SessionModel(
        name="Pickup Test Session",
        service_date=date.today(),
        status=SessionStatus.active,
    )
    db.add(session)
    db.flush()

    table = Table(code=table_code, seats=4, is_active=True, is_shareable=False)
    db.add(table)
    db.flush()

    st = SessionTable(
        session_id=session.id,
        table_id=table.id,
        status=SessionTableStatus.occupied,
    )
    db.add(st)
    db.flush()
    db.commit()
    return session, table, st


def _seed_menu_item(db) -> MenuItem:
    cat = MenuCategory(name="Test Cat", display_order=1)
    db.add(cat)
    db.flush()
    item = MenuItem(
        name="Test Drink",
        price=Decimal("10.00"),
        category_id=cat.id,
        item_type=MenuItemType.regular,
        is_active=True,
        is_bundle=False,
    )
    db.add(item)
    db.flush()
    return item


def _seed_bill_with_completed_task(
    db,
    session_table_id: int,
    menu_item: MenuItem,
    bill_status: BillStatus,
) -> tuple[Bill, Order, ProductionTask]:
    """Seed a bill + order + completed production task, then set bill status."""
    bill = Bill(
        session_table_id=session_table_id,
        status=BillStatus.open,
        subtotal=Decimal("10.00"),
        tax=Decimal("0.00"),
        service_charge=Decimal("0.00"),
        total=Decimal("10.00"),
    )
    db.add(bill)
    db.flush()

    order = Order(bill_id=bill.id, source=OrderSource.qr)
    db.add(order)
    db.flush()

    order_item = OrderItem(
        order_id=order.id,
        menu_item_id=menu_item.id,
        quantity=1,
        unit_price=Decimal("10.00"),
        total_price=Decimal("10.00"),
    )
    db.add(order_item)
    db.flush()

    task = ProductionTask(
        order_item_id=order_item.id,
        station=ProductionStation.bar,
        display_name="Test Drink",
        quantity=1,
        status=ProductionStatus.completed,
        picked_up_at=None,  # not yet picked up
    )
    db.add(task)
    db.flush()

    # Now set the final bill status
    bill.status = bill_status
    if bill_status == BillStatus.paid:
        bill.checkout_total = Decimal("10.00")
    db.commit()

    return bill, order, task


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

class TestPickupQueueExcludesClosedBills:

    def test_paid_bill_task_not_in_pickup_queue(self, client, db_session):
        """A completed task on a paid bill must NOT appear in the pickup queue."""
        _, _, st = _seed_session_table(db_session, "PU_PAID")
        menu_item = _seed_menu_item(db_session)

        bill, order, _ = _seed_bill_with_completed_task(
            db_session, st.id, menu_item, BillStatus.paid
        )

        resp = client.get("/api/v1/staff/production/pickup/orders")
        assert resp.status_code == 200, resp.text

        order_ids = [o["order_id"] for o in resp.json()["orders"]]
        assert order.id not in order_ids, (
            f"Order {order.id} on a PAID bill must not appear in the pickup queue"
        )

    def test_cancelled_bill_task_not_in_pickup_queue(self, client, db_session):
        """A completed task on a cancelled bill must NOT appear in the pickup queue."""
        _, _, st = _seed_session_table(db_session, "PU_CANCEL")
        menu_item = _seed_menu_item(db_session)

        bill, order, _ = _seed_bill_with_completed_task(
            db_session, st.id, menu_item, BillStatus.cancelled
        )

        resp = client.get("/api/v1/staff/production/pickup/orders")
        assert resp.status_code == 200, resp.text

        order_ids = [o["order_id"] for o in resp.json()["orders"]]
        assert order.id not in order_ids, (
            f"Order {order.id} on a CANCELLED bill must not appear in the pickup queue"
        )

    def test_open_bill_task_appears_in_pickup_queue(self, client, db_session):
        """A completed task on an open bill MUST appear in the pickup queue."""
        _, _, st = _seed_session_table(db_session, "PU_OPEN")
        menu_item = _seed_menu_item(db_session)

        bill, order, _ = _seed_bill_with_completed_task(
            db_session, st.id, menu_item, BillStatus.open
        )

        resp = client.get("/api/v1/staff/production/pickup/orders")
        assert resp.status_code == 200, resp.text

        order_ids = [o["order_id"] for o in resp.json()["orders"]]
        assert order.id in order_ids, (
            f"Order {order.id} on an OPEN bill must appear in the pickup queue"
        )
