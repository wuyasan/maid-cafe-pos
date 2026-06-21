"""
Regression: the kitchen/bar production board renders a "completed/Done" column,
so GET /staff/production/{station} must surface completed tasks when asked via
?include_completed=true. Contract the frontend (api-client) now depends on:

  - default (include_completed omitted/false) → completed tasks EXCLUDED
  - ?include_completed=true                    → completed tasks INCLUDED
  - once a runner stamps picked_up_at          → task drops off even with the flag

This locks the backend behaviour behind the one-line web fix that started
requesting include_completed=true (otherwise the Done column is always empty).
"""

from __future__ import annotations

from datetime import date
from decimal import Decimal

from app.core.time import utcnow
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


def _seed_completed_kitchen_task(db) -> ProductionTask:
    """Active session → occupied table → open bill → order → completed kitchen task."""
    session = SessionModel(
        name="Queue Test Session",
        service_date=date.today(),
        status=SessionStatus.active,
    )
    db.add(session)
    db.flush()

    table = Table(code="QIC1", seats=4, is_active=True, is_shareable=False)
    db.add(table)
    db.flush()

    st = SessionTable(
        session_id=session.id,
        table_id=table.id,
        status=SessionTableStatus.occupied,
    )
    db.add(st)
    db.flush()

    cat = MenuCategory(name="Queue Cat", display_order=1)
    db.add(cat)
    db.flush()
    item = MenuItem(
        name="Ramen",
        price=Decimal("10.00"),
        category_id=cat.id,
        item_type=MenuItemType.regular,
        is_active=True,
        is_bundle=False,
    )
    db.add(item)
    db.flush()

    bill = Bill(
        session_table_id=st.id,
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
        menu_item_id=item.id,
        quantity=1,
        unit_price=Decimal("10.00"),
        total_price=Decimal("10.00"),
    )
    db.add(order_item)
    db.flush()

    task = ProductionTask(
        order_item_id=order_item.id,
        station=ProductionStation.kitchen,
        display_name="Ramen",
        quantity=1,
        status=ProductionStatus.completed,
        picked_up_at=None,
    )
    db.add(task)
    db.flush()
    db.commit()
    return task


class TestProductionQueueIncludeCompleted:
    def test_completed_excluded_by_default(self, client, db_session):
        task = _seed_completed_kitchen_task(db_session)
        resp = client.get("/api/v1/staff/production/kitchen")
        assert resp.status_code == 200, resp.text
        ids = [i["production_task_id"] for i in resp.json()["items"]]
        assert task.id not in ids, "completed task must be hidden by default"

    def test_completed_included_with_flag(self, client, db_session):
        task = _seed_completed_kitchen_task(db_session)
        resp = client.get(
            "/api/v1/staff/production/kitchen?include_completed=true"
        )
        assert resp.status_code == 200, resp.text
        ids = [i["production_task_id"] for i in resp.json()["items"]]
        assert task.id in ids, "completed task must show when include_completed=true"

    def test_picked_up_excluded_even_with_flag(self, client, db_session):
        task = _seed_completed_kitchen_task(db_session)
        task.picked_up_at = utcnow()
        db_session.add(task)
        db_session.commit()
        resp = client.get(
            "/api/v1/staff/production/kitchen?include_completed=true"
        )
        assert resp.status_code == 200, resp.text
        ids = [i["production_task_id"] for i in resp.json()["items"]]
        assert task.id not in ids, "picked-up task must drop off the queue"
