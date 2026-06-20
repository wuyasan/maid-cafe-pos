"""
End-to-end full-lifecycle regression test for Maid Cafe POS backend.

Covers the complete happy path from session seeding through payment and
table release, verifying every major subsystem in sequence:

  Step 1 – Seed: active session, table, session_table (available),
            kitchen category + item, bar category + item.
  Step 2 – GET bill returns None (no side-effects on empty table).
  Step 3 – POST staff order → bill created, table occupied,
            order_items persisted, ProductionTasks generated per station.
  Step 4 – Production: pending → preparing → completed for each task.
  Step 5 – Pickup: completed order appears in pickup queue;
            POST pickup marks all tasks picked_up_at.
  Step 6 – start-checkout → bill status=paying, checkout_total snapshotted;
            subsequent POST order → 409 Conflict.
  Step 7 – mark-paid {amount, provider_payment_id, idempotency_key} →
            Payment row created, bill=paid, table=available.
            Duplicate call with same idempotency_key → no second Payment.
  Step 8 – POST-payment: GET bill → None (no open bill).

All steps run on SQLite in-memory via the shared conftest fixtures.
No Postgres, no migrations, no commits to git.
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
    ProductionStation,
    ProductionStatus,
    SessionStatus,
    SessionTableStatus,
)
from app.models.menu import MenuCategory, MenuItem
from app.models.order import Order, OrderItem, ProductionTask
from app.models.payment import Payment
from app.models.session import Session as SessionModel
from app.models.table import SessionTable, Table


# ---------------------------------------------------------------------------
# Seed helper
# ---------------------------------------------------------------------------

def _seed_world(db):
    """
    Create minimum viable data for the full e2e flow:
    - 1 active session
    - 1 table "E2E-A1" with a session_table row (status=available)
    - 1 kitchen category + 1 kitchen menu item ("Kitchen Item", $12.00)
    - 1 bar category    + 1 bar menu item    ("Bar Drink",    $8.00)

    Returns (session, table, session_table, kitchen_item, bar_item).
    """
    session = SessionModel(
        name="E2E Test Session",
        service_date=date.today(),
        status=SessionStatus.active,
    )
    db.add(session)
    db.flush()

    table = Table(code="E2E-A1", seats=4, is_active=True, is_shareable=False)
    db.add(table)
    db.flush()

    st = SessionTable(
        session_id=session.id,
        table_id=table.id,
        status=SessionTableStatus.available,
    )
    db.add(st)
    db.flush()

    kitchen_cat = MenuCategory(
        name="Kitchen",
        display_order=1,
        production_station=ProductionStation.kitchen,
    )
    bar_cat = MenuCategory(
        name="Bar",
        display_order=2,
        production_station=ProductionStation.bar,
    )
    db.add_all([kitchen_cat, bar_cat])
    db.flush()

    kitchen_item = MenuItem(
        name="Kitchen Item",
        price=Decimal("12.00"),
        category_id=kitchen_cat.id,
        item_type=MenuItemType.regular,
        is_active=True,
        is_bundle=False,
    )
    bar_item = MenuItem(
        name="Bar Drink",
        price=Decimal("8.00"),
        category_id=bar_cat.id,
        item_type=MenuItemType.regular,
        is_active=True,
        is_bundle=False,
    )
    db.add_all([kitchen_item, bar_item])
    db.flush()
    db.commit()

    return session, table, st, kitchen_item, bar_item


# ---------------------------------------------------------------------------
# E2E flow test class
# ---------------------------------------------------------------------------

class TestFullLifecycleE2E:
    """
    One coherent end-to-end test split across numbered methods.
    Each method builds on the shared `world` fixture that is seeded once
    per class instance (function scope because `client` / `db_session` are
    function-scoped).  We use a single test that calls every step in order
    so that state naturally flows from one step to the next without
    cross-fixture coupling.
    """

    # ------------------------------------------------------------------
    # The single end-to-end test
    # ------------------------------------------------------------------

    def test_full_lifecycle(self, client, db_session):
        """
        Walk every step of the full Maid Cafe order lifecycle:
        seed → GET bill (None) → POST order → production → pickup →
        start-checkout → 409 on new order → mark-paid (idempotent) →
        GET bill (None again).
        """

        # ----------------------------------------------------------------
        # STEP 1 – Seed world
        # ----------------------------------------------------------------
        _session, table, st, kitchen_item, bar_item = _seed_world(db_session)

        # Verify baseline state
        assert st.status == SessionTableStatus.available

        # ----------------------------------------------------------------
        # STEP 2 – GET bill before any order → None / 204
        # ----------------------------------------------------------------
        resp = client.get(f"/api/v1/customer-orders/customer/table/{table.code}/bill")
        # Endpoint returns 200 with null body when no bill exists
        assert resp.status_code == 200, resp.text
        assert resp.json() is None, (
            "GET bill before ordering must return null (no side-effects)"
        )

        # ----------------------------------------------------------------
        # STEP 3 – POST order (staff source) → bill + items + tasks
        # ----------------------------------------------------------------
        order_resp = client.post(
            f"/api/v1/customer-orders/customer/table/{table.code}/orders",
            json={
                "source": "staff",
                "items": [
                    {"menu_item_id": kitchen_item.id, "quantity": 2},
                    {"menu_item_id": bar_item.id,     "quantity": 1},
                ],
            },
        )
        assert order_resp.status_code == 200, order_resp.text
        order_body = order_resp.json()

        # Bill created
        bill_id = order_body["bill_id"]
        assert bill_id is not None
        assert order_body["bill_total"] == "32.00"  # 12*2 + 8*1

        # Two order items returned
        assert len(order_body["items"]) == 2

        # Table is now occupied
        db_session.expire(st)
        assert st.status == SessionTableStatus.occupied

        # Bill is open in DB
        bills = db_session.execute(select(Bill)).scalars().all()
        assert len(bills) == 1
        bill = bills[0]
        assert bill.status == BillStatus.open
        assert bill.total == Decimal("32.00")

        # Order items persisted
        order_items = db_session.execute(select(OrderItem)).scalars().all()
        assert len(order_items) == 2
        quantities = sorted(oi.quantity for oi in order_items)
        assert quantities == [1, 2]

        # ProductionTasks generated: 1 kitchen task + 1 bar task
        tasks = db_session.execute(select(ProductionTask)).scalars().all()
        assert len(tasks) == 2
        stations = {t.station for t in tasks}
        assert ProductionStation.kitchen in stations
        assert ProductionStation.bar in stations

        # Grab task IDs for subsequent steps
        kitchen_task = next(t for t in tasks if t.station == ProductionStation.kitchen)
        bar_task      = next(t for t in tasks if t.station == ProductionStation.bar)
        order_id = db_session.execute(select(Order)).scalars().first().id

        # All tasks start as pending
        assert kitchen_task.status == ProductionStatus.pending
        assert bar_task.status     == ProductionStatus.pending

        # ----------------------------------------------------------------
        # STEP 4 – Production: pending → preparing → completed
        # ----------------------------------------------------------------

        # Move kitchen task: pending → preparing
        patch_resp = client.patch(
            f"/api/v1/staff/production/tasks/{kitchen_task.id}/status",
            json={"production_status": "preparing"},
        )
        assert patch_resp.status_code == 200, patch_resp.text
        db_session.expire(kitchen_task)
        assert kitchen_task.status == ProductionStatus.preparing

        # Move kitchen task: preparing → completed
        patch_resp = client.patch(
            f"/api/v1/staff/production/tasks/{kitchen_task.id}/status",
            json={"production_status": "completed"},
        )
        assert patch_resp.status_code == 200, patch_resp.text
        db_session.expire(kitchen_task)
        assert kitchen_task.status == ProductionStatus.completed

        # Move bar task: pending → preparing → completed
        client.patch(
            f"/api/v1/staff/production/tasks/{bar_task.id}/status",
            json={"production_status": "preparing"},
        )
        patch_resp = client.patch(
            f"/api/v1/staff/production/tasks/{bar_task.id}/status",
            json={"production_status": "completed"},
        )
        assert patch_resp.status_code == 200, patch_resp.text
        db_session.expire(bar_task)
        assert bar_task.status == ProductionStatus.completed

        # ----------------------------------------------------------------
        # STEP 5 – Pickup: order appears in queue; POST marks picked up
        # ----------------------------------------------------------------

        # GET pickup queue — both tasks completed → order should appear
        pickup_resp = client.get("/api/v1/staff/production/pickup/orders")
        assert pickup_resp.status_code == 200, pickup_resp.text
        pickup_body = pickup_resp.json()
        pickup_order_ids = [o["order_id"] for o in pickup_body["orders"]]
        assert order_id in pickup_order_ids, (
            f"Order {order_id} should appear in pickup queue"
        )

        # Mark picked up
        pickup_post = client.post(
            f"/api/v1/staff/production/pickup/orders/{order_id}"
        )
        assert pickup_post.status_code == 200, pickup_post.text
        pickup_result = pickup_post.json()
        assert pickup_result["order_id"] == order_id
        assert pickup_result["picked_up_at"] is not None

        # Verify both tasks have picked_up_at set in DB
        db_session.expire(kitchen_task)
        db_session.expire(bar_task)
        assert kitchen_task.picked_up_at is not None
        assert bar_task.picked_up_at     is not None

        # After pickup, order disappears from queue (picked_up_at is no longer None)
        pickup_resp2 = client.get("/api/v1/staff/production/pickup/orders")
        assert pickup_resp2.status_code == 200
        ids_after = [o["order_id"] for o in pickup_resp2.json()["orders"]]
        assert order_id not in ids_after, (
            "Picked-up order must no longer appear in the pickup queue"
        )

        # ----------------------------------------------------------------
        # STEP 6 – start-checkout → bill=paying + checkout_total snapshotted
        #         Then a new order on this table must return 409
        # ----------------------------------------------------------------

        checkout_resp = client.post(
            f"/api/v1/staff/table/{table.code}/start-checkout"
        )
        assert checkout_resp.status_code == 200, checkout_resp.text
        checkout_body = checkout_resp.json()
        assert checkout_body["bill_status"] in ("paying", "BillStatus.paying")

        # Confirm bill DB state
        db_session.expire(bill)
        assert bill.status == BillStatus.paying
        assert bill.checkout_total == Decimal("32.00")

        # New order while bill is paying → 409
        conflict_resp = client.post(
            f"/api/v1/customer-orders/customer/table/{table.code}/orders",
            json={
                "source": "staff",
                "items": [{"menu_item_id": bar_item.id, "quantity": 1}],
            },
        )
        assert conflict_resp.status_code == 409, (
            f"Expected 409 Conflict when bill is paying, got {conflict_resp.status_code}: {conflict_resp.text}"
        )
        assert "checkout" in conflict_resp.json()["detail"].lower()

        # ----------------------------------------------------------------
        # STEP 7 – mark-paid: creates Payment, flips bill to paid, releases table
        #         Then repeat call with same idempotency_key → no second Payment
        # ----------------------------------------------------------------

        mark_paid_payload = {
            "provider_payment_id": "sq_e2e_test_001",
            "amount": "32.00",
            "idempotency_key": "e2e-idem-key-abc",
        }

        paid_resp = client.post(
            f"/api/v1/staff/table/{table.code}/mark-paid",
            json=mark_paid_payload,
        )
        assert paid_resp.status_code == 200, paid_resp.text
        paid_body = paid_resp.json()
        assert paid_body["bill_status"] in ("paid", "BillStatus.paid")
        assert paid_body["session_table_status"] in ("available", "SessionTableStatus.available")
        assert paid_body["current_party_size"] == 0

        # Bill and table DB state
        db_session.expire(bill)
        db_session.expire(st)
        assert bill.status == BillStatus.paid
        assert bill.closed_at is not None
        assert st.status == SessionTableStatus.available
        assert st.current_party_size == 0

        # Payment row created
        payments = db_session.execute(
            select(Payment).where(Payment.bill_id == bill.id)
        ).scalars().all()
        assert len(payments) == 1
        payment = payments[0]
        assert payment.provider == "square"
        assert payment.provider_payment_id == "sq_e2e_test_001"
        assert payment.amount == Decimal("32.00")
        assert payment.status.value == "completed"
        assert payment.paid_at is not None

        # Idempotency: repeat call with same key → 200, still only one Payment
        idem_resp = client.post(
            f"/api/v1/staff/table/{table.code}/mark-paid",
            json=mark_paid_payload,
        )
        assert idem_resp.status_code == 200, idem_resp.text
        idem_body = idem_resp.json()
        assert idem_body.get("idempotent") is True

        payments_after = db_session.execute(
            select(Payment).where(Payment.bill_id == bill.id)
        ).scalars().all()
        assert len(payments_after) == 1, (
            "Idempotent call must not create a second Payment row"
        )

        # ----------------------------------------------------------------
        # STEP 8 – After payment: GET bill → None (no open bill)
        # ----------------------------------------------------------------

        post_payment_resp = client.get(
            f"/api/v1/customer-orders/customer/table/{table.code}/bill"
        )
        assert post_payment_resp.status_code == 200, post_payment_resp.text
        assert post_payment_resp.json() is None, (
            "GET bill after payment must return null — no open bill exists"
        )
