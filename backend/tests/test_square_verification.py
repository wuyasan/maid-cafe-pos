"""
Tests for the Square server-side payment verification seam.

All Square HTTP calls are mocked via monkeypatching httpx.Client so that
tests never reach the real Square API.

Behaviour matrix:
  ┌──────────────────────┬────────────────────────────────────────────┐
  │ Scenario             │ Expected outcome                           │
  ├──────────────────────┼────────────────────────────────────────────┤
  │ Not configured       │ {configured: False}; mark-paid succeeds    │
  │ Configured + valid   │ Bill closed, Payment row created           │
  │ Configured + wrong   │ 402, no Payment row, bill still paying     │
  │   status             │                                            │
  │ Configured + wrong   │ 402, no Payment row                        │
  │   amount             │                                            │
  │ Configured + wrong   │ 402, no Payment row                        │
  │   location           │                                            │
  │ Network error        │ 402, no Payment row                        │
  │ Manual override      │ Always succeeds; no Square call made       │
  └──────────────────────┴────────────────────────────────────────────┘
"""

from __future__ import annotations

import os
from datetime import date
from decimal import Decimal
from unittest.mock import MagicMock, patch

import pytest
from sqlalchemy import select

from app.models.bill import Bill
from app.models.enums import BillStatus, SessionStatus, SessionTableStatus
from app.models.payment import Payment
from app.models.session import Session as SessionModel
from app.models.table import Table, SessionTable


# ---------------------------------------------------------------------------
# Helpers (mirror style used in test_phase3_payment_hardening.py)
# ---------------------------------------------------------------------------

def _seed(db) -> tuple[SessionModel, Table, SessionTable]:
    session = SessionModel(
        name="SQ Test Session",
        service_date=date.today(),
        status=SessionStatus.active,
    )
    db.add(session)
    db.flush()

    table = Table(code="SQ1", seats=2, is_active=True, is_shareable=False)
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
    db, st_id: int, total: Decimal = Decimal("50.00")
) -> Bill:
    bill = Bill(
        session_table_id=st_id,
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
# Helper: build a fake httpx.Response
# ---------------------------------------------------------------------------

def _mock_httpx_response(status_code: int, body: dict) -> MagicMock:
    """Return a MagicMock that quacks like an httpx.Response."""
    mock_resp = MagicMock()
    mock_resp.status_code = status_code
    mock_resp.json.return_value = body
    return mock_resp


# ---------------------------------------------------------------------------
# Unit tests for verify_square_payment directly
# ---------------------------------------------------------------------------

class TestVerifySquarePaymentUnit:
    """Direct unit tests of the verify_square_payment helper."""

    def test_not_configured_when_no_env_vars(self, monkeypatch):
        monkeypatch.delenv("SQUARE_ACCESS_TOKEN", raising=False)
        monkeypatch.delenv("SQUARE_LOCATION_ID", raising=False)

        from app.services.square_verification import verify_square_payment

        result = verify_square_payment("sq_test_abc", 5000)
        assert result == {"configured": False}

    def test_not_configured_when_only_token_set(self, monkeypatch):
        monkeypatch.setenv("SQUARE_ACCESS_TOKEN", "tok_xxx")
        monkeypatch.delenv("SQUARE_LOCATION_ID", raising=False)

        from app.services.square_verification import verify_square_payment

        result = verify_square_payment("sq_test_abc", 5000)
        assert result == {"configured": False}

    def test_not_configured_when_only_location_set(self, monkeypatch):
        monkeypatch.delenv("SQUARE_ACCESS_TOKEN", raising=False)
        monkeypatch.setenv("SQUARE_LOCATION_ID", "LOC_xxx")

        from app.services.square_verification import verify_square_payment

        result = verify_square_payment("sq_test_abc", 5000)
        assert result == {"configured": False}

    def test_valid_payment(self, monkeypatch):
        monkeypatch.setenv("SQUARE_ACCESS_TOKEN", "tok_xxx")
        monkeypatch.setenv("SQUARE_LOCATION_ID", "LOC_main")
        monkeypatch.setenv("SQUARE_API_BASE", "https://mock.square.example")

        good_body = {
            "payment": {
                "status": "COMPLETED",
                "amount_money": {"amount": 5000, "currency": "USD"},
                "location_id": "LOC_main",
            }
        }

        mock_resp = _mock_httpx_response(200, good_body)
        mock_client = MagicMock()
        mock_client.__enter__ = MagicMock(return_value=mock_client)
        mock_client.__exit__ = MagicMock(return_value=False)
        mock_client.get.return_value = mock_resp

        from app.services import square_verification

        with patch.object(square_verification.httpx, "Client", return_value=mock_client):
            result = square_verification.verify_square_payment("sq_test_abc", 5000)

        assert result["configured"] is True
        assert result["valid"] is True
        assert result["reason"] == "ok"

    def test_wrong_status(self, monkeypatch):
        monkeypatch.setenv("SQUARE_ACCESS_TOKEN", "tok_xxx")
        monkeypatch.setenv("SQUARE_LOCATION_ID", "LOC_main")
        monkeypatch.setenv("SQUARE_API_BASE", "https://mock.square.example")

        bad_body = {
            "payment": {
                "status": "PENDING",
                "amount_money": {"amount": 5000, "currency": "USD"},
                "location_id": "LOC_main",
            }
        }

        mock_resp = _mock_httpx_response(200, bad_body)
        mock_client = MagicMock()
        mock_client.__enter__ = MagicMock(return_value=mock_client)
        mock_client.__exit__ = MagicMock(return_value=False)
        mock_client.get.return_value = mock_resp

        from app.services import square_verification

        with patch.object(square_verification.httpx, "Client", return_value=mock_client):
            result = square_verification.verify_square_payment("sq_test_abc", 5000)

        assert result["configured"] is True
        assert result["valid"] is False
        assert "PENDING" in result["reason"]

    def test_wrong_amount(self, monkeypatch):
        monkeypatch.setenv("SQUARE_ACCESS_TOKEN", "tok_xxx")
        monkeypatch.setenv("SQUARE_LOCATION_ID", "LOC_main")
        monkeypatch.setenv("SQUARE_API_BASE", "https://mock.square.example")

        bad_body = {
            "payment": {
                "status": "COMPLETED",
                "amount_money": {"amount": 1000, "currency": "USD"},  # wrong
                "location_id": "LOC_main",
            }
        }

        mock_resp = _mock_httpx_response(200, bad_body)
        mock_client = MagicMock()
        mock_client.__enter__ = MagicMock(return_value=mock_client)
        mock_client.__exit__ = MagicMock(return_value=False)
        mock_client.get.return_value = mock_resp

        from app.services import square_verification

        with patch.object(square_verification.httpx, "Client", return_value=mock_client):
            result = square_verification.verify_square_payment("sq_test_abc", 5000)

        assert result["configured"] is True
        assert result["valid"] is False
        assert "1000" in result["reason"]

    def test_wrong_location(self, monkeypatch):
        monkeypatch.setenv("SQUARE_ACCESS_TOKEN", "tok_xxx")
        monkeypatch.setenv("SQUARE_LOCATION_ID", "LOC_main")
        monkeypatch.setenv("SQUARE_API_BASE", "https://mock.square.example")

        bad_body = {
            "payment": {
                "status": "COMPLETED",
                "amount_money": {"amount": 5000, "currency": "USD"},
                "location_id": "LOC_other",  # wrong
            }
        }

        mock_resp = _mock_httpx_response(200, bad_body)
        mock_client = MagicMock()
        mock_client.__enter__ = MagicMock(return_value=mock_client)
        mock_client.__exit__ = MagicMock(return_value=False)
        mock_client.get.return_value = mock_resp

        from app.services import square_verification

        with patch.object(square_verification.httpx, "Client", return_value=mock_client):
            result = square_verification.verify_square_payment("sq_test_abc", 5000)

        assert result["configured"] is True
        assert result["valid"] is False
        assert "LOC_other" in result["reason"]

    def test_square_http_non_200(self, monkeypatch):
        monkeypatch.setenv("SQUARE_ACCESS_TOKEN", "tok_xxx")
        monkeypatch.setenv("SQUARE_LOCATION_ID", "LOC_main")
        monkeypatch.setenv("SQUARE_API_BASE", "https://mock.square.example")

        mock_resp = _mock_httpx_response(404, {"errors": [{"code": "NOT_FOUND"}]})
        mock_client = MagicMock()
        mock_client.__enter__ = MagicMock(return_value=mock_client)
        mock_client.__exit__ = MagicMock(return_value=False)
        mock_client.get.return_value = mock_resp

        from app.services import square_verification

        with patch.object(square_verification.httpx, "Client", return_value=mock_client):
            result = square_verification.verify_square_payment("sq_test_abc", 5000)

        assert result["configured"] is True
        assert result["valid"] is False
        assert "404" in result["reason"]

    def test_network_error(self, monkeypatch):
        monkeypatch.setenv("SQUARE_ACCESS_TOKEN", "tok_xxx")
        monkeypatch.setenv("SQUARE_LOCATION_ID", "LOC_main")
        monkeypatch.setenv("SQUARE_API_BASE", "https://mock.square.example")

        mock_client = MagicMock()
        mock_client.__enter__ = MagicMock(return_value=mock_client)
        mock_client.__exit__ = MagicMock(return_value=False)
        mock_client.get.side_effect = Exception("Connection refused")

        from app.services import square_verification

        with patch.object(square_verification.httpx, "Client", return_value=mock_client):
            result = square_verification.verify_square_payment("sq_test_abc", 5000)

        assert result["configured"] is True
        assert result["valid"] is False
        assert "Connection refused" in result["reason"]

    # --- P3b: currency validation ---

    def test_matching_currency_default_usd_is_valid(self, monkeypatch):
        """When currency matches default USD the payment is valid."""
        monkeypatch.setenv("SQUARE_ACCESS_TOKEN", "tok_xxx")
        monkeypatch.setenv("SQUARE_LOCATION_ID", "LOC_main")
        monkeypatch.setenv("SQUARE_API_BASE", "https://mock.square.example")
        monkeypatch.delenv("SQUARE_CURRENCY", raising=False)  # default = USD

        good_body = {
            "payment": {
                "status": "COMPLETED",
                "amount_money": {"amount": 5000, "currency": "USD"},
                "location_id": "LOC_main",
            }
        }

        mock_resp = _mock_httpx_response(200, good_body)
        mock_client = MagicMock()
        mock_client.__enter__ = MagicMock(return_value=mock_client)
        mock_client.__exit__ = MagicMock(return_value=False)
        mock_client.get.return_value = mock_resp

        from app.services import square_verification

        with patch.object(square_verification.httpx, "Client", return_value=mock_client):
            result = square_verification.verify_square_payment("sq_test_abc", 5000)

        assert result["configured"] is True
        assert result["valid"] is True
        assert result["reason"] == "ok"

    def test_wrong_currency_returns_invalid(self, monkeypatch):
        """When currency does not match expected, payment is invalid."""
        monkeypatch.setenv("SQUARE_ACCESS_TOKEN", "tok_xxx")
        monkeypatch.setenv("SQUARE_LOCATION_ID", "LOC_main")
        monkeypatch.setenv("SQUARE_API_BASE", "https://mock.square.example")
        monkeypatch.setenv("SQUARE_CURRENCY", "USD")

        bad_body = {
            "payment": {
                "status": "COMPLETED",
                "amount_money": {"amount": 5000, "currency": "CAD"},  # wrong currency
                "location_id": "LOC_main",
            }
        }

        mock_resp = _mock_httpx_response(200, bad_body)
        mock_client = MagicMock()
        mock_client.__enter__ = MagicMock(return_value=mock_client)
        mock_client.__exit__ = MagicMock(return_value=False)
        mock_client.get.return_value = mock_resp

        from app.services import square_verification

        with patch.object(square_verification.httpx, "Client", return_value=mock_client):
            result = square_verification.verify_square_payment("sq_test_abc", 5000)

        assert result["configured"] is True
        assert result["valid"] is False
        assert "CAD" in result["reason"]
        assert "USD" in result["reason"]

    def test_custom_currency_env_matches(self, monkeypatch):
        """SQUARE_CURRENCY env var overrides the default; matching currency is valid."""
        monkeypatch.setenv("SQUARE_ACCESS_TOKEN", "tok_xxx")
        monkeypatch.setenv("SQUARE_LOCATION_ID", "LOC_main")
        monkeypatch.setenv("SQUARE_API_BASE", "https://mock.square.example")
        monkeypatch.setenv("SQUARE_CURRENCY", "JPY")

        good_body = {
            "payment": {
                "status": "COMPLETED",
                "amount_money": {"amount": 5000, "currency": "JPY"},
                "location_id": "LOC_main",
            }
        }

        mock_resp = _mock_httpx_response(200, good_body)
        mock_client = MagicMock()
        mock_client.__enter__ = MagicMock(return_value=mock_client)
        mock_client.__exit__ = MagicMock(return_value=False)
        mock_client.get.return_value = mock_resp

        from app.services import square_verification

        with patch.object(square_verification.httpx, "Client", return_value=mock_client):
            result = square_verification.verify_square_payment("sq_test_abc", 5000)

        assert result["configured"] is True
        assert result["valid"] is True
        assert result["reason"] == "ok"


# ---------------------------------------------------------------------------
# Integration tests: verify_square_payment wired into mark-paid endpoint
# ---------------------------------------------------------------------------

def _patch_verify(monkeypatch, return_value: dict):
    """Monkeypatch verify_square_payment in the endpoint module."""
    monkeypatch.setattr(
        "app.api.v1.endpoints.staff_checkout.verify_square_payment",
        lambda pid, cents: return_value,
    )


class TestMarkPaidSquareVerificationIntegration:
    """mark-paid integration tests for the Square verification gate."""

    # --- not configured → fall through (trust-the-frontend) ---

    def test_not_configured_mark_paid_succeeds(
        self, client, db_session, monkeypatch
    ):
        """When Square is not configured, mark-paid succeeds unchanged."""
        _patch_verify(monkeypatch, {"configured": False})

        _, _, st = _seed(db_session)
        bill = _seed_paying_bill(db_session, st.id, Decimal("50.00"))

        resp = client.post(
            "/api/v1/staff/table/SQ1/mark-paid",
            json={
                "provider_payment_id": "sq_unconfigured",
                "amount": "50.00",
                "idempotency_key": "sq-nc-001",
            },
        )
        assert resp.status_code == 200

        payments = db_session.execute(
            select(Payment).where(Payment.bill_id == bill.id)
        ).scalars().all()
        assert len(payments) == 1
        assert payments[0].provider == "square"

    # --- configured + valid → success ---

    def test_configured_valid_mark_paid_succeeds(
        self, client, db_session, monkeypatch
    ):
        """Configured + valid Square payment closes the bill."""
        _patch_verify(monkeypatch, {"configured": True, "valid": True, "reason": "ok"})

        _, _, st = _seed(db_session)
        bill = _seed_paying_bill(db_session, st.id, Decimal("75.00"))

        resp = client.post(
            "/api/v1/staff/table/SQ1/mark-paid",
            json={
                "provider_payment_id": "sq_valid_001",
                "amount": "75.00",
                "idempotency_key": "sq-v-001",
            },
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["bill_status"] == "paid"
        assert body["session_table_status"] == "available"

        payments = db_session.execute(
            select(Payment).where(Payment.bill_id == bill.id)
        ).scalars().all()
        assert len(payments) == 1

    # --- configured + invalid status → 402, no Payment ---

    def test_configured_invalid_status_returns_402(
        self, client, db_session, monkeypatch
    ):
        """Configured + wrong Square status (e.g. PENDING) returns 402, no Payment."""
        _patch_verify(
            monkeypatch,
            {
                "configured": True,
                "valid": False,
                "reason": "Square payment status is 'PENDING'; expected 'COMPLETED'.",
            },
        )

        _, _, st = _seed(db_session)
        bill = _seed_paying_bill(db_session, st.id, Decimal("50.00"))

        resp = client.post(
            "/api/v1/staff/table/SQ1/mark-paid",
            json={
                "provider_payment_id": "sq_pending",
                "amount": "50.00",
                "idempotency_key": "sq-inv-001",
            },
        )
        assert resp.status_code == 402
        assert "PENDING" in resp.json()["detail"]

        # Bill must NOT be closed.
        db_session.expire(bill)
        db_session.refresh(bill)
        assert bill.status == BillStatus.paying

        # No Payment row must have been created.
        payments = db_session.execute(
            select(Payment).where(Payment.bill_id == bill.id)
        ).scalars().all()
        assert len(payments) == 0

    # --- configured + wrong amount → 402, no Payment ---

    def test_configured_wrong_amount_returns_402(
        self, client, db_session, monkeypatch
    ):
        """Configured + mismatched amount returns 402, no Payment."""
        _patch_verify(
            monkeypatch,
            {
                "configured": True,
                "valid": False,
                "reason": "Square payment amount 1000 cents does not match expected 5000 cents.",
            },
        )

        _, _, st = _seed(db_session)
        bill = _seed_paying_bill(db_session, st.id, Decimal("50.00"))

        resp = client.post(
            "/api/v1/staff/table/SQ1/mark-paid",
            json={
                "provider_payment_id": "sq_bad_amt",
                "amount": "50.00",
                "idempotency_key": "sq-amt-001",
            },
        )
        assert resp.status_code == 402

        payments = db_session.execute(
            select(Payment).where(Payment.bill_id == bill.id)
        ).scalars().all()
        assert len(payments) == 0

    # --- configured + wrong location → 402, no Payment ---

    def test_configured_wrong_location_returns_402(
        self, client, db_session, monkeypatch
    ):
        """Configured + wrong Square location returns 402, no Payment."""
        _patch_verify(
            monkeypatch,
            {
                "configured": True,
                "valid": False,
                "reason": "Square payment location 'LOC_other' does not match configured location 'LOC_main'.",
            },
        )

        _, _, st = _seed(db_session)
        bill = _seed_paying_bill(db_session, st.id, Decimal("50.00"))

        resp = client.post(
            "/api/v1/staff/table/SQ1/mark-paid",
            json={
                "provider_payment_id": "sq_wrong_loc",
                "amount": "50.00",
                "idempotency_key": "sq-loc-001",
            },
        )
        assert resp.status_code == 402
        assert "LOC_other" in resp.json()["detail"]

        payments = db_session.execute(
            select(Payment).where(Payment.bill_id == bill.id)
        ).scalars().all()
        assert len(payments) == 0

    # --- configured + network error → 402, no Payment ---

    def test_configured_network_error_returns_402(
        self, client, db_session, monkeypatch
    ):
        """If Square API is unreachable (network error), return 402, no Payment."""
        _patch_verify(
            monkeypatch,
            {
                "configured": True,
                "valid": False,
                "reason": "Network error contacting Square: Connection refused",
            },
        )

        _, _, st = _seed(db_session)
        bill = _seed_paying_bill(db_session, st.id, Decimal("50.00"))

        resp = client.post(
            "/api/v1/staff/table/SQ1/mark-paid",
            json={
                "provider_payment_id": "sq_net_err",
                "amount": "50.00",
                "idempotency_key": "sq-net-001",
            },
        )
        assert resp.status_code == 402

        payments = db_session.execute(
            select(Payment).where(Payment.bill_id == bill.id)
        ).scalars().all()
        assert len(payments) == 0

    # --- manual override → always succeeds, verify never called ---

    def test_manual_override_skips_square_verification(
        self, client, db_session, monkeypatch
    ):
        """manual=True path must not call verify_square_payment and must succeed."""
        call_count = {"n": 0}

        def _fake_verify(pid, cents):
            call_count["n"] += 1
            return {"configured": True, "valid": False, "reason": "should not be called"}

        monkeypatch.setattr(
            "app.api.v1.endpoints.staff_checkout.verify_square_payment",
            _fake_verify,
        )

        _, _, st = _seed(db_session)
        bill = _seed_paying_bill(db_session, st.id, Decimal("50.00"))

        resp = client.post(
            "/api/v1/staff/table/SQ1/mark-paid",
            json={
                "manual": True,
                "amount": "50.00",
                "idempotency_key": "sq-manual-001",
            },
        )
        assert resp.status_code == 200
        assert call_count["n"] == 0, "verify_square_payment must NOT be called for manual path"

        payments = db_session.execute(
            select(Payment).where(Payment.bill_id == bill.id)
        ).scalars().all()
        assert len(payments) == 1
        assert payments[0].provider == "manual"

    # --- no provider_payment_id → verification skipped (unconfigured fallback) ---

    def test_no_provider_id_skips_verification(
        self, client, db_session, monkeypatch
    ):
        """When provider_payment_id is absent, verify is skipped entirely (dev fallback)."""
        call_count = {"n": 0}

        def _fake_verify(pid, cents):
            call_count["n"] += 1
            return {"configured": True, "valid": False, "reason": "should not be called"}

        monkeypatch.setattr(
            "app.api.v1.endpoints.staff_checkout.verify_square_payment",
            _fake_verify,
        )
        # dev mode — no production requirement
        monkeypatch.delenv("APP_ENV", raising=False)

        _, _, st = _seed(db_session)
        bill = _seed_paying_bill(db_session, st.id, Decimal("30.00"))

        resp = client.post(
            "/api/v1/staff/table/SQ1/mark-paid",
            json={"amount": "30.00"},
        )
        assert resp.status_code == 200
        assert call_count["n"] == 0
