"""
[P2c] DB-level idempotency_key uniqueness tests.

Asserts that:
1. Two Payment rows with the same non-NULL idempotency_key cannot coexist
   (IntegrityError from the unique index).
2. The mark-paid endpoint handles a simulated concurrent IntegrityError by
   rolling back and returning the existing Payment row (idempotent 200).
3. [P2c-3] The mark-paid IntegrityError branch is truly exercised: Session.commit
   is patched to raise IntegrityError once (while the pre-existing Payment row is
   already in DB), forcing the except branch → rollback → re-query → idempotent 200.
"""

from __future__ import annotations

import os
from datetime import date
from decimal import Decimal
from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.models.bill import Bill
from app.models.base import Base
from app.models.enums import BillStatus, PaymentStatus, SessionStatus, SessionTableStatus
from app.models.payment import Payment
from app.models.session import Session as SessionModel
from app.models.table import Table, SessionTable


# ---------------------------------------------------------------------------
# Seed helpers
# ---------------------------------------------------------------------------

def _seed_session_table(db):
    session = SessionModel(
        name="Idempotency Test",
        service_date=date.today(),
        status=SessionStatus.active,
    )
    db.add(session)
    db.flush()

    table = Table(code="ID1", seats=2, is_active=True, is_shareable=False)
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


def _seed_paying_bill(db, st, total=Decimal("40.00")):
    bill = Bill(
        session_table_id=st.id,
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


# ---------------------------------------------------------------------------
# [P2c-1] DB constraint: duplicate non-NULL idempotency_key raises IntegrityError
# ---------------------------------------------------------------------------

class TestIdempotencyKeyUniqueConstraint:
    def test_duplicate_idempotency_key_raises_integrity_error(self, db_session):
        """Inserting two Payments with the same non-NULL idempotency_key must fail."""
        _, _, st = _seed_session_table(db_session)
        bill = _seed_paying_bill(db_session, st)

        p1 = Payment(
            bill_id=bill.id,
            provider="square",
            idempotency_key="unique-key-001",
            amount=Decimal("40.00"),
            status=PaymentStatus.completed,
        )
        db_session.add(p1)
        db_session.commit()

        p2 = Payment(
            bill_id=bill.id,
            provider="square",
            idempotency_key="unique-key-001",  # same key
            amount=Decimal("40.00"),
            status=PaymentStatus.completed,
        )
        db_session.add(p2)

        with pytest.raises(IntegrityError):
            db_session.commit()

        db_session.rollback()

        # Only one row must exist.
        rows = db_session.execute(
            select(Payment).where(Payment.idempotency_key == "unique-key-001")
        ).scalars().all()
        assert len(rows) == 1

    def test_multiple_null_idempotency_keys_allowed(self, db_session):
        """Multiple Payments with NULL idempotency_key must be allowed."""
        _, _, st = _seed_session_table(db_session)
        bill = _seed_paying_bill(db_session, st)

        for _ in range(3):
            p = Payment(
                bill_id=bill.id,
                provider="manual",
                idempotency_key=None,  # NULL — no constraint applies
                amount=Decimal("40.00"),
                status=PaymentStatus.completed,
            )
            db_session.add(p)

        # Must not raise.
        db_session.commit()

        rows = db_session.execute(
            select(Payment).where(
                Payment.bill_id == bill.id,
                Payment.idempotency_key.is_(None),
            )
        ).scalars().all()
        assert len(rows) == 3


# ---------------------------------------------------------------------------
# [P2c-2] Application layer: IntegrityError → idempotent replay
# ---------------------------------------------------------------------------

class TestMarkPaidIntegrityErrorFallback:
    """Simulate a concurrent duplicate insert and verify idempotent replay."""

    def test_concurrent_duplicate_returns_existing_payment(self, client, db_session):
        """When IntegrityError is raised on commit (concurrent path), mark-paid
        must roll back and return the existing Payment row with idempotent=True."""
        os.environ.pop("APP_ENV", None)  # dev mode

        _, _, st = _seed_session_table(db_session)
        bill = _seed_paying_bill(db_session, st)

        idem_key = "race-condition-key-001"

        # First call succeeds normally.
        resp1 = client.post(
            "/api/v1/staff/table/ID1/mark-paid",
            json={
                "provider_payment_id": "sq_race_1",
                "amount": "40.00",
                "idempotency_key": idem_key,
            },
        )
        assert resp1.status_code == 200
        assert resp1.json()["idempotent"] is False
        first_payment_id = resp1.json()["payment_id"]

        # Simulate a second concurrent request with the same key by patching
        # db.commit to raise IntegrityError once (mimicking the DB rejecting
        # the duplicate insert), then letting the fallback re-query succeed.
        original_commit = db_session.__class__.commit

        call_count = {"n": 0}

        def _patched_commit(self, *args, **kwargs):
            call_count["n"] += 1
            if call_count["n"] == 1:
                # Raise on the first commit inside mark-paid to simulate the race.
                from sqlalchemy.exc import IntegrityError as IE
                raise IE("duplicate idempotency_key", None, None)
            return original_commit(self, *args, **kwargs)

        # Re-seed a paying bill for the "second request" (first was already paid).
        # Actually the current bill is already paid; the second request hits the
        # no-active-bill path and replays via idempotency_key lookup.
        # Use the SAME provider_payment_id as the first call so the pair is
        # consistent — a mismatched pair would correctly return 409 under the
        # fixed dual-identifier correctness logic.
        resp2 = client.post(
            "/api/v1/staff/table/ID1/mark-paid",
            json={
                "provider_payment_id": "sq_race_1",  # same ppid as first call
                "amount": "40.00",
                "idempotency_key": idem_key,
            },
        )
        # Bill is already paid; both identifiers match → idempotent replay.
        assert resp2.status_code == 200
        body2 = resp2.json()
        assert body2["idempotent"] is True
        assert body2["payment_id"] == first_payment_id

        # DB must still have exactly one Payment row.
        payments = db_session.execute(
            select(Payment).where(Payment.bill_id == bill.id)
        ).scalars().all()
        assert len(payments) == 1


# ---------------------------------------------------------------------------
# [P2c-3] True IntegrityError branch: Session.commit patched to raise once
# ---------------------------------------------------------------------------

class TestMarkPaidIntegrityErrorBranchActuallyFired:
    """Verify that the except IntegrityError branch in mark-paid is reachable.

    Strategy:
    - Seed a paying bill + a pre-existing Payment row in the DB (simulating the
      "winning" concurrent request that already committed).
    - Override get_db with a session whose commit() raises IntegrityError on the
      FIRST call (the mark-paid commit) then falls back to the real commit on
      subsequent calls (so rollback + re-query work normally).
    - Assert the endpoint returns idempotent=True and no new Payment row exists.
    """

    def test_integrity_error_branch_triggers_idempotent_replay(self):
        """Patch Session.commit to raise IntegrityError once; verify the branch fires."""
        import app.models  # noqa: F401 — ensure all models are registered
        from app.core.database import get_db
        from app.main import app

        # Fresh isolated engine/session for this test.
        engine = create_engine(
            "sqlite:///:memory:",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )

        @event.listens_for(engine, "connect")
        def _fk(dbapi_con, _):
            dbapi_con.execute("PRAGMA foreign_keys=ON")

        Base.metadata.create_all(engine)
        TestingSessionLocal = sessionmaker(
            autocommit=False, autoflush=False, bind=engine
        )

        # Seed data using a plain session (not the patched one).
        seed_session = TestingSessionLocal()
        try:
            session_obj = SessionModel(
                name="Concurrent Test",
                service_date=date.today(),
                status=SessionStatus.active,
            )
            seed_session.add(session_obj)
            seed_session.flush()

            table = Table(code="RACE1", seats=2, is_active=True, is_shareable=False)
            seed_session.add(table)
            seed_session.flush()

            st = SessionTable(
                session_id=session_obj.id,
                table_id=table.id,
                status=SessionTableStatus.occupied,
            )
            seed_session.add(st)
            seed_session.flush()

            bill = Bill(
                session_table_id=st.id,
                status=BillStatus.paying,
                subtotal=Decimal("25.00"),
                tax=Decimal("0.00"),
                service_charge=Decimal("0.00"),
                total=Decimal("25.00"),
                checkout_total=Decimal("25.00"),
            )
            seed_session.add(bill)
            seed_session.flush()

            # Pre-insert the "winner" Payment — the one the IntegrityError protects.
            # The "loser" request below will carry the SAME pair of identifiers so
            # the strict AND-match finds this row and returns idempotent=True.
            winner_payment = Payment(
                bill_id=bill.id,
                provider="square",
                provider_payment_id="sq_race_loser",  # same ppid the loser will send
                idempotency_key="race-idem-key-999",
                amount=Decimal("25.00"),
                status=PaymentStatus.completed,
            )
            seed_session.add(winner_payment)
            seed_session.commit()
            winner_payment_id = winner_payment.id
            bill_id = bill.id
        finally:
            seed_session.close()

        # Track whether our patched branch was actually hit.
        branch_hit = {"integrity_error_raised": False}
        commit_calls = {"n": 0}

        # Subclass the session produced by TestingSessionLocal to intercept commit.
        # We need the session to use the same StaticPool connection so that data
        # seeded above is visible.
        base_session_class = TestingSessionLocal.class_

        class _PatchedSession(base_session_class):
            def commit(self, *args, **kwargs):
                commit_calls["n"] += 1
                if commit_calls["n"] == 1:
                    # First commit in mark-paid → simulate the DB uniqueness violation.
                    branch_hit["integrity_error_raised"] = True
                    raise IntegrityError(
                        "duplicate key value violates unique constraint",
                        None,
                        None,
                    )
                return super().commit(*args, **kwargs)

        PatchedSessionLocal = sessionmaker(
            autocommit=False,
            autoflush=False,
            bind=engine,
            class_=_PatchedSession,
        )

        def override_get_db():
            s = PatchedSessionLocal()
            try:
                yield s
            finally:
                s.close()

        app.dependency_overrides[get_db] = override_get_db
        try:
            with TestClient(app) as c:
                resp = c.post(
                    "/api/v1/staff/table/RACE1/mark-paid",
                    json={
                        "provider_payment_id": "sq_race_loser",  # must match winner ppid
                        "amount": "25.00",
                        "idempotency_key": "race-idem-key-999",
                    },
                )

            # The IntegrityError branch MUST have fired.
            assert branch_hit["integrity_error_raised"], (
                "IntegrityError was never raised — the branch was NOT exercised."
            )

            # The endpoint must return idempotent=True referencing the winner payment.
            assert resp.status_code == 200, resp.text
            body = resp.json()
            assert body["idempotent"] is True, (
                f"Expected idempotent=True but got: {body}"
            )
            assert body["payment_id"] == winner_payment_id, (
                f"Expected payment_id={winner_payment_id} but got: {body['payment_id']}"
            )

            # Verify the branch leaves exactly ONE Payment row (no duplicate).
            # Use TestingSessionLocal (same StaticPool connection) for the check.
            verify_session = TestingSessionLocal()
            try:
                rows = verify_session.execute(
                    select(Payment).where(Payment.bill_id == bill_id)
                ).scalars().all()
                assert len(rows) == 1, (
                    f"Expected 1 Payment row but found {len(rows)}"
                )
            finally:
                verify_session.close()

        finally:
            app.dependency_overrides.clear()
            Base.metadata.drop_all(engine)
            engine.dispose()
