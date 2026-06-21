"""
Tests for whole-bill tip (F16).

Covers:
  - recompute math: percent (base = discounted), fixed (additive, NOT clamped)
  - tip recomputed after discount / quantity changes
  - total = subtotal - discount + tip
  - state guard: apply/remove allowed only when open; paying/paid -> 409
  - remove tip
  - oversized fixed tip 12345678901234567890 -> 422 (NOT 500)
  - percent > 100 -> 422; negative -> 422; non-numeric -> 422
  - start-checkout freezes the tip-inclusive total
  - mark-paid uses tip-inclusive total and snapshots payment.tip_amount == bill.tip_amount

Runs on SQLite in-memory via the shared client / db_session fixtures.
"""
from __future__ import annotations

from datetime import date
from decimal import Decimal

from sqlalchemy import select

from app.models.bill import Bill
from app.models.enums import (
    BillStatus,
    MenuItemType,
    ProductionStation,
    SessionStatus,
    SessionTableStatus,
    TipType,
)
from app.models.menu import MenuCategory, MenuItem
from app.models.order import OrderItem
from app.models.payment import Payment
from app.models.session import Session as SessionModel
from app.models.staff_user import StaffUser
from app.models.table import SessionTable, Table
from app.services.bill_service import compute_tip_amount


# ---------------------------------------------------------------------------
# Seed helpers
# ---------------------------------------------------------------------------

def _seed_active_session_and_table(db, code: str = "T1"):
    session = SessionModel(
        name="Tip Test Session",
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


def _seed_regular_item(db, name: str = "Tea", price: str = "10.00") -> MenuItem:
    category = MenuCategory(
        name="Drinks",
        display_order=1,
        production_station=ProductionStation.none,
    )
    db.add(category)
    db.flush()
    item = MenuItem(
        name=name,
        price=Decimal(price),
        category_id=category.id,
        item_type=MenuItemType.regular,
        is_active=True,
        is_bundle=False,
    )
    db.add(item)
    db.flush()
    db.commit()
    return item


def _place_order(client, code: str, menu_item_id: int, qty: int = 1):
    resp = client.post(
        f"/api/v1/customer-orders/customer/table/{code}/orders",
        json={"source": "qr", "items": [{"menu_item_id": menu_item_id, "quantity": qty}]},
    )
    assert resp.status_code == 200, resp.text
    return resp.json()


def _get_bill(db, code: str = "T1") -> Bill:
    return (
        db.execute(
            select(Bill)
            .join(SessionTable, SessionTable.id == Bill.session_table_id)
            .join(Table, Table.id == SessionTable.table_id)
            .where(Table.code == code)
            .order_by(Bill.id.desc())
        )
        .scalars()
        .first()
    )


# ---------------------------------------------------------------------------
# Recompute math (service-level)
# ---------------------------------------------------------------------------

class TestTipMath:
    def test_compute_none(self):
        assert compute_tip_amount(
            Decimal("100.00"), TipType.none, Decimal("10")
        ) == Decimal("0.00")

    def test_compute_percent_base_is_discounted(self):
        # discounted base 90 -> 10% -> 9.00
        assert compute_tip_amount(
            Decimal("90.00"), TipType.percent, Decimal("10")
        ) == Decimal("9.00")

    def test_compute_fixed_not_clamped(self):
        # fixed tip is an add-on; it is NOT clamped to the base.
        assert compute_tip_amount(
            Decimal("5.00"), TipType.fixed, Decimal("999")
        ) == Decimal("999.00")

    def test_percent_tip_via_api(self, client, db_session):
        _seed_active_session_and_table(db_session)
        item = _seed_regular_item(db_session, price="10.00")
        _place_order(client, "T1", item.id, qty=10)  # subtotal 100.00

        resp = client.post(
            "/api/v1/staff/table/T1/tip",
            json={"type": "percent", "value": 10},
        )
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["subtotal"] == "100.00"
        assert body["tip_type"] == "percent"
        assert body["tip_amount"] == "10.00"  # 10% of 100 (no discount)
        assert body["total"] == "110.00"

        bill = _get_bill(db_session)
        db_session.refresh(bill)
        assert bill.tip_amount == Decimal("10.00")
        assert bill.total == Decimal("110.00")

    def test_percent_tip_base_is_discounted_amount(self, client, db_session):
        _seed_active_session_and_table(db_session)
        item = _seed_regular_item(db_session, price="10.00")
        _place_order(client, "T1", item.id, qty=10)  # subtotal 100.00

        # 20% discount -> discounted 80.00
        client.post(
            "/api/v1/staff/table/T1/discount",
            json={"type": "percent", "value": 20},
        )
        # 10% tip on the DISCOUNTED 80 -> 8.00
        resp = client.post(
            "/api/v1/staff/table/T1/tip",
            json={"type": "percent", "value": 10},
        )
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["discount_amount"] == "20.00"
        assert body["tip_amount"] == "8.00"
        # total = 100 - 20 + 8
        assert body["total"] == "88.00"

    def test_fixed_tip_via_api(self, client, db_session):
        _seed_active_session_and_table(db_session)
        item = _seed_regular_item(db_session, price="10.00")
        _place_order(client, "T1", item.id, qty=10)  # subtotal 100.00

        resp = client.post(
            "/api/v1/staff/table/T1/tip",
            json={"type": "fixed", "value": 15},
        )
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["tip_amount"] == "15.00"
        assert body["total"] == "115.00"

    def test_bill_detail_includes_tip_fields(self, client, db_session):
        _seed_active_session_and_table(db_session)
        item = _seed_regular_item(db_session, price="10.00")
        _place_order(client, "T1", item.id, qty=2)  # subtotal 20.00

        tip = client.post(
            "/api/v1/staff/table/T1/tip",
            json={"type": "percent", "value": 20},
        )
        assert tip.status_code == 200, tip.text

        resp = client.get("/api/v1/customer-orders/customer/table/T1/bill")
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["subtotal"] == "20.00"
        assert body["tip_type"] == "percent"
        assert body["tip_value"] == "20.00"
        assert body["tip_amount"] == "4.00"
        assert body["total"] == "24.00"


# ---------------------------------------------------------------------------
# Tip recomputed after discount / quantity edits
# ---------------------------------------------------------------------------

class TestTipRecompute:
    def test_percent_tip_recomputed_after_discount_change(self, client, db_session):
        _seed_active_session_and_table(db_session)
        item = _seed_regular_item(db_session, price="10.00")
        _place_order(client, "T1", item.id, qty=10)  # subtotal 100.00

        # 10% tip first (base 100 -> 10.00)
        client.post(
            "/api/v1/staff/table/T1/tip",
            json={"type": "percent", "value": 10},
        )
        bill = _get_bill(db_session)
        db_session.refresh(bill)
        assert bill.tip_amount == Decimal("10.00")
        assert bill.total == Decimal("110.00")

        # Apply 50% discount -> discounted 50 -> tip recomputes to 5.00
        client.post(
            "/api/v1/staff/table/T1/discount",
            json={"type": "percent", "value": 50},
        )
        db_session.expire_all()
        bill = _get_bill(db_session)
        assert bill.discount_amount == Decimal("50.00")
        assert bill.tip_amount == Decimal("5.00")
        assert bill.total == Decimal("55.00")  # 100 - 50 + 5

    def test_percent_tip_recomputed_after_quantity_change(self, client, db_session):
        _seed_active_session_and_table(db_session)
        item = _seed_regular_item(db_session, price="10.00")
        _place_order(client, "T1", item.id, qty=2)  # subtotal 20.00

        client.post(
            "/api/v1/staff/table/T1/tip",
            json={"type": "percent", "value": 10},
        )
        bill = _get_bill(db_session)
        db_session.refresh(bill)
        assert bill.tip_amount == Decimal("2.00")
        assert bill.total == Decimal("22.00")

        order_item = (
            db_session.execute(
                select(OrderItem).where(OrderItem.menu_item_id == item.id)
            )
            .scalars()
            .first()
        )
        patch = client.patch(
            f"/api/v1/staff/order-items/{order_item.id}/quantity",
            json={"quantity": 5},
        )
        assert patch.status_code == 200, patch.text

        db_session.expire_all()
        bill = _get_bill(db_session)
        assert bill.subtotal == Decimal("50.00")
        assert bill.tip_amount == Decimal("5.00")  # 10% of 50
        assert bill.total == Decimal("55.00")


# ---------------------------------------------------------------------------
# Validation
# ---------------------------------------------------------------------------

class TestTipValidation:
    def test_oversized_fixed_tip_returns_422_not_500(self, client, db_session):
        _seed_active_session_and_table(db_session)
        item = _seed_regular_item(db_session, price="10.00")
        _place_order(client, "T1", item.id, qty=1)  # subtotal 10.00

        resp = client.post(
            "/api/v1/staff/table/T1/tip",
            json={"type": "fixed", "value": "12345678901234567890"},
        )
        assert resp.status_code == 422, resp.text

        # Nothing should have been written.
        bill = _get_bill(db_session)
        db_session.refresh(bill)
        assert bill.tip_type == TipType.none
        assert bill.tip_amount == Decimal("0.00")

    def test_fixed_tip_at_max_total_overflow_returns_422(self, client, db_session):
        # fixed value within column bound, but pushes total past MAX -> 422.
        _seed_active_session_and_table(db_session)
        item = _seed_regular_item(db_session, price="10.00")
        _place_order(client, "T1", item.id, qty=1)  # subtotal 10.00

        resp = client.post(
            "/api/v1/staff/table/T1/tip",
            json={"type": "fixed", "value": "99999999.99"},
        )
        # 10 + 99999999.99 > 99999999.99 -> overflow guard -> 422
        assert resp.status_code == 422, resp.text

        bill = _get_bill(db_session)
        db_session.refresh(bill)
        assert bill.tip_type == TipType.none

    def test_remove_discount_that_would_overflow_tipped_total_returns_422(
        self,
        client,
        db_session,
    ):
        """Overflow guard must apply outside /tip too.

        Repro:
          subtotal 100.00, fixed discount 100.00 -> discounted 0.00
          fixed tip 99999999.99 -> total exactly 99999999.99, valid
          removing discount would make total 100.00 + 99999999.99 -> overflow

        This must return 422, not an uncaught 500, and preserve the discount.
        """
        _seed_active_session_and_table(db_session)
        item = _seed_regular_item(db_session, price="100.00")
        _place_order(client, "T1", item.id, qty=1)

        discount = client.post(
            "/api/v1/staff/table/T1/discount",
            json={"type": "fixed", "value": "100.00"},
        )
        assert discount.status_code == 200, discount.text

        tip = client.post(
            "/api/v1/staff/table/T1/tip",
            json={"type": "fixed", "value": "99999999.99"},
        )
        assert tip.status_code == 200, tip.text
        assert tip.json()["total"] == "99999999.99"

        resp = client.delete("/api/v1/staff/table/T1/discount")
        assert resp.status_code == 422, resp.text

        db_session.expire_all()
        bill = _get_bill(db_session)
        assert bill.discount_type.value == "fixed"
        assert bill.discount_amount == Decimal("100.00")
        assert bill.tip_amount == Decimal("99999999.99")
        assert bill.total == Decimal("99999999.99")

    def test_quantity_increase_that_would_overflow_tipped_total_returns_422(
        self,
        client,
        db_session,
    ):
        _seed_active_session_and_table(db_session)
        item = _seed_regular_item(db_session, price="100.00")
        _place_order(client, "T1", item.id, qty=1)

        discount = client.post(
            "/api/v1/staff/table/T1/discount",
            json={"type": "fixed", "value": "100.00"},
        )
        assert discount.status_code == 200, discount.text

        tip = client.post(
            "/api/v1/staff/table/T1/tip",
            json={"type": "fixed", "value": "99999999.99"},
        )
        assert tip.status_code == 200, tip.text

        order_item = (
            db_session.execute(
                select(OrderItem).where(OrderItem.menu_item_id == item.id)
            )
            .scalars()
            .first()
        )
        resp = client.patch(
            f"/api/v1/staff/order-items/{order_item.id}/quantity",
            json={"quantity": 2},
        )
        assert resp.status_code == 422, resp.text

        db_session.expire_all()
        order_item = db_session.get(OrderItem, order_item.id)
        bill = _get_bill(db_session)
        assert order_item.quantity == 1
        assert order_item.total_price == Decimal("100.00")
        assert bill.total == Decimal("99999999.99")

    def test_customer_add_order_that_would_overflow_tipped_total_returns_422(
        self,
        client,
        db_session,
    ):
        _seed_active_session_and_table(db_session)
        item = _seed_regular_item(db_session, price="100.00")
        _place_order(client, "T1", item.id, qty=1)

        discount = client.post(
            "/api/v1/staff/table/T1/discount",
            json={"type": "fixed", "value": "100.00"},
        )
        assert discount.status_code == 200, discount.text

        tip = client.post(
            "/api/v1/staff/table/T1/tip",
            json={"type": "fixed", "value": "99999999.99"},
        )
        assert tip.status_code == 200, tip.text

        resp = client.post(
            "/api/v1/customer-orders/customer/table/T1/orders",
            json={
                "source": "qr",
                "items": [{"menu_item_id": item.id, "quantity": 1}],
            },
        )
        assert resp.status_code == 422, resp.text

        db_session.expire_all()
        bill = _get_bill(db_session)
        item_count = (
            db_session.execute(
                select(OrderItem).where(OrderItem.menu_item_id == item.id)
            )
            .scalars()
            .all()
        )
        assert len(item_count) == 1
        assert bill.total == Decimal("99999999.99")

    def test_percent_over_100_rejected(self, client, db_session):
        _seed_active_session_and_table(db_session)
        item = _seed_regular_item(db_session)
        _place_order(client, "T1", item.id, qty=1)

        resp = client.post(
            "/api/v1/staff/table/T1/tip",
            json={"type": "percent", "value": 150},
        )
        assert resp.status_code == 422, resp.text

    def test_negative_value_rejected(self, client, db_session):
        _seed_active_session_and_table(db_session)
        item = _seed_regular_item(db_session)
        _place_order(client, "T1", item.id, qty=1)

        resp = client.post(
            "/api/v1/staff/table/T1/tip",
            json={"type": "fixed", "value": -5},
        )
        assert resp.status_code == 422, resp.text

    def test_non_numeric_value_rejected(self, client, db_session):
        _seed_active_session_and_table(db_session)
        item = _seed_regular_item(db_session)
        _place_order(client, "T1", item.id, qty=1)

        resp = client.post(
            "/api/v1/staff/table/T1/tip",
            json={"type": "percent", "value": "abc"},
        )
        assert resp.status_code == 422, resp.text

    def test_bad_type_rejected(self, client, db_session):
        _seed_active_session_and_table(db_session)
        item = _seed_regular_item(db_session)
        _place_order(client, "T1", item.id, qty=1)

        resp = client.post(
            "/api/v1/staff/table/T1/tip",
            json={"type": "bogus", "value": 10},
        )
        assert resp.status_code == 422, resp.text


# ---------------------------------------------------------------------------
# State guard (open / paying / paid) + remove
# ---------------------------------------------------------------------------

class TestTipStateGuard:
    def test_apply_allowed_when_open(self, client, db_session):
        _seed_active_session_and_table(db_session)
        item = _seed_regular_item(db_session)
        _place_order(client, "T1", item.id, qty=1)

        resp = client.post(
            "/api/v1/staff/table/T1/tip",
            json={"type": "percent", "value": 10},
        )
        assert resp.status_code == 200, resp.text

    def test_apply_rejected_when_paying(self, client, db_session):
        _seed_active_session_and_table(db_session)
        item = _seed_regular_item(db_session)
        _place_order(client, "T1", item.id, qty=1)

        client.post("/api/v1/staff/table/T1/start-checkout")

        resp = client.post(
            "/api/v1/staff/table/T1/tip",
            json={"type": "percent", "value": 10},
        )
        assert resp.status_code == 409, resp.text

    def test_apply_rejected_when_paid(self, client, db_session):
        _seed_active_session_and_table(db_session)
        item = _seed_regular_item(db_session)
        _place_order(client, "T1", item.id, qty=1)

        client.post("/api/v1/staff/table/T1/start-checkout")
        client.post("/api/v1/staff/table/T1/mark-paid", json={"manual": True})

        resp = client.post(
            "/api/v1/staff/table/T1/tip",
            json={"type": "percent", "value": 10},
        )
        # Bill is paid (released) -> no open/paying bill -> 404, or 409 if found.
        assert resp.status_code in (404, 409), resp.text

    def test_remove_allowed_when_open(self, client, db_session):
        _seed_active_session_and_table(db_session)
        item = _seed_regular_item(db_session, price="10.00")
        _place_order(client, "T1", item.id, qty=2)  # 20.00

        client.post(
            "/api/v1/staff/table/T1/tip",
            json={"type": "percent", "value": 50},
        )
        resp = client.delete("/api/v1/staff/table/T1/tip")
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["tip_type"] == "none"
        assert body["tip_amount"] == "0.00"
        assert body["total"] == "20.00"

    def test_remove_rejected_when_paying(self, client, db_session):
        _seed_active_session_and_table(db_session)
        item = _seed_regular_item(db_session)
        _place_order(client, "T1", item.id, qty=1)

        client.post(
            "/api/v1/staff/table/T1/tip",
            json={"type": "percent", "value": 10},
        )
        client.post("/api/v1/staff/table/T1/start-checkout")

        resp = client.delete("/api/v1/staff/table/T1/tip")
        assert resp.status_code == 409, resp.text


# ---------------------------------------------------------------------------
# Checkout / payment integration
# ---------------------------------------------------------------------------

class TestTipCheckoutFreezeAndPay:
    def test_start_checkout_freezes_tip_inclusive_total(self, client, db_session):
        _seed_active_session_and_table(db_session)
        item = _seed_regular_item(db_session, price="10.00")
        _place_order(client, "T1", item.id, qty=10)  # 100.00

        client.post(
            "/api/v1/staff/table/T1/tip",
            json={"type": "percent", "value": 20},
        )

        resp = client.post("/api/v1/staff/table/T1/start-checkout")
        assert resp.status_code == 200, resp.text
        assert resp.json()["checkout_total"] == "120.00"

        bill = _get_bill(db_session)
        db_session.refresh(bill)
        assert bill.checkout_total == Decimal("120.00")

    def test_mark_paid_uses_tip_total_and_snapshots_tip(self, client, db_session):
        _seed_active_session_and_table(db_session)
        item = _seed_regular_item(db_session, price="10.00")
        _place_order(client, "T1", item.id, qty=10)  # 100.00

        client.post(
            "/api/v1/staff/table/T1/tip",
            json={"type": "fixed", "value": 25},
        )
        client.post("/api/v1/staff/table/T1/start-checkout")

        resp = client.post(
            "/api/v1/staff/table/T1/mark-paid",
            json={"manual": True, "amount": "125.00"},
        )
        assert resp.status_code == 200, resp.text
        assert resp.json()["bill_status"] == "paid"

        bill = _get_bill(db_session)
        db_session.refresh(bill)
        assert bill.status == BillStatus.paid
        assert bill.tip_amount == Decimal("25.00")

        payment = (
            db_session.execute(
                select(Payment).where(Payment.bill_id == bill.id)
            )
            .scalars()
            .first()
        )
        assert payment is not None
        assert payment.amount == Decimal("125.00")
        assert payment.tip_amount == bill.tip_amount == Decimal("25.00")


# ---------------------------------------------------------------------------
# Actor attribution
# ---------------------------------------------------------------------------

class TestTipActor:
    def test_tipped_by_from_actor_header(self, client, db_session):
        _seed_active_session_and_table(db_session)
        item = _seed_regular_item(db_session)
        _place_order(client, "T1", item.id, qty=1)

        staff = StaffUser(
            username="cashier1",
            display_name="Cashier One",
            role="staff",
            pin_hash="x",
            is_active=True,
        )
        db_session.add(staff)
        db_session.commit()
        db_session.refresh(staff)

        resp = client.post(
            "/api/v1/staff/table/T1/tip",
            json={"type": "percent", "value": 10},
            headers={"X-Actor-Id": str(staff.id)},
        )
        assert resp.status_code == 200, resp.text

        bill = _get_bill(db_session)
        db_session.refresh(bill)
        assert bill.tipped_by == staff.id
        assert bill.tipped_at is not None

    def test_tipped_by_null_when_no_header(self, client, db_session):
        _seed_active_session_and_table(db_session)
        item = _seed_regular_item(db_session)
        _place_order(client, "T1", item.id, qty=1)

        resp = client.post(
            "/api/v1/staff/table/T1/tip",
            json={"type": "percent", "value": 10},
        )
        assert resp.status_code == 200, resp.text

        bill = _get_bill(db_session)
        db_session.refresh(bill)
        assert bill.tipped_by is None

    def test_invalid_actor_header_does_not_500(self, client, db_session):
        """A stale signed web session may carry a staff-user id that no longer exists."""
        _seed_active_session_and_table(db_session)
        item = _seed_regular_item(db_session)
        _place_order(client, "T1", item.id, qty=1)

        resp = client.post(
            "/api/v1/staff/table/T1/tip",
            json={"type": "percent", "value": 10},
            headers={"X-Actor-Id": "999999"},
        )
        assert resp.status_code == 200, resp.text

        bill = _get_bill(db_session)
        db_session.refresh(bill)
        assert bill.tipped_by is None
