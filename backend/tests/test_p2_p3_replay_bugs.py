"""
Tests for two payment replay correctness bugs:

[P2] Late replay after table reuse: when a table is reused (bill A paid, then
bill B opened/paid), replaying bill-A's identifiers must return 200 idempotent
for bill A — NOT 404 caused by limiting the search to most_recent_paid_bill.

[P3] Replay amount mismatch: a replay request that carries a different `amount`
than the original payment must be rejected with 409, not silently returned as
a 200 with the original (unchanged) DB value.
"""
from __future__ import annotations

import os
from datetime import date
from decimal import Decimal

import pytest
from sqlalchemy import select

from app.models.bill import Bill
from app.models.enums import (
    BillStatus,
    PaymentStatus,
    SessionStatus,
    SessionTableStatus,
)
from app.models.payment import Payment
from app.models.session import Session as SessionModel
from app.models.table import SessionTable, Table


# ---------------------------------------------------------------------------
# Seed helpers
# ---------------------------------------------------------------------------


def _seed_session_table(db, code="ZZ1") -> tuple[SessionModel, Table, SessionTable]:
    session = SessionModel(
        name="Replay Bug Test",
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
    db.commit()
    return session, table, st


def _seed_paying_bill(
    db, session_table_id: int, total: Decimal = Decimal("50.00")
) -> Bill:
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


# ===========================================================================
# [P2] Late replay after table reuse
# ===========================================================================


class TestLateReplayAfterTableReuse:
    """Bill A paid, table reused (bill B paid). Replaying bill A identifiers must
    return 200 idempotent pointing at bill A's Payment — not 404."""

    def test_replay_bill_a_after_bill_b_paid_returns_200(self, client, db_session):
        """Table T has bill A paid, then bill B paid. Replaying A's identifiers → 200."""
        os.environ.pop("APP_ENV", None)
        _, _, st = _seed_session_table(db_session, code="REUSE1")

        # --- Pay bill A ---
        bill_a = _seed_paying_bill(db_session, st.id, Decimal("30.00"))
        r_a = client.post(
            "/api/v1/staff/table/REUSE1/mark-paid",
            json={
                "provider_payment_id": "sq_bill_a",
                "idempotency_key": "idem_bill_a",
                "amount": "30.00",
            },
        )
        assert r_a.status_code == 200, r_a.json()
        assert r_a.json()["idempotent"] is False
        bill_a_payment_id = r_a.json()["payment_id"]
        assert r_a.json()["bill_id"] == bill_a.id

        # --- Reopen table and pay bill B (simulating table reuse) ---
        # Re-open the session_table so mark-paid for bill B works.
        db_session.refresh(st)
        st.status = SessionTableStatus.occupied
        db_session.commit()

        bill_b = _seed_paying_bill(db_session, st.id, Decimal("45.00"))
        r_b = client.post(
            "/api/v1/staff/table/REUSE1/mark-paid",
            json={
                "provider_payment_id": "sq_bill_b",
                "idempotency_key": "idem_bill_b",
                "amount": "45.00",
            },
        )
        assert r_b.status_code == 200, r_b.json()
        assert r_b.json()["idempotent"] is False
        assert r_b.json()["bill_id"] == bill_b.id

        # --- Late replay of bill A (table currently has no open bill) ---
        r_replay = client.post(
            "/api/v1/staff/table/REUSE1/mark-paid",
            json={
                "provider_payment_id": "sq_bill_a",
                "idempotency_key": "idem_bill_a",
            },
        )
        # Must be 200 idempotent, pointing at bill A's payment — not 404.
        assert r_replay.status_code == 200, r_replay.json()
        body = r_replay.json()
        assert body["idempotent"] is True, f"Expected idempotent=True: {body}"
        assert body["payment_id"] == bill_a_payment_id, (
            f"Expected bill-A's payment_id={bill_a_payment_id}, got {body['payment_id']}"
        )
        assert body["bill_id"] == bill_a.id, (
            f"Expected bill_id={bill_a.id} (bill A), got {body['bill_id']}"
        )

    def test_replay_by_ppid_only_after_table_reuse(self, client, db_session):
        """Single-identifier replay (ppid only) also works after table reuse."""
        os.environ.pop("APP_ENV", None)
        _, _, st = _seed_session_table(db_session, code="REUSE2")

        bill_a = _seed_paying_bill(db_session, st.id, Decimal("20.00"))
        r_a = client.post(
            "/api/v1/staff/table/REUSE2/mark-paid",
            json={"provider_payment_id": "sq_reuse2_a", "amount": "20.00"},
        )
        assert r_a.status_code == 200
        bill_a_payment_id = r_a.json()["payment_id"]

        # Reuse table.
        db_session.refresh(st)
        st.status = SessionTableStatus.occupied
        db_session.commit()

        bill_b = _seed_paying_bill(db_session, st.id, Decimal("35.00"))
        r_b = client.post(
            "/api/v1/staff/table/REUSE2/mark-paid",
            json={"provider_payment_id": "sq_reuse2_b", "amount": "35.00"},
        )
        assert r_b.status_code == 200

        # Late replay with ppid from bill A.
        r_replay = client.post(
            "/api/v1/staff/table/REUSE2/mark-paid",
            json={"provider_payment_id": "sq_reuse2_a"},
        )
        assert r_replay.status_code == 200, r_replay.json()
        body = r_replay.json()
        assert body["idempotent"] is True
        assert body["payment_id"] == bill_a_payment_id
        assert body["bill_id"] == bill_a.id

    def test_unknown_identifier_after_table_reuse_is_404(self, client, db_session):
        """An identifier that never matched any payment on this table → 404."""
        os.environ.pop("APP_ENV", None)
        _, _, st = _seed_session_table(db_session, code="REUSE3")

        bill_a = _seed_paying_bill(db_session, st.id, Decimal("15.00"))
        client.post(
            "/api/v1/staff/table/REUSE3/mark-paid",
            json={"provider_payment_id": "sq_reuse3_a", "amount": "15.00"},
        )

        # No open bill exists; completely unknown identifier.
        r = client.post(
            "/api/v1/staff/table/REUSE3/mark-paid",
            json={"provider_payment_id": "sq_completely_unknown"},
        )
        assert r.status_code == 404, r.json()


# ===========================================================================
# [P3] Replay with mismatched amount → 409
# ===========================================================================


class TestReplayAmountMismatch:
    """Replay requests that supply an amount different from the original payment
    must be rejected with 409, not silently returned as 200."""

    def test_dual_identifier_replay_different_amount_returns_409(
        self, client, db_session
    ):
        """Both identifiers match existing payment; amount differs → 409."""
        os.environ.pop("APP_ENV", None)
        _, _, st = _seed_session_table(db_session, code="AMT1")
        bill = _seed_paying_bill(db_session, st.id, Decimal("50.00"))

        r1 = client.post(
            "/api/v1/staff/table/AMT1/mark-paid",
            json={
                "idempotency_key": "idem_amt1",
                "provider_payment_id": "sq_amt1",
                "amount": "50.00",
            },
        )
        assert r1.status_code == 200
        assert r1.json()["idempotent"] is False

        # Replay with DIFFERENT amount.
        r2 = client.post(
            "/api/v1/staff/table/AMT1/mark-paid",
            json={
                "idempotency_key": "idem_amt1",
                "provider_payment_id": "sq_amt1",
                "amount": "999.00",  # wrong amount
            },
        )
        assert r2.status_code == 409, r2.json()
        assert "amount" in r2.json()["detail"].lower()

        # DB must still have exactly one Payment row with the original amount.
        payments = db_session.execute(
            select(Payment).where(Payment.bill_id == bill.id)
        ).scalars().all()
        assert len(payments) == 1
        assert payments[0].amount == Decimal("50.00")

    def test_single_ppid_replay_different_amount_returns_409(
        self, client, db_session
    ):
        """Single-identifier (ppid only) replay with mismatched amount → 409."""
        os.environ.pop("APP_ENV", None)
        _, _, st = _seed_session_table(db_session, code="AMT2")
        bill = _seed_paying_bill(db_session, st.id, Decimal("40.00"))

        r1 = client.post(
            "/api/v1/staff/table/AMT2/mark-paid",
            json={"provider_payment_id": "sq_amt2", "amount": "40.00"},
        )
        assert r1.status_code == 200

        # Replay with wrong amount.
        r2 = client.post(
            "/api/v1/staff/table/AMT2/mark-paid",
            json={"provider_payment_id": "sq_amt2", "amount": "1.00"},
        )
        assert r2.status_code == 409, r2.json()
        assert "amount" in r2.json()["detail"].lower()

        payments = db_session.execute(
            select(Payment).where(Payment.bill_id == bill.id)
        ).scalars().all()
        assert len(payments) == 1
        assert payments[0].amount == Decimal("40.00")

    def test_single_idem_key_replay_different_amount_returns_409(
        self, client, db_session
    ):
        """Single-identifier (idem_key only) replay with mismatched amount → 409."""
        os.environ.pop("APP_ENV", None)
        _, _, st = _seed_session_table(db_session, code="AMT3")
        bill = _seed_paying_bill(db_session, st.id, Decimal("60.00"))

        r1 = client.post(
            "/api/v1/staff/table/AMT3/mark-paid",
            json={"idempotency_key": "idem_amt3", "amount": "60.00"},
        )
        assert r1.status_code == 200

        # Replay with wrong amount.
        r2 = client.post(
            "/api/v1/staff/table/AMT3/mark-paid",
            json={"idempotency_key": "idem_amt3", "amount": "999.99"},
        )
        assert r2.status_code == 409, r2.json()
        assert "amount" in r2.json()["detail"].lower()

        payments = db_session.execute(
            select(Payment).where(Payment.bill_id == bill.id)
        ).scalars().all()
        assert len(payments) == 1
        assert payments[0].amount == Decimal("60.00")

    def test_replay_consistent_amount_returns_200(self, client, db_session):
        """Replay with the SAME amount as the original payment → 200 idempotent (not 409)."""
        os.environ.pop("APP_ENV", None)
        _, _, st = _seed_session_table(db_session, code="AMT4")
        _seed_paying_bill(db_session, st.id, Decimal("70.00"))

        r1 = client.post(
            "/api/v1/staff/table/AMT4/mark-paid",
            json={
                "idempotency_key": "idem_amt4",
                "provider_payment_id": "sq_amt4",
                "amount": "70.00",
            },
        )
        assert r1.status_code == 200
        original_payment_id = r1.json()["payment_id"]

        # Replay with SAME amount → must succeed.
        r2 = client.post(
            "/api/v1/staff/table/AMT4/mark-paid",
            json={
                "idempotency_key": "idem_amt4",
                "provider_payment_id": "sq_amt4",
                "amount": "70.00",
            },
        )
        assert r2.status_code == 200, r2.json()
        body2 = r2.json()
        assert body2["idempotent"] is True
        assert body2["payment_id"] == original_payment_id

    def test_replay_without_amount_returns_200(self, client, db_session):
        """Replay that omits amount entirely → 200 idempotent (amount check skipped)."""
        os.environ.pop("APP_ENV", None)
        _, _, st = _seed_session_table(db_session, code="AMT5")
        _seed_paying_bill(db_session, st.id, Decimal("80.00"))

        r1 = client.post(
            "/api/v1/staff/table/AMT5/mark-paid",
            json={
                "idempotency_key": "idem_amt5",
                "provider_payment_id": "sq_amt5",
                "amount": "80.00",
            },
        )
        assert r1.status_code == 200
        original_payment_id = r1.json()["payment_id"]

        # Replay with NO amount → must succeed (no check to fail).
        r2 = client.post(
            "/api/v1/staff/table/AMT5/mark-paid",
            json={
                "idempotency_key": "idem_amt5",
                "provider_payment_id": "sq_amt5",
                # no amount field
            },
        )
        assert r2.status_code == 200, r2.json()
        body2 = r2.json()
        assert body2["idempotent"] is True
        assert body2["payment_id"] == original_payment_id

    def test_late_replay_after_reuse_different_amount_returns_409(
        self, client, db_session
    ):
        """Late replay (after table reuse) with wrong amount → 409."""
        os.environ.pop("APP_ENV", None)
        _, _, st = _seed_session_table(db_session, code="AMT6")

        bill_a = _seed_paying_bill(db_session, st.id, Decimal("25.00"))
        r_a = client.post(
            "/api/v1/staff/table/AMT6/mark-paid",
            json={
                "provider_payment_id": "sq_amt6_a",
                "idempotency_key": "idem_amt6_a",
                "amount": "25.00",
            },
        )
        assert r_a.status_code == 200

        # Reuse table, pay bill B.
        db_session.refresh(st)
        st.status = SessionTableStatus.occupied
        db_session.commit()

        _seed_paying_bill(db_session, st.id, Decimal("35.00"))
        client.post(
            "/api/v1/staff/table/AMT6/mark-paid",
            json={
                "provider_payment_id": "sq_amt6_b",
                "idempotency_key": "idem_amt6_b",
                "amount": "35.00",
            },
        )

        # Late replay of bill A with wrong amount.
        r_replay = client.post(
            "/api/v1/staff/table/AMT6/mark-paid",
            json={
                "provider_payment_id": "sq_amt6_a",
                "idempotency_key": "idem_amt6_a",
                "amount": "999.00",  # wrong
            },
        )
        assert r_replay.status_code == 409, r_replay.json()
        assert "amount" in r_replay.json()["detail"].lower()
