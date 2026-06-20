"""
Tests for two checkout flow fixes:
  #1 — start-checkout response includes checkout_total
  #2 — cancel-checkout endpoint (revert paying→open, with Payment guard)
"""
from datetime import date
from decimal import Decimal

import pytest
from sqlalchemy import select

from app.models.bill import Bill
from app.models.enums import BillStatus, PaymentStatus, SessionStatus, SessionTableStatus
from app.models.payment import Payment
from app.models.session import Session as SessionModel
from app.models.table import Table, SessionTable


# ---------------------------------------------------------------------------
# Shared seed helpers
# ---------------------------------------------------------------------------

def _seed_active_session_and_table(db, code: str = "T1"):
    session = SessionModel(
        name="Test Session",
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


def _seed_open_bill(db, session_table_id: int, total: Decimal = Decimal("38.50")) -> Bill:
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


def _seed_paying_bill(db, session_table_id: int, total: Decimal = Decimal("38.50")) -> Bill:
    bill = _seed_open_bill(db, session_table_id, total)
    bill.status = BillStatus.paying
    bill.checkout_total = total
    db.commit()
    return bill


# ---------------------------------------------------------------------------
# Fix #1 — start-checkout returns checkout_total in response
# ---------------------------------------------------------------------------

class TestStartCheckoutCheckoutTotal:
    def test_start_checkout_response_contains_checkout_total(self, client, db_session):
        """start-checkout response must include checkout_total as a decimal string."""
        _, _, st = _seed_active_session_and_table(db_session)
        _seed_open_bill(db_session, st.id, Decimal("38.50"))

        resp = client.post("/api/v1/staff/table/T1/start-checkout")
        assert resp.status_code == 200
        body = resp.json()

        assert "checkout_total" in body, "Response must include checkout_total field"
        assert body["checkout_total"] == "38.50", (
            f"Expected '38.50', got {body['checkout_total']!r}"
        )

    def test_start_checkout_checkout_total_matches_bill_total(self, client, db_session):
        """checkout_total in response must equal the bill total at time of checkout."""
        _, _, st = _seed_active_session_and_table(db_session)
        _seed_open_bill(db_session, st.id, Decimal("100.00"))

        resp = client.post("/api/v1/staff/table/T1/start-checkout")
        assert resp.status_code == 200
        body = resp.json()

        assert body["checkout_total"] == "100.00"

    def test_start_checkout_existing_fields_still_present(self, client, db_session):
        """Existing response fields (success, bill_id, etc.) must still be present."""
        _, _, st = _seed_active_session_and_table(db_session)
        _seed_open_bill(db_session, st.id, Decimal("20.00"))

        resp = client.post("/api/v1/staff/table/T1/start-checkout")
        assert resp.status_code == 200
        body = resp.json()

        assert body["success"] is True
        assert body["table_code"] == "T1"
        assert "bill_id" in body
        assert body["bill_status"] == "paying"
        assert body["session_table_status"] == "paying"
        # New field
        assert body["checkout_total"] == "20.00"


# ---------------------------------------------------------------------------
# Fix #2 — cancel-checkout endpoint
# ---------------------------------------------------------------------------

class TestCancelCheckout:
    def test_cancel_checkout_paying_no_payment_succeeds(self, client, db_session):
        """paying bill with no Payment row → bill=open, table=occupied, success."""
        _, _, st = _seed_active_session_and_table(db_session)
        bill = _seed_paying_bill(db_session, st.id, Decimal("55.00"))

        resp = client.post("/api/v1/staff/table/T1/cancel-checkout")
        assert resp.status_code == 200
        body = resp.json()

        assert body["success"] is True
        assert body["table_code"] == "T1"
        assert body["bill_id"] == bill.id
        assert body["bill_status"] == "open"
        assert body["session_table_status"] == "occupied"

    def test_cancel_checkout_reverts_bill_status_in_db(self, client, db_session):
        """After cancel-checkout, DB must show bill.status=open and checkout_total=None."""
        _, _, st = _seed_active_session_and_table(db_session)
        bill = _seed_paying_bill(db_session, st.id, Decimal("55.00"))

        resp = client.post("/api/v1/staff/table/T1/cancel-checkout")
        assert resp.status_code == 200

        db_session.expire(bill)
        db_session.refresh(bill)
        assert bill.status == BillStatus.open
        assert bill.checkout_total is None

    def test_cancel_checkout_reverts_session_table_status_in_db(self, client, db_session):
        """After cancel-checkout, DB must show session_table.status=occupied."""
        _, _, st = _seed_active_session_and_table(db_session)
        _seed_paying_bill(db_session, st.id, Decimal("55.00"))

        resp = client.post("/api/v1/staff/table/T1/cancel-checkout")
        assert resp.status_code == 200

        db_session.expire(st)
        db_session.refresh(st)
        assert st.status == SessionTableStatus.occupied

    def test_cancel_checkout_with_payment_row_returns_409(self, client, db_session):
        """paying bill that already has a Payment row → 409 (charge may have gone through)."""
        from app.core.time import utcnow

        _, _, st = _seed_active_session_and_table(db_session)
        bill = _seed_paying_bill(db_session, st.id, Decimal("55.00"))

        # Seed a Payment row (simulates charge went through but callback failed)
        payment = Payment(
            bill_id=bill.id,
            provider="square",
            provider_payment_id="sq_ambiguous_123",
            amount=Decimal("55.00"),
            status=PaymentStatus.completed,
            paid_at=utcnow(),
        )
        db_session.add(payment)
        db_session.commit()

        resp = client.post("/api/v1/staff/table/T1/cancel-checkout")
        assert resp.status_code == 409
        detail = resp.json()["detail"].lower()
        assert "payment" in detail or "manual" in detail, (
            f"Detail should mention payment/manual, got: {detail!r}"
        )

    def test_cancel_checkout_open_bill_returns_409(self, client, db_session):
        """open bill (not yet in paying) → 409, bill must be in paying state first."""
        _, _, st = _seed_active_session_and_table(db_session)
        _seed_open_bill(db_session, st.id, Decimal("30.00"))

        resp = client.post("/api/v1/staff/table/T1/cancel-checkout")
        assert resp.status_code == 409
        detail = resp.json()["detail"].lower()
        assert "paying" in detail

    def test_cancel_checkout_paid_bill_returns_409(self, client, db_session):
        """paid bill → 409, cannot reopen a fully settled bill."""
        _, _, st = _seed_active_session_and_table(db_session)
        bill = _seed_open_bill(db_session, st.id, Decimal("30.00"))
        bill.status = BillStatus.paid
        db_session.commit()

        resp = client.post("/api/v1/staff/table/T1/cancel-checkout")
        assert resp.status_code == 409

    def test_cancel_checkout_does_not_create_payment_row(self, client, db_session):
        """cancel-checkout must NOT create any Payment rows."""
        _, _, st = _seed_active_session_and_table(db_session)
        bill = _seed_paying_bill(db_session, st.id, Decimal("55.00"))

        resp = client.post("/api/v1/staff/table/T1/cancel-checkout")
        assert resp.status_code == 200

        payments = db_session.execute(
            select(Payment).where(Payment.bill_id == bill.id)
        ).scalars().all()
        assert len(payments) == 0, "cancel-checkout must not create any Payment rows"

    def test_cancel_then_restart_checkout_works(self, client, db_session):
        """After cancel-checkout, start-checkout can be called again successfully."""
        _, _, st = _seed_active_session_and_table(db_session)
        _seed_paying_bill(db_session, st.id, Decimal("55.00"))

        # Cancel
        cancel_resp = client.post("/api/v1/staff/table/T1/cancel-checkout")
        assert cancel_resp.status_code == 200
        assert cancel_resp.json()["bill_status"] == "open"

        # Restart checkout
        start_resp = client.post("/api/v1/staff/table/T1/start-checkout")
        assert start_resp.status_code == 200
        body = start_resp.json()
        assert body["bill_status"] == "paying"
        assert body["checkout_total"] == "55.00"
