"""
Tests for Phase 3 backend payment hardening.
"""
import os
import pytest
from datetime import date
from decimal import Decimal
from sqlalchemy import select

from app.core.time import utcnow

from app.models.bill import Bill
from app.models.enums import BillStatus, SessionStatus, SessionTableStatus
from app.models.payment import Payment
from app.models.session import Session as SessionModel
from app.models.table import Table, SessionTable


# ---------------------------------------------------------------------------
# Shared seed helpers (mirror style of test_get_bill_readonly.py)
# ---------------------------------------------------------------------------

def _seed_active_session_and_table(db) -> tuple[SessionModel, Table, SessionTable]:
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
        status=SessionTableStatus.occupied,
    )
    db.add(st)
    db.flush()
    db.commit()
    return session, table, st


def _seed_open_bill(db, session_table_id: int, total: Decimal = Decimal("50.00")) -> Bill:
    bill = Bill(
        session_table_id=session_table_id,
        status=BillStatus.open,
        subtotal=total,
        tax=Decimal("0.00"),
        service_charge=Decimal("0.00"),
        total=total,
    )
    db.add(bill)
    db.commit()
    return bill


def _seed_paying_bill(db, session_table_id: int, total: Decimal = Decimal("50.00")) -> Bill:
    bill = _seed_open_bill(db, session_table_id, total)
    bill.status = BillStatus.paying
    bill.checkout_total = total
    db.commit()
    return bill


# ---------------------------------------------------------------------------
# Task 1 test: checkout_total snapshot
# ---------------------------------------------------------------------------

class TestCheckoutTotalSnapshot:
    def test_start_checkout_sets_checkout_total(self, client, db_session):
        """start-checkout must snapshot bill.checkout_total == bill.total."""
        _, _, st = _seed_active_session_and_table(db_session)
        bill = _seed_open_bill(db_session, st.id, Decimal("42.00"))

        resp = client.post("/api/v1/staff/table/T1/start-checkout")
        assert resp.status_code == 200

        db_session.expire(bill)
        db_session.refresh(bill)
        assert bill.checkout_total == Decimal("42.00")


# ---------------------------------------------------------------------------
# Task 2 test: paying bill rejects new orders (409)
# ---------------------------------------------------------------------------

class TestPayingBillFreezeOrdering:
    def test_order_rejected_when_bill_is_paying(self, client, db_session):
        """POST orders on a paying bill must return 409."""
        from app.models.menu import MenuCategory, MenuItem
        from app.models.enums import MenuItemType

        _, _, st = _seed_active_session_and_table(db_session)
        _seed_paying_bill(db_session, st.id)

        cat = MenuCategory(name="Drinks", display_order=1)
        db_session.add(cat)
        db_session.flush()
        item = MenuItem(
            name="Latte",
            category_id=cat.id,
            item_type=MenuItemType.regular,
            price=Decimal("5.00"),
            is_active=True,
            is_bundle=False,
        )
        db_session.add(item)
        db_session.commit()

        resp = client.post(
            "/api/v1/customer-orders/customer/table/T1/orders",
            json={"items": [{"menu_item_id": item.id, "quantity": 1}]},
        )
        assert resp.status_code == 409
        assert "checkout" in resp.json()["detail"].lower()

    def test_order_allowed_after_bill_is_paid(self, client, db_session):
        """After a bill is paid (closed), new orders open a fresh bill — not blocked."""
        from app.models.menu import MenuCategory, MenuItem
        from app.models.enums import MenuItemType

        _, _, st = _seed_active_session_and_table(db_session)
        old_bill = _seed_open_bill(db_session, st.id)
        old_bill.status = BillStatus.paid
        db_session.commit()

        cat = MenuCategory(name="Drinks", display_order=1)
        db_session.add(cat)
        db_session.flush()
        item = MenuItem(
            name="Latte",
            category_id=cat.id,
            item_type=MenuItemType.regular,
            price=Decimal("5.00"),
            is_active=True,
            is_bundle=False,
        )
        db_session.add(item)
        db_session.commit()

        resp = client.post(
            "/api/v1/customer-orders/customer/table/T1/orders",
            json={"items": [{"menu_item_id": item.id, "quantity": 1}]},
        )
        # A paid bill is closed; new orders should open a fresh bill (200)
        assert resp.status_code == 200


# ---------------------------------------------------------------------------
# Task 3 tests: idempotent mark-paid + Payment row creation
# ---------------------------------------------------------------------------

class TestMarkPaidIdempotentAndPayment:
    def test_mark_paid_creates_payment_row(self, client, db_session):
        """mark-paid must create a Payment row with status=completed."""
        _, _, st = _seed_active_session_and_table(db_session)
        bill = _seed_paying_bill(db_session, st.id, Decimal("50.00"))

        resp = client.post(
            "/api/v1/staff/table/T1/mark-paid",
            json={
                "provider_payment_id": "sq_abc123",
                "amount": "50.00",
                "idempotency_key": "idem-001",
            },
        )
        assert resp.status_code == 200

        payments = db_session.execute(
            select(Payment).where(Payment.bill_id == bill.id)
        ).scalars().all()
        assert len(payments) == 1
        p = payments[0]
        assert p.provider == "square"
        assert p.provider_payment_id == "sq_abc123"
        assert p.amount == Decimal("50.00")
        assert p.status.value == "completed"
        assert p.paid_at is not None

    def test_mark_paid_sets_bill_paid_and_releases_table(self, client, db_session):
        """mark-paid must set bill=paid, table=available, party_size=0."""
        _, _, st = _seed_active_session_and_table(db_session)
        bill = _seed_paying_bill(db_session, st.id, Decimal("50.00"))

        resp = client.post(
            "/api/v1/staff/table/T1/mark-paid",
            json={
                "provider_payment_id": "sq_xyz",
                "amount": "50.00",
                "idempotency_key": "idem-002",
            },
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["bill_status"] == "paid"
        assert body["session_table_status"] == "available"
        assert body["current_party_size"] == 0

    def test_mark_paid_idempotent_double_call_one_payment(self, client, db_session):
        """Calling mark-paid twice with same idempotency_key must only create one Payment."""
        _, _, st = _seed_active_session_and_table(db_session)
        bill = _seed_paying_bill(db_session, st.id, Decimal("50.00"))

        payload = {
            "provider_payment_id": "sq_dup",
            "amount": "50.00",
            "idempotency_key": "idem-003",
        }
        resp1 = client.post("/api/v1/staff/table/T1/mark-paid", json=payload)
        assert resp1.status_code == 200

        # Second call — bill is already paid, must return existing result idempotently
        resp2 = client.post("/api/v1/staff/table/T1/mark-paid", json=payload)
        assert resp2.status_code == 200

        payments = db_session.execute(
            select(Payment).where(Payment.bill_id == bill.id)
        ).scalars().all()
        assert len(payments) == 1, "Idempotent: only one Payment row must exist"

    def test_mark_paid_amount_mismatch_returns_400(self, client, db_session):
        """If amount does not match checkout_total, return 400."""
        _, _, st = _seed_active_session_and_table(db_session)
        _seed_paying_bill(db_session, st.id, Decimal("50.00"))

        resp = client.post(
            "/api/v1/staff/table/T1/mark-paid",
            json={
                "provider_payment_id": "sq_bad",
                "amount": "99.00",  # wrong
                "idempotency_key": "idem-004",
            },
        )
        assert resp.status_code == 400
        assert "amount" in resp.json()["detail"].lower()

    def test_mark_paid_backward_compatible_no_body(self, client, db_session):
        """mark-paid with no body (legacy call) must still succeed and create a Payment."""
        _, _, st = _seed_active_session_and_table(db_session)
        bill = _seed_paying_bill(db_session, st.id, Decimal("30.00"))

        resp = client.post("/api/v1/staff/table/T1/mark-paid")
        assert resp.status_code == 200

        payments = db_session.execute(
            select(Payment).where(Payment.bill_id == bill.id)
        ).scalars().all()
        assert len(payments) == 1
        assert payments[0].amount == Decimal("30.00")


# ---------------------------------------------------------------------------
# [P2c] mark-paid Square verification hardening
# ---------------------------------------------------------------------------

@pytest.fixture(autouse=False)
def production_client(db_engine):
    """TestClient with APP_ENV=production + a known INTERNAL_GATEWAY_TOKEN,
    so gateway allows through and only the mark-paid logic sees production mode."""
    from app.main import app
    from app.core.database import get_db
    from fastapi.testclient import TestClient
    from sqlalchemy.orm import sessionmaker

    # Set production env vars.
    old_env = os.environ.get("APP_ENV")
    old_token = os.environ.get("INTERNAL_GATEWAY_TOKEN")
    os.environ["APP_ENV"] = "production"
    os.environ["INTERNAL_GATEWAY_TOKEN"] = "test-prod-token"

    TestingSessionLocal = sessionmaker(
        autocommit=False, autoflush=False, bind=db_engine
    )

    def override_get_db():
        s = TestingSessionLocal()
        try:
            yield s
        finally:
            s.close()

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app, raise_server_exceptions=False) as c:
        # Wrap client so callers automatically get the gateway token header.
        original_post = c.post

        def post_with_token(url, **kwargs):
            headers = kwargs.pop("headers", {}) or {}
            headers.setdefault("X-Internal-Token", "test-prod-token")
            return original_post(url, headers=headers, **kwargs)

        c.post = post_with_token  # type: ignore[method-assign]
        yield c

    app.dependency_overrides.clear()

    # Restore env vars.
    if old_env is None:
        os.environ.pop("APP_ENV", None)
    else:
        os.environ["APP_ENV"] = old_env
    if old_token is None:
        os.environ.pop("INTERNAL_GATEWAY_TOKEN", None)
    else:
        os.environ["INTERNAL_GATEWAY_TOKEN"] = old_token


class TestMarkPaidProductionSquareHardening:
    """In production, Square mark-paid must include provider_payment_id."""

    def test_production_square_missing_provider_id_returns_400(
        self, production_client, db_session
    ):
        """In production, Square payments without provider_payment_id are rejected 400."""
        _, _, st = _seed_active_session_and_table(db_session)
        _seed_paying_bill(db_session, st.id, Decimal("50.00"))

        resp = production_client.post(
            "/api/v1/staff/table/T1/mark-paid",
            json={
                "amount": "50.00",
                # provider_payment_id intentionally omitted
                # manual: false (default)
            },
        )
        assert resp.status_code == 400
        detail = resp.json()["detail"].lower()
        assert "provider_payment_id" in detail

    def test_production_square_configured_and_valid_succeeds(
        self, production_client, db_session, monkeypatch
    ):
        """In production, Square payment verified as valid (configured+valid) is accepted."""
        # Patch verify_square_payment so it looks configured and valid.
        monkeypatch.setattr(
            "app.api.v1.endpoints.staff_checkout.verify_square_payment",
            lambda pid, cents: {"configured": True, "valid": True, "reason": "ok"},
        )

        _, _, st = _seed_active_session_and_table(db_session)
        bill = _seed_paying_bill(db_session, st.id, Decimal("50.00"))

        resp = production_client.post(
            "/api/v1/staff/table/T1/mark-paid",
            json={
                "provider_payment_id": "sq_prod_abc123",
                "amount": "50.00",
                "idempotency_key": "prod-idem-001",
            },
        )
        assert resp.status_code == 200

        payments = db_session.execute(
            select(Payment).where(Payment.bill_id == bill.id)
        ).scalars().all()
        assert len(payments) == 1
        p = payments[0]
        assert p.provider == "square"
        assert p.provider_payment_id == "sq_prod_abc123"

    def test_production_square_not_configured_returns_503(
        self, production_client, db_session, monkeypatch
    ):
        """In production, Square payment when Square is not configured is rejected 503."""
        # Patch verify_square_payment to return unconfigured (no credentials set).
        monkeypatch.setattr(
            "app.api.v1.endpoints.staff_checkout.verify_square_payment",
            lambda pid, cents: {"configured": False},
        )

        _, _, st = _seed_active_session_and_table(db_session)
        _seed_paying_bill(db_session, st.id, Decimal("50.00"))

        resp = production_client.post(
            "/api/v1/staff/table/T1/mark-paid",
            json={
                "provider_payment_id": "sq_prod_unconfigured",
                "amount": "50.00",
                "idempotency_key": "prod-503-001",
            },
        )
        assert resp.status_code == 503
        detail = resp.json()["detail"].lower()
        assert "not configured" in detail or "verification" in detail

    def test_production_manual_override_no_provider_id_succeeds(
        self, production_client, db_session
    ):
        """In production, manual=True override works without provider_payment_id."""
        _, _, st = _seed_active_session_and_table(db_session)
        bill = _seed_paying_bill(db_session, st.id, Decimal("50.00"))

        resp = production_client.post(
            "/api/v1/staff/table/T1/mark-paid",
            json={
                "manual": True,
                "amount": "50.00",
                "idempotency_key": "prod-manual-001",
            },
        )
        assert resp.status_code == 200

        payments = db_session.execute(
            select(Payment).where(Payment.bill_id == bill.id)
        ).scalars().all()
        assert len(payments) == 1
        p = payments[0]
        # Provider label must distinguish manual from Square for audit.
        assert p.provider == "manual"
        assert p.provider_payment_id is None

    def test_dev_square_no_provider_id_still_passes(self, client, db_session):
        """In dev (APP_ENV unset), Square mark-paid without provider_payment_id is allowed."""
        # Ensure we are NOT in production mode.
        os.environ.pop("APP_ENV", None)

        _, _, st = _seed_active_session_and_table(db_session)
        bill = _seed_paying_bill(db_session, st.id, Decimal("25.00"))

        resp = client.post(
            "/api/v1/staff/table/T1/mark-paid",
            json={"amount": "25.00"},
        )
        assert resp.status_code == 200

        payments = db_session.execute(
            select(Payment).where(Payment.bill_id == bill.id)
        ).scalars().all()
        assert len(payments) == 1
        assert payments[0].provider == "square"

    def test_payment_provider_field_distinguishes_square_vs_manual(
        self, client, db_session
    ):
        """Payment.provider is 'square' for normal path, 'manual' for manual override."""
        os.environ.pop("APP_ENV", None)  # dev mode

        _, _, st = _seed_active_session_and_table(db_session)

        # Square path
        bill = _seed_paying_bill(db_session, st.id, Decimal("40.00"))
        resp = client.post(
            "/api/v1/staff/table/T1/mark-paid",
            json={"provider_payment_id": "sq_trace_001", "amount": "40.00"},
        )
        assert resp.status_code == 200
        assert resp.json()["payment_provider"] == "square"

        sq_payment = db_session.execute(
            select(Payment).where(Payment.bill_id == bill.id)
        ).scalars().first()
        assert sq_payment.provider == "square"


# ---------------------------------------------------------------------------
# [P1] mark-paid idempotency scoped to current bill
# ---------------------------------------------------------------------------

class TestMarkPaidIdempotencyBillScoping:
    """Idempotency must be scoped to the current bill, not arbitrary past bills."""

    def test_new_bill_with_idempotency_key_closes_new_bill_not_old(
        self, client, db_session
    ):
        """A new paying bill is closed even when an older paid bill exists on the same table.

        Bug reproduced: passing idempotency_key would short-circuit on the older
        paid bill, leaving the new bill unpaid.
        """
        os.environ.pop("APP_ENV", None)  # dev mode

        _, _, st = _seed_active_session_and_table(db_session)

        # Seed an already-paid old bill (bill #1).
        old_bill = _seed_paying_bill(db_session, st.id, Decimal("30.00"))
        old_bill.status = BillStatus.paid
        old_bill.closed_at = utcnow()
        db_session.commit()

        # Create a new paying bill (bill #2).
        new_bill = _seed_paying_bill(db_session, st.id, Decimal("50.00"))

        # mark-paid with idempotency_key must close NEW bill, not replay old one.
        resp = client.post(
            "/api/v1/staff/table/T1/mark-paid",
            json={
                "provider_payment_id": "sq_new_bill",
                "amount": "50.00",
                "idempotency_key": "idem-new-bill-001",
            },
        )
        assert resp.status_code == 200
        body = resp.json()

        # Response must reference the NEW bill.
        assert body["bill_id"] == new_bill.id, (
            f"Expected new bill id={new_bill.id}, got {body['bill_id']}"
        )
        assert body["bill_status"] == "paid"
        assert body["idempotent"] is False  # This was a real settlement.

        # Verify DB: new bill is paid, payment row exists for new bill.
        db_session.expire(new_bill)
        db_session.refresh(new_bill)
        assert new_bill.status == BillStatus.paid

        new_payments = db_session.execute(
            select(Payment).where(Payment.bill_id == new_bill.id)
        ).scalars().all()
        assert len(new_payments) == 1

        # Old bill must be untouched (still only its existing state).
        old_payments = db_session.execute(
            select(Payment).where(Payment.bill_id == old_bill.id)
        ).scalars().all()
        assert len(old_payments) == 0  # Old bill was never paid via Payment row.

    def test_true_idempotent_replay_same_bill_same_key(self, client, db_session):
        """True replay: same bill, same idempotency_key → one Payment row, idempotent=True."""
        os.environ.pop("APP_ENV", None)

        _, _, st = _seed_active_session_and_table(db_session)
        bill = _seed_paying_bill(db_session, st.id, Decimal("50.00"))

        payload = {
            "provider_payment_id": "sq_replay",
            "amount": "50.00",
            "idempotency_key": "idem-replay-001",
        }

        # First call: real settlement.
        resp1 = client.post("/api/v1/staff/table/T1/mark-paid", json=payload)
        assert resp1.status_code == 200
        assert resp1.json()["idempotent"] is False

        # Second call: idempotent replay.
        resp2 = client.post("/api/v1/staff/table/T1/mark-paid", json=payload)
        assert resp2.status_code == 200
        body2 = resp2.json()
        assert body2["idempotent"] is True
        assert body2["bill_id"] == bill.id

        # Only one Payment row must exist.
        payments = db_session.execute(
            select(Payment).where(Payment.bill_id == bill.id)
        ).scalars().all()
        assert len(payments) == 1


# ---------------------------------------------------------------------------
# [P4] Production queue excludes paid/cancelled bills and picked-up tasks
# ---------------------------------------------------------------------------

class TestProductionQueueFiltering:
    """Station production queue must not show stale tasks."""

    def _seed_session_table_bill(self, db, code="PQ1", total=Decimal("20.00")):
        from app.models.session import Session as SessionModel
        from app.models.table import Table, SessionTable

        session = SessionModel(
            name="PQ Session",
            service_date=date.today(),
            status=SessionStatus.active,
        )
        db.add(session)
        db.flush()

        table = Table(code=code, seats=2, is_active=True, is_shareable=False)
        db.add(table)
        db.flush()

        st = SessionTable(
            session_id=session.id,
            table_id=table.id,
            status=SessionTableStatus.occupied,
        )
        db.add(st)
        db.flush()

        bill = Bill(
            session_table_id=st.id,
            status=BillStatus.open,
            subtotal=total,
            tax=Decimal("0.00"),
            service_charge=Decimal("0.00"),
            total=total,
        )
        db.add(bill)
        db.commit()
        return session, table, st, bill

    def _seed_task(self, db, bill, code="PQ1"):
        from app.models.enums import MenuItemType, ProductionStation, ProductionStatus
        from app.models.menu import MenuCategory, MenuItem
        from app.models.order import Order, OrderItem, ProductionTask
        from app.models.enums import OrderSource

        cat = MenuCategory(name="Bar", display_order=1)
        db.add(cat)
        db.flush()

        item = MenuItem(
            name="Juice",
            category_id=cat.id,
            item_type=MenuItemType.regular,
            price=Decimal("5.00"),
            is_active=True,
            is_bundle=False,
        )
        db.add(item)
        db.flush()

        order = Order(
            bill_id=bill.id,
            source=OrderSource.qr,
        )
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
            station=ProductionStation.bar,
            display_name="Juice",
            quantity=1,
            status=ProductionStatus.pending,
        )
        db.add(task)
        db.commit()
        return task

    def test_paid_bill_tasks_excluded_from_queue(self, client, db_session):
        """Tasks on a paid bill must NOT appear in the station queue."""
        _, _, st, bill = self._seed_session_table_bill(db_session, code="PQ2")
        self._seed_task(db_session, bill, code="PQ2")

        # Close the bill as paid.
        bill.status = BillStatus.paid
        db_session.commit()

        resp = client.get("/api/v1/staff/production/bar")
        assert resp.status_code == 200
        task_ids = [t["bill_id"] for t in resp.json()["items"]]
        assert bill.id not in task_ids, (
            "Tasks on a paid bill must not appear in the station queue"
        )

    def test_cancelled_bill_tasks_excluded_from_queue(self, client, db_session):
        """Tasks on a cancelled bill must NOT appear in the station queue."""
        _, _, st, bill = self._seed_session_table_bill(db_session, code="PQ3")
        self._seed_task(db_session, bill, code="PQ3")

        bill.status = BillStatus.cancelled
        db_session.commit()

        resp = client.get("/api/v1/staff/production/bar")
        assert resp.status_code == 200
        task_ids = [t["bill_id"] for t in resp.json()["items"]]
        assert bill.id not in task_ids

    def test_picked_up_tasks_excluded_from_queue(self, client, db_session):
        """Tasks that have been picked up (picked_up_at set) must NOT appear in queue."""
        _, _, st, bill = self._seed_session_table_bill(db_session, code="PQ4")
        task = self._seed_task(db_session, bill, code="PQ4")

        # Mark task as completed and picked up.
        from app.models.enums import ProductionStatus
        task.status = ProductionStatus.completed
        task.picked_up_at = utcnow()
        db_session.commit()

        resp = client.get("/api/v1/staff/production/bar")
        assert resp.status_code == 200
        task_ids = [t["production_task_id"] for t in resp.json()["items"]]
        assert task.id not in task_ids, (
            "Picked-up tasks must not appear in the station queue"
        )

    def test_active_pending_tasks_appear_in_queue(self, client, db_session):
        """Pending tasks on an open (active) bill MUST appear in the station queue."""
        _, _, st, bill = self._seed_session_table_bill(db_session, code="PQ5")
        task = self._seed_task(db_session, bill, code="PQ5")

        resp = client.get("/api/v1/staff/production/bar")
        assert resp.status_code == 200
        task_ids = [t["production_task_id"] for t in resp.json()["items"]]
        assert task.id in task_ids, (
            "Pending tasks on an open bill must appear in the station queue"
        )
