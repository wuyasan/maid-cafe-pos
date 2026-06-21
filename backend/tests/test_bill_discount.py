"""
Tests for whole-bill discount (F15).

Covers:
  - recompute math (percent / fixed)
  - fixed clamp (discount >= subtotal -> total 0, amount == subtotal)
  - validation: percent > 100 -> 422, negative -> 422, non-numeric -> 422
  - state guard: apply allowed only when open; paying/paid -> 409
  - remove: open ok; paying -> 409
  - percent discount stays correct after a line-item quantity edit
  - start-checkout freezes the discounted total; mark-paid uses discounted total
  - discounted_by is taken from the X-Actor-Id header

Runs on SQLite in-memory via the shared client / db_session fixtures.
"""
from __future__ import annotations

from datetime import date
from decimal import Decimal

from sqlalchemy import select

from app.models.bill import Bill
from app.models.enums import (
    BillStatus,
    DiscountType,
    MenuItemType,
    ProductionStation,
    SessionStatus,
    SessionTableStatus,
)
from app.models.menu import MenuCategory, MenuItem
from app.models.order import OrderItem
from app.models.session import Session as SessionModel
from app.models.staff_user import StaffUser
from app.models.table import SessionTable, Table
from app.services.bill_service import compute_discount_amount


# ---------------------------------------------------------------------------
# Seed helpers
# ---------------------------------------------------------------------------

def _seed_active_session_and_table(db, code: str = "T1"):
    session = SessionModel(
        name="Discount Test Session",
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
# Recompute math
# ---------------------------------------------------------------------------

class TestDiscountMath:
    def test_percent_discount(self, client, db_session):
        _seed_active_session_and_table(db_session)
        item = _seed_regular_item(db_session, price="10.00")
        _place_order(client, "T1", item.id, qty=10)  # subtotal 100.00

        resp = client.post(
            "/api/v1/staff/table/T1/discount",
            json={"type": "percent", "value": 10},
        )
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["subtotal"] == "100.00"
        assert body["discount_type"] == "percent"
        assert body["discount_amount"] == "10.00"
        assert body["total"] == "90.00"

        bill = _get_bill(db_session)
        db_session.refresh(bill)
        assert bill.discount_amount == Decimal("10.00")
        assert bill.total == Decimal("90.00")

    def test_fixed_discount(self, client, db_session):
        _seed_active_session_and_table(db_session)
        item = _seed_regular_item(db_session, price="10.00")
        _place_order(client, "T1", item.id, qty=10)  # subtotal 100.00

        resp = client.post(
            "/api/v1/staff/table/T1/discount",
            json={"type": "fixed", "value": 15},
        )
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["discount_amount"] == "15.00"
        assert body["total"] == "85.00"

    def test_fixed_discount_clamps_to_subtotal(self, client, db_session):
        _seed_active_session_and_table(db_session)
        item = _seed_regular_item(db_session, price="10.00")
        _place_order(client, "T1", item.id, qty=3)  # subtotal 30.00

        resp = client.post(
            "/api/v1/staff/table/T1/discount",
            json={"type": "fixed", "value": 999},
        )
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["discount_amount"] == "30.00"
        assert body["total"] == "0.00"

    def test_note_is_stored(self, client, db_session):
        _seed_active_session_and_table(db_session)
        item = _seed_regular_item(db_session, price="10.00")
        _place_order(client, "T1", item.id, qty=1)

        resp = client.post(
            "/api/v1/staff/table/T1/discount",
            json={"type": "percent", "value": 5, "note": "regular VIP"},
        )
        assert resp.status_code == 200
        assert resp.json()["discount_note"] == "regular VIP"


# ---------------------------------------------------------------------------
# Validation
# ---------------------------------------------------------------------------

class TestDiscountValidation:
    def test_note_over_500_chars_rejected(self, client, db_session):
        _seed_active_session_and_table(db_session)
        item = _seed_regular_item(db_session)
        _place_order(client, "T1", item.id, qty=1)

        resp = client.post(
            "/api/v1/staff/table/T1/discount",
            json={"type": "percent", "value": 10, "note": "x" * 501},
        )
        assert resp.status_code == 422, resp.text

    def test_large_fixed_discount_preserves_entered_value_and_clamps_amount(
        self,
        client,
        db_session,
    ):
        _seed_active_session_and_table(db_session)
        item = _seed_regular_item(db_session, price="10.00")
        _place_order(client, "T1", item.id, qty=3)  # subtotal 30.00

        resp = client.post(
            "/api/v1/staff/table/T1/discount",
            json={"type": "fixed", "value": "12345678901234567890"},
        )
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["discount_amount"] == "30.00"
        assert body["total"] == "0.00"

    def test_discount_value_column_has_no_precision_limit(self):
        assert Bill.__table__.c.discount_value.type.precision is None

    def test_extremely_large_fixed_discount_clamps_before_cent_rounding(self):
        assert compute_discount_amount(
            Decimal("30.00"),
            DiscountType.fixed,
            Decimal("1E+1000"),
        ) == Decimal("30.00")

    def test_percent_over_100_rejected(self, client, db_session):
        _seed_active_session_and_table(db_session)
        item = _seed_regular_item(db_session)
        _place_order(client, "T1", item.id, qty=1)

        resp = client.post(
            "/api/v1/staff/table/T1/discount",
            json={"type": "percent", "value": 150},
        )
        assert resp.status_code == 422, resp.text

    def test_negative_value_rejected(self, client, db_session):
        _seed_active_session_and_table(db_session)
        item = _seed_regular_item(db_session)
        _place_order(client, "T1", item.id, qty=1)

        resp = client.post(
            "/api/v1/staff/table/T1/discount",
            json={"type": "fixed", "value": -5},
        )
        assert resp.status_code == 422, resp.text

    def test_non_numeric_value_rejected(self, client, db_session):
        _seed_active_session_and_table(db_session)
        item = _seed_regular_item(db_session)
        _place_order(client, "T1", item.id, qty=1)

        resp = client.post(
            "/api/v1/staff/table/T1/discount",
            json={"type": "percent", "value": "abc"},
        )
        assert resp.status_code == 422, resp.text

    def test_bad_type_rejected(self, client, db_session):
        _seed_active_session_and_table(db_session)
        item = _seed_regular_item(db_session)
        _place_order(client, "T1", item.id, qty=1)

        resp = client.post(
            "/api/v1/staff/table/T1/discount",
            json={"type": "bogus", "value": 10},
        )
        assert resp.status_code == 422, resp.text


# ---------------------------------------------------------------------------
# State guard (open / paying / paid)
# ---------------------------------------------------------------------------

class TestDiscountStateGuard:
    def test_apply_allowed_when_open(self, client, db_session):
        _seed_active_session_and_table(db_session)
        item = _seed_regular_item(db_session)
        _place_order(client, "T1", item.id, qty=1)

        resp = client.post(
            "/api/v1/staff/table/T1/discount",
            json={"type": "percent", "value": 10},
        )
        assert resp.status_code == 200, resp.text

    def test_apply_rejected_when_paying(self, client, db_session):
        _seed_active_session_and_table(db_session)
        item = _seed_regular_item(db_session)
        _place_order(client, "T1", item.id, qty=1)

        client.post("/api/v1/staff/table/T1/start-checkout")

        resp = client.post(
            "/api/v1/staff/table/T1/discount",
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
            "/api/v1/staff/table/T1/discount",
            json={"type": "percent", "value": 10},
        )
        # Bill is paid (released) -> no open/paying bill -> 404, or 409 if found.
        assert resp.status_code in (404, 409), resp.text

    def test_remove_allowed_when_open(self, client, db_session):
        _seed_active_session_and_table(db_session)
        item = _seed_regular_item(db_session, price="10.00")
        _place_order(client, "T1", item.id, qty=2)  # 20.00

        client.post(
            "/api/v1/staff/table/T1/discount",
            json={"type": "percent", "value": 50},
        )
        resp = client.delete("/api/v1/staff/table/T1/discount")
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["discount_type"] == "none"
        assert body["discount_amount"] == "0.00"
        assert body["total"] == "20.00"

    def test_remove_rejected_when_paying(self, client, db_session):
        _seed_active_session_and_table(db_session)
        item = _seed_regular_item(db_session)
        _place_order(client, "T1", item.id, qty=1)

        client.post(
            "/api/v1/staff/table/T1/discount",
            json={"type": "percent", "value": 10},
        )
        client.post("/api/v1/staff/table/T1/start-checkout")

        resp = client.delete("/api/v1/staff/table/T1/discount")
        assert resp.status_code == 409, resp.text


# ---------------------------------------------------------------------------
# Discount stays correct after line-item edits
# ---------------------------------------------------------------------------

class TestDiscountRecomputedOnItemEdit:
    def test_percent_recomputed_after_quantity_change(self, client, db_session):
        _seed_active_session_and_table(db_session)
        item = _seed_regular_item(db_session, price="10.00")
        order_resp = _place_order(client, "T1", item.id, qty=2)  # subtotal 20.00

        client.post(
            "/api/v1/staff/table/T1/discount",
            json={"type": "percent", "value": 10},
        )

        bill = _get_bill(db_session)
        db_session.refresh(bill)
        assert bill.total == Decimal("18.00")  # 20 - 10%

        # Find the order item and bump quantity 2 -> 5 (subtotal 50.00).
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
        assert bill.discount_amount == Decimal("5.00")  # 10% of 50
        assert bill.total == Decimal("45.00")


# ---------------------------------------------------------------------------
# Checkout / payment integration
# ---------------------------------------------------------------------------

class TestDiscountCheckoutFreezeAndPay:
    def test_start_checkout_freezes_discounted_total(self, client, db_session):
        _seed_active_session_and_table(db_session)
        item = _seed_regular_item(db_session, price="10.00")
        _place_order(client, "T1", item.id, qty=10)  # 100.00

        client.post(
            "/api/v1/staff/table/T1/discount",
            json={"type": "percent", "value": 20},
        )

        resp = client.post("/api/v1/staff/table/T1/start-checkout")
        assert resp.status_code == 200, resp.text
        assert resp.json()["checkout_total"] == "80.00"

        bill = _get_bill(db_session)
        db_session.refresh(bill)
        assert bill.checkout_total == Decimal("80.00")

    def test_mark_paid_uses_discounted_total(self, client, db_session):
        _seed_active_session_and_table(db_session)
        item = _seed_regular_item(db_session, price="10.00")
        _place_order(client, "T1", item.id, qty=10)  # 100.00

        client.post(
            "/api/v1/staff/table/T1/discount",
            json={"type": "fixed", "value": 25},
        )
        client.post("/api/v1/staff/table/T1/start-checkout")

        resp = client.post(
            "/api/v1/staff/table/T1/mark-paid",
            json={"manual": True, "amount": "75.00"},
        )
        assert resp.status_code == 200, resp.text
        assert resp.json()["bill_status"] == "paid"

        bill = _get_bill(db_session)
        db_session.refresh(bill)
        assert bill.status == BillStatus.paid


# ---------------------------------------------------------------------------
# Actor attribution
# ---------------------------------------------------------------------------

class TestDiscountActor:
    def test_discounted_by_from_actor_header(self, client, db_session):
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
            "/api/v1/staff/table/T1/discount",
            json={"type": "percent", "value": 10},
            headers={"X-Actor-Id": str(staff.id)},
        )
        assert resp.status_code == 200, resp.text

        bill = _get_bill(db_session)
        db_session.refresh(bill)
        assert bill.discounted_by == staff.id
        assert bill.discounted_at is not None

    def test_discounted_by_null_when_no_header(self, client, db_session):
        _seed_active_session_and_table(db_session)
        item = _seed_regular_item(db_session)
        _place_order(client, "T1", item.id, qty=1)

        resp = client.post(
            "/api/v1/staff/table/T1/discount",
            json={"type": "percent", "value": 10},
        )
        assert resp.status_code == 200, resp.text

        bill = _get_bill(db_session)
        db_session.refresh(bill)
        assert bill.discounted_by is None
