"""
Tests for P2 bug fixes:
  #1 - mark-paid replay by provider_payment_id only (no idempotency_key)
  #2 - paid/cancelled bill tasks/pickup blocked with 409
"""
import os
from datetime import date
from decimal import Decimal

import pytest
from sqlalchemy import select

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
from app.models.maid import Maid
from app.models.menu import MenuCategory, MenuItem
from app.models.order import Order, OrderItem, ProductionTask
from app.models.payment import Payment
from app.models.session import Session as SessionModel
from app.models.table import SessionTable, Table


# ---------------------------------------------------------------------------
# Seed helpers
# ---------------------------------------------------------------------------


def _seed_active_session_and_table(db, code="T99") -> tuple[SessionModel, Table, SessionTable]:
    session = SessionModel(
        name="P2 Session",
        service_date=date.today(),
        status=SessionStatus.active,
    )
    db.add(session)
    db.flush()

    table = Table(code=code, seats=4, is_active=True, is_shareable=False)
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


def _seed_paying_bill(db, session_table_id: int, total: Decimal = Decimal("50.00")) -> Bill:
    bill = Bill(
        session_table_id=session_table_id,
        status=BillStatus.paying,
        subtotal=total,
        tax=Decimal("0.00"),
        service_charge=Decimal("0.00"),
        total=total,
        checkout_total=total,
    )
    db.add(bill)
    db.commit()
    return bill


def _seed_task_on_bill(
    db,
    bill: Bill,
    station: ProductionStation = ProductionStation.bar,
    status: ProductionStatus = ProductionStatus.pending,
) -> tuple[Order, OrderItem, ProductionTask]:
    cat = MenuCategory(name="Test Cat", display_order=1)
    db.add(cat)
    db.flush()

    item = MenuItem(
        name="Test Item",
        category_id=cat.id,
        item_type=MenuItemType.regular,
        price=Decimal("5.00"),
        is_active=True,
        is_bundle=False,
    )
    db.add(item)
    db.flush()

    order = Order(bill_id=bill.id, source=OrderSource.qr)
    db.add(order)
    db.flush()

    oi = OrderItem(
        order_id=order.id,
        menu_item_id=item.id,
        quantity=1,
        unit_price=Decimal("5.00"),
        total_price=Decimal("5.00"),
    )
    db.add(oi)
    db.flush()

    task = ProductionTask(
        order_item_id=oi.id,
        station=station,
        display_name="Test Item",
        quantity=1,
        status=status,
    )
    db.add(task)
    db.commit()
    return order, oi, task


# ===========================================================================
# #1 — provider_payment_id-only replay
# ===========================================================================


class TestMarkPaidReplayByProviderPaymentId:
    """Replay mark-paid with only provider_payment_id (no idempotency_key) → 200 idempotent."""

    def test_replay_by_provider_payment_id_only_returns_200(self, client, db_session):
        """Second call with only provider_payment_id returns idempotent 200, no dup Payment."""
        os.environ.pop("APP_ENV", None)  # dev mode
        _, _, st = _seed_active_session_and_table(db_session, code="RP1")
        bill = _seed_paying_bill(db_session, st.id, Decimal("40.00"))

        # First call: include both keys so the first settlement succeeds.
        first_resp = client.post(
            "/api/v1/staff/table/RP1/mark-paid",
            json={
                "provider_payment_id": "sq_replay_pid_only",
                "amount": "40.00",
                "idempotency_key": "idem-rp-001",
            },
        )
        assert first_resp.status_code == 200
        assert first_resp.json()["idempotent"] is False

        # Second call: provider_payment_id only, NO idempotency_key.
        second_resp = client.post(
            "/api/v1/staff/table/RP1/mark-paid",
            json={
                "provider_payment_id": "sq_replay_pid_only",
                # idempotency_key intentionally omitted
            },
        )
        assert second_resp.status_code == 200, second_resp.json()
        body = second_resp.json()
        assert body["idempotent"] is True
        assert body["bill_id"] == bill.id

        # Only one Payment row must exist.
        payments = db_session.execute(
            select(Payment).where(Payment.bill_id == bill.id)
        ).scalars().all()
        assert len(payments) == 1, f"Expected 1 Payment, got {len(payments)}"
        assert payments[0].payment_id if hasattr(payments[0], "payment_id") else True

    def test_replay_by_provider_payment_id_same_payment_id_returned(
        self, client, db_session
    ):
        """Replay returns the same payment_id as the original settlement."""
        os.environ.pop("APP_ENV", None)
        _, _, st = _seed_active_session_and_table(db_session, code="RP2")
        _seed_paying_bill(db_session, st.id, Decimal("30.00"))

        first_resp = client.post(
            "/api/v1/staff/table/RP2/mark-paid",
            json={
                "provider_payment_id": "sq_same_pid",
                "amount": "30.00",
            },
        )
        assert first_resp.status_code == 200
        original_payment_id = first_resp.json()["payment_id"]

        second_resp = client.post(
            "/api/v1/staff/table/RP2/mark-paid",
            json={"provider_payment_id": "sq_same_pid"},
        )
        assert second_resp.status_code == 200
        assert second_resp.json()["payment_id"] == original_payment_id

    def test_different_provider_payment_id_on_open_bill_settles_normally(
        self, client, db_session
    ):
        """A different provider_payment_id on a fresh paying bill is not treated as replay."""
        os.environ.pop("APP_ENV", None)
        _, _, st = _seed_active_session_and_table(db_session, code="RP3")
        bill = _seed_paying_bill(db_session, st.id, Decimal("20.00"))

        resp = client.post(
            "/api/v1/staff/table/RP3/mark-paid",
            json={
                "provider_payment_id": "sq_unique_pid",
                "amount": "20.00",
            },
        )
        assert resp.status_code == 200
        assert resp.json()["idempotent"] is False
        assert resp.json()["bill_id"] == bill.id


# ===========================================================================
# #2 — closed bill guards on task status + pickup
# ===========================================================================


class TestClosedBillProductionGuards:
    """PATCH task status and runner pickup must be blocked (409) on paid/cancelled bills."""

    def test_patch_task_status_on_paid_bill_returns_409(self, client, db_session):
        """PATCH /staff/production/tasks/{id}/status on a paid-bill task → 409."""
        _, _, st = _seed_active_session_and_table(db_session, code="PG1")
        # Seed as open first, then mark paid.
        bill = Bill(
            session_table_id=st.id,
            status=BillStatus.open,
            subtotal=Decimal("10.00"),
            tax=Decimal("0.00"),
            service_charge=Decimal("0.00"),
            total=Decimal("10.00"),
        )
        db_session.add(bill)
        db_session.commit()

        _, _, task = _seed_task_on_bill(db_session, bill)

        # Close the bill.
        bill.status = BillStatus.paid
        db_session.commit()

        resp = client.patch(
            f"/api/v1/staff/production/tasks/{task.id}/status",
            json={"production_status": "preparing"},
        )
        assert resp.status_code == 409, resp.json()
        assert "paid" in resp.json()["detail"].lower()

        # DB must be unchanged.
        db_session.expire(task)
        db_session.refresh(task)
        assert task.status == ProductionStatus.pending

    def test_patch_task_status_on_cancelled_bill_returns_409(self, client, db_session):
        """PATCH task status on a cancelled-bill task → 409."""
        _, _, st = _seed_active_session_and_table(db_session, code="PG2")
        bill = Bill(
            session_table_id=st.id,
            status=BillStatus.open,
            subtotal=Decimal("10.00"),
            tax=Decimal("0.00"),
            service_charge=Decimal("0.00"),
            total=Decimal("10.00"),
        )
        db_session.add(bill)
        db_session.commit()

        _, _, task = _seed_task_on_bill(db_session, bill)

        bill.status = BillStatus.cancelled
        db_session.commit()

        resp = client.patch(
            f"/api/v1/staff/production/tasks/{task.id}/status",
            json={"production_status": "completed"},
        )
        assert resp.status_code == 409, resp.json()
        assert "cancelled" in resp.json()["detail"].lower()

        db_session.expire(task)
        db_session.refresh(task)
        assert task.status == ProductionStatus.pending

    def test_patch_task_status_on_open_bill_succeeds(self, client, db_session):
        """PATCH task status on an open-bill task → 200 (not blocked)."""
        _, _, st = _seed_active_session_and_table(db_session, code="PG3")
        bill = Bill(
            session_table_id=st.id,
            status=BillStatus.open,
            subtotal=Decimal("10.00"),
            tax=Decimal("0.00"),
            service_charge=Decimal("0.00"),
            total=Decimal("10.00"),
        )
        db_session.add(bill)
        db_session.commit()

        _, _, task = _seed_task_on_bill(db_session, bill)

        resp = client.patch(
            f"/api/v1/staff/production/tasks/{task.id}/status",
            json={"production_status": "preparing"},
        )
        assert resp.status_code == 200, resp.json()
        assert resp.json()["production_status"] == "preparing"

    def test_patch_task_status_on_paying_bill_succeeds(self, client, db_session):
        """PATCH task status on a paying-bill task → 200 (paying is still open for production)."""
        _, _, st = _seed_active_session_and_table(db_session, code="PG4")
        bill = Bill(
            session_table_id=st.id,
            status=BillStatus.paying,
            subtotal=Decimal("10.00"),
            tax=Decimal("0.00"),
            service_charge=Decimal("0.00"),
            total=Decimal("10.00"),
            checkout_total=Decimal("10.00"),
        )
        db_session.add(bill)
        db_session.commit()

        _, _, task = _seed_task_on_bill(db_session, bill)

        resp = client.patch(
            f"/api/v1/staff/production/tasks/{task.id}/status",
            json={"production_status": "completed"},
        )
        assert resp.status_code == 200, resp.json()
        assert resp.json()["production_status"] == "completed"

    def test_pickup_on_paid_bill_returns_409(self, client, db_session):
        """POST /staff/production/pickup/orders/{id} on a paid-bill order → 409."""
        _, _, st = _seed_active_session_and_table(db_session, code="PG5")
        bill = Bill(
            session_table_id=st.id,
            status=BillStatus.open,
            subtotal=Decimal("10.00"),
            tax=Decimal("0.00"),
            service_charge=Decimal("0.00"),
            total=Decimal("10.00"),
        )
        db_session.add(bill)
        db_session.commit()

        order, _, task = _seed_task_on_bill(
            db_session, bill, status=ProductionStatus.completed
        )

        # Close the bill.
        bill.status = BillStatus.paid
        db_session.commit()

        resp = client.post(f"/api/v1/staff/production/pickup/orders/{order.id}")
        assert resp.status_code == 409, resp.json()
        assert "paid" in resp.json()["detail"].lower()

        # picked_up_at must still be None.
        db_session.expire(task)
        db_session.refresh(task)
        assert task.picked_up_at is None

    def test_pickup_on_cancelled_bill_returns_409(self, client, db_session):
        """POST pickup on a cancelled-bill order → 409."""
        _, _, st = _seed_active_session_and_table(db_session, code="PG6")
        bill = Bill(
            session_table_id=st.id,
            status=BillStatus.open,
            subtotal=Decimal("10.00"),
            tax=Decimal("0.00"),
            service_charge=Decimal("0.00"),
            total=Decimal("10.00"),
        )
        db_session.add(bill)
        db_session.commit()

        order, _, task = _seed_task_on_bill(
            db_session, bill, status=ProductionStatus.completed
        )

        bill.status = BillStatus.cancelled
        db_session.commit()

        resp = client.post(f"/api/v1/staff/production/pickup/orders/{order.id}")
        assert resp.status_code == 409, resp.json()
        assert "cancelled" in resp.json()["detail"].lower()

        db_session.expire(task)
        db_session.refresh(task)
        assert task.picked_up_at is None

    def test_pickup_on_open_bill_succeeds(self, client, db_session):
        """POST pickup on an open-bill order with completed tasks → 200."""
        _, _, st = _seed_active_session_and_table(db_session, code="PG7")
        bill = Bill(
            session_table_id=st.id,
            status=BillStatus.open,
            subtotal=Decimal("10.00"),
            tax=Decimal("0.00"),
            service_charge=Decimal("0.00"),
            total=Decimal("10.00"),
        )
        db_session.add(bill)
        db_session.commit()

        order, _, task = _seed_task_on_bill(
            db_session, bill, status=ProductionStatus.completed
        )

        resp = client.post(f"/api/v1/staff/production/pickup/orders/{order.id}")
        assert resp.status_code == 200, resp.json()
        assert resp.json()["order_id"] == order.id


# ===========================================================================
# #3 — Dual-identifier replay correctness (idempotency_key + provider_payment_id)
# ===========================================================================


class TestDualIdentifierReplayCorrectness:
    """mark-paid with BOTH idempotency_key and provider_payment_id.

    - Consistent pair (same idem_key + same ppid) on an already-paid bill → 200 idempotent.
    - Same idem_key but DIFFERENT ppid → 409 conflict.
    - Same ppid but DIFFERENT idem_key → 409 conflict.
    - Single-identifier replay (key only / ppid only) → still 200 (regression guard).
    """

    def test_dual_consistent_replay_returns_200(self, client, db_session):
        """Both identifiers match the same existing payment → idempotent 200."""
        os.environ.pop("APP_ENV", None)
        _, _, st = _seed_active_session_and_table(db_session, code="DI1")
        bill = _seed_paying_bill(db_session, st.id, Decimal("60.00"))

        # First call — settle the bill.
        r1 = client.post(
            "/api/v1/staff/table/DI1/mark-paid",
            json={
                "idempotency_key": "idem-di1",
                "provider_payment_id": "sq_di1",
                "amount": "60.00",
            },
        )
        assert r1.status_code == 200, r1.json()
        assert r1.json()["idempotent"] is False
        original_payment_id = r1.json()["payment_id"]

        # Replay with the same pair → idempotent 200.
        r2 = client.post(
            "/api/v1/staff/table/DI1/mark-paid",
            json={
                "idempotency_key": "idem-di1",
                "provider_payment_id": "sq_di1",
            },
        )
        assert r2.status_code == 200, r2.json()
        body2 = r2.json()
        assert body2["idempotent"] is True
        assert body2["payment_id"] == original_payment_id

        # Still exactly one Payment row.
        payments = db_session.execute(
            select(Payment).where(Payment.bill_id == bill.id)
        ).scalars().all()
        assert len(payments) == 1

    def test_same_idem_key_different_ppid_returns_409(self, client, db_session):
        """Same idempotency_key + DIFFERENT provider_payment_id → 409 conflict."""
        os.environ.pop("APP_ENV", None)
        _, _, st = _seed_active_session_and_table(db_session, code="DI2")
        bill = _seed_paying_bill(db_session, st.id, Decimal("55.00"))

        # Settle with original pair.
        r1 = client.post(
            "/api/v1/staff/table/DI2/mark-paid",
            json={
                "idempotency_key": "idem-di2",
                "provider_payment_id": "sq_di2_original",
                "amount": "55.00",
            },
        )
        assert r1.status_code == 200, r1.json()

        # Replay with same idem_key but different ppid → must be 409.
        r2 = client.post(
            "/api/v1/staff/table/DI2/mark-paid",
            json={
                "idempotency_key": "idem-di2",
                "provider_payment_id": "sq_di2_DIFFERENT",
            },
        )
        assert r2.status_code == 409, r2.json()

        # No new Payment row must have been created.
        payments = db_session.execute(
            select(Payment).where(Payment.bill_id == bill.id)
        ).scalars().all()
        assert len(payments) == 1

    def test_same_ppid_different_idem_key_returns_409(self, client, db_session):
        """Same provider_payment_id + DIFFERENT idempotency_key → 409 conflict."""
        os.environ.pop("APP_ENV", None)
        _, _, st = _seed_active_session_and_table(db_session, code="DI3")
        bill = _seed_paying_bill(db_session, st.id, Decimal("45.00"))

        # Settle with original pair.
        r1 = client.post(
            "/api/v1/staff/table/DI3/mark-paid",
            json={
                "idempotency_key": "idem-di3-original",
                "provider_payment_id": "sq_di3",
                "amount": "45.00",
            },
        )
        assert r1.status_code == 200, r1.json()

        # Replay with same ppid but different idem_key → must be 409.
        r2 = client.post(
            "/api/v1/staff/table/DI3/mark-paid",
            json={
                "idempotency_key": "idem-di3-DIFFERENT",
                "provider_payment_id": "sq_di3",
            },
        )
        assert r2.status_code == 409, r2.json()

        # No new Payment row must have been created.
        payments = db_session.execute(
            select(Payment).where(Payment.bill_id == bill.id)
        ).scalars().all()
        assert len(payments) == 1

    def test_single_idem_key_only_replay_still_200(self, client, db_session):
        """Regression: replay with only idempotency_key (no ppid) still returns 200."""
        os.environ.pop("APP_ENV", None)
        _, _, st = _seed_active_session_and_table(db_session, code="DI4")
        _seed_paying_bill(db_session, st.id, Decimal("35.00"))

        r1 = client.post(
            "/api/v1/staff/table/DI4/mark-paid",
            json={"idempotency_key": "idem-di4-only", "amount": "35.00"},
        )
        assert r1.status_code == 200, r1.json()
        original_payment_id = r1.json()["payment_id"]

        r2 = client.post(
            "/api/v1/staff/table/DI4/mark-paid",
            json={"idempotency_key": "idem-di4-only"},
        )
        assert r2.status_code == 200, r2.json()
        assert r2.json()["idempotent"] is True
        assert r2.json()["payment_id"] == original_payment_id

    def test_single_ppid_only_replay_still_200(self, client, db_session):
        """Regression: replay with only provider_payment_id (no idem_key) still returns 200."""
        os.environ.pop("APP_ENV", None)
        _, _, st = _seed_active_session_and_table(db_session, code="DI5")
        _seed_paying_bill(db_session, st.id, Decimal("25.00"))

        r1 = client.post(
            "/api/v1/staff/table/DI5/mark-paid",
            json={"provider_payment_id": "sq_di5_only", "amount": "25.00"},
        )
        assert r1.status_code == 200, r1.json()
        original_payment_id = r1.json()["payment_id"]

        r2 = client.post(
            "/api/v1/staff/table/DI5/mark-paid",
            json={"provider_payment_id": "sq_di5_only"},
        )
        assert r2.status_code == 200, r2.json()
        assert r2.json()["idempotent"] is True
        assert r2.json()["payment_id"] == original_payment_id
