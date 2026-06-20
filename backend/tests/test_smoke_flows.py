"""
Phase 5 / T5.1 – Key-path smoke tests for Maid Cafe POS backend.

Covers four core flows:
1. Customer order happy-path  (POST /customer-orders/customer/table/{code}/orders)
2. Maid-service pricing       (base + additional * (N-1), all_maids_price cap)
3. Production-task splitting  (station-based tasks, bundle component fan-out)
4. Table / session-table CRUD (POST tables, POST session-tables, PATCH seat-count)

All tests run on SQLite in-memory via the shared db_session / client fixtures
defined in conftest.py.  No commits are made to any git repository.
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
    SessionStatus,
    SessionTableStatus,
)
from app.models.maid import Maid, SessionMaid
from app.models.menu import MaidServicePricing, MenuCategory, MenuItem, MenuItemComponent
from app.models.order import Order, OrderItem, ProductionTask
from app.models.session import Session as SessionModel
from app.models.table import SessionTable, Table


# ---------------------------------------------------------------------------
# Shared seed helpers
# ---------------------------------------------------------------------------

def _seed_session_table(db) -> tuple[SessionModel, Table, SessionTable]:
    """Minimum viable session + table + session_table for customer-order tests."""
    session = SessionModel(
        name="Smoke Test Session",
        service_date=date.today(),
        status=SessionStatus.active,
    )
    db.add(session)
    db.flush()

    table = Table(code="A1", seats=6, is_active=True, is_shareable=False)
    db.add(table)
    db.flush()

    st = SessionTable(
        session_id=session.id,
        table_id=table.id,
        status=SessionTableStatus.available,
    )
    db.add(st)
    db.flush()
    db.commit()
    return session, table, st


def _seed_regular_item(db, category: MenuCategory, name: str = "Matcha Latte",
                       price: str = "8.00") -> MenuItem:
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
    return item


def _seed_maid(db, session: SessionModel, name: str = "Sakura",
               available: bool = True) -> Maid:
    maid = Maid(name=name, is_active=True)
    db.add(maid)
    db.flush()
    session_maid = SessionMaid(
        session_id=session.id,
        maid_id=maid.id,
        is_available=available,
    )
    db.add(session_maid)
    db.flush()
    return maid


# ---------------------------------------------------------------------------
# 1. Customer order happy-path
# ---------------------------------------------------------------------------

class TestCustomerOrderHappyPath:
    """POST /api/v1/customer-orders/customer/table/{code}/orders creates bill +
    order + order_items and returns correct totals."""

    def test_order_creates_bill_and_returns_total(self, client, db_session):
        """Single regular item: bill is auto-created, total = unit_price * qty."""
        _seed_session_table(db_session)

        category = MenuCategory(
            name="Drinks", display_order=1,
            production_station=ProductionStation.none,
        )
        db_session.add(category)
        db_session.flush()

        item = _seed_regular_item(db_session, category, name="Ocha", price="10.00")
        db_session.commit()

        resp = client.post(
            "/api/v1/customer-orders/customer/table/A1/orders",
            json={
                "source": "qr",
                "items": [{"menu_item_id": item.id, "quantity": 2}],
            },
        )
        assert resp.status_code == 200, resp.text
        body = resp.json()

        # Response structure
        assert body["bill_total"] == "20.00"
        assert len(body["items"]) == 1
        assert body["items"][0]["unit_price"] == "10.00"
        assert body["items"][0]["total_price"] == "20.00"
        assert body["items"][0]["quantity"] == 2

        # Verify DB state
        bills = db_session.execute(select(Bill)).scalars().all()
        assert len(bills) == 1
        assert bills[0].status == BillStatus.open
        assert bills[0].total == Decimal("20.00")

        order_items = db_session.execute(select(OrderItem)).scalars().all()
        assert len(order_items) == 1
        assert order_items[0].menu_item_id == item.id
        assert order_items[0].quantity == 2

    def test_second_order_appends_to_same_bill(self, client, db_session):
        """Two consecutive POST /orders calls accumulate onto the same open bill."""
        _seed_session_table(db_session)

        category = MenuCategory(
            name="Food", display_order=1,
            production_station=ProductionStation.none,
        )
        db_session.add(category)
        db_session.flush()

        item_a = _seed_regular_item(db_session, category, "Item A", "5.00")
        item_b = _seed_regular_item(db_session, category, "Item B", "7.00")
        db_session.commit()

        r1 = client.post(
            "/api/v1/customer-orders/customer/table/A1/orders",
            json={"source": "qr", "items": [{"menu_item_id": item_a.id, "quantity": 1}]},
        )
        assert r1.status_code == 200

        r2 = client.post(
            "/api/v1/customer-orders/customer/table/A1/orders",
            json={"source": "qr", "items": [{"menu_item_id": item_b.id, "quantity": 1}]},
        )
        assert r2.status_code == 200

        # Only one bill should exist
        bills = db_session.execute(select(Bill)).scalars().all()
        assert len(bills) == 1
        assert bills[0].total == Decimal("12.00")

        # Two separate orders on that bill
        orders = db_session.execute(select(Order)).scalars().all()
        assert len(orders) == 2

    def test_get_bill_reflects_order(self, client, db_session):
        """After placing an order, GET /bill returns the item in its items list."""
        _seed_session_table(db_session)

        category = MenuCategory(
            name="Specials", display_order=1,
            production_station=ProductionStation.none,
        )
        db_session.add(category)
        db_session.flush()

        item = _seed_regular_item(db_session, category, "Special Roll", "15.00")
        db_session.commit()

        # Place order
        client.post(
            "/api/v1/customer-orders/customer/table/A1/orders",
            json={"source": "qr", "items": [{"menu_item_id": item.id, "quantity": 1}]},
        )

        # Retrieve bill
        resp = client.get("/api/v1/customer-orders/customer/table/A1/bill")
        assert resp.status_code == 200
        body = resp.json()
        assert body is not None
        assert len(body["items"]) == 1
        assert body["items"][0]["menu_item_name"] == "Special Roll"
        assert body["total"] == "15.00"

    def test_empty_order_returns_400(self, client, db_session):
        """An order with zero items must be rejected with 400."""
        _seed_session_table(db_session)
        db_session.commit()

        resp = client.post(
            "/api/v1/customer-orders/customer/table/A1/orders",
            json={"source": "qr", "items": []},
        )
        assert resp.status_code == 400

    def test_inactive_item_returns_400(self, client, db_session):
        """Ordering an inactive menu item must fail with 400."""
        _seed_session_table(db_session)

        category = MenuCategory(
            name="Hidden", display_order=99,
            production_station=ProductionStation.none,
        )
        db_session.add(category)
        db_session.flush()

        inactive_item = MenuItem(
            name="Off Menu", price=Decimal("5.00"),
            category_id=category.id,
            item_type=MenuItemType.regular,
            is_active=False,
            is_bundle=False,
        )
        db_session.add(inactive_item)
        db_session.commit()

        resp = client.post(
            "/api/v1/customer-orders/customer/table/A1/orders",
            json={"source": "qr", "items": [{"menu_item_id": inactive_item.id, "quantity": 1}]},
        )
        assert resp.status_code == 400


# ---------------------------------------------------------------------------
# 2. Maid-service pricing
# ---------------------------------------------------------------------------

class TestMaidServicePricing:
    """Verifies calculate_order_item_price logic end-to-end via the order API."""

    def _seed_maid_service_item(self, db, session: SessionModel,
                                base_price: str, additional_price: str,
                                all_maids_price: str | None = None) -> MenuItem:
        item = MenuItem(
            name="Maid Dance",
            price=Decimal(base_price),
            item_type=MenuItemType.maid_service,
            is_active=True,
            is_bundle=False,
        )
        db.add(item)
        db.flush()
        pricing = MaidServicePricing(
            menu_item_id=item.id,
            additional_maid_price=Decimal(additional_price),
            all_maids_price=Decimal(all_maids_price) if all_maids_price else None,
        )
        db.add(pricing)
        db.flush()
        return item

    def test_single_maid_base_price(self, client, db_session):
        """Selecting exactly 1 maid → unit_price = base_price."""
        session, _, _ = _seed_session_table(db_session)
        maid = _seed_maid(db_session, session, "Alice")
        item = self._seed_maid_service_item(
            db_session, session,
            base_price="20.00", additional_price="10.00",
        )
        db_session.commit()

        resp = client.post(
            "/api/v1/customer-orders/customer/table/A1/orders",
            json={
                "source": "qr",
                "items": [{
                    "menu_item_id": item.id,
                    "quantity": 1,
                    "selected_maid_ids": [maid.id],
                }],
            },
        )
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["items"][0]["unit_price"] == "20.00"
        assert body["items"][0]["total_price"] == "20.00"

    def test_two_maids_additional_price_added(self, client, db_session):
        """Selecting 2 maids → unit_price = base + 1 * additional."""
        session, _, _ = _seed_session_table(db_session)
        maid1 = _seed_maid(db_session, session, "Alice")
        maid2 = _seed_maid(db_session, session, "Betty")
        item = self._seed_maid_service_item(
            db_session, session,
            base_price="20.00", additional_price="10.00",
        )
        db_session.commit()

        resp = client.post(
            "/api/v1/customer-orders/customer/table/A1/orders",
            json={
                "source": "qr",
                "items": [{
                    "menu_item_id": item.id,
                    "quantity": 1,
                    "selected_maid_ids": [maid1.id, maid2.id],
                }],
            },
        )
        assert resp.status_code == 200, resp.text
        body = resp.json()
        # base(20) + 1 * additional(10) = 30
        assert body["items"][0]["unit_price"] == "30.00"

    def test_three_maids_all_maids_price_cap(self, client, db_session):
        """When ALL available maids are selected and all_maids_price is lower,
        the cap applies: unit_price = all_maids_price."""
        session, _, _ = _seed_session_table(db_session)
        maid1 = _seed_maid(db_session, session, "Alice")
        maid2 = _seed_maid(db_session, session, "Betty")
        maid3 = _seed_maid(db_session, session, "Carol")
        # Without cap: base(20) + 2 * additional(10) = 40
        # With cap:    all_maids_price = 35 < 40  → 35 applies
        item = self._seed_maid_service_item(
            db_session, session,
            base_price="20.00", additional_price="10.00",
            all_maids_price="35.00",
        )
        db_session.commit()

        resp = client.post(
            "/api/v1/customer-orders/customer/table/A1/orders",
            json={
                "source": "qr",
                "items": [{
                    "menu_item_id": item.id,
                    "quantity": 1,
                    "selected_maid_ids": [maid1.id, maid2.id, maid3.id],
                }],
            },
        )
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["items"][0]["unit_price"] == "35.00"

    def test_partial_maids_no_cap(self, client, db_session):
        """Selecting only 2 of 3 maids: all_maids_price cap does NOT apply."""
        session, _, _ = _seed_session_table(db_session)
        maid1 = _seed_maid(db_session, session, "Alice")
        maid2 = _seed_maid(db_session, session, "Betty")
        _seed_maid(db_session, session, "Carol")  # available but not selected
        # Without cap: base(20) + 1 * additional(10) = 30
        # all_maids_price = 35, but we didn't select all → cap does not apply
        item = self._seed_maid_service_item(
            db_session, session,
            base_price="20.00", additional_price="10.00",
            all_maids_price="35.00",
        )
        db_session.commit()

        resp = client.post(
            "/api/v1/customer-orders/customer/table/A1/orders",
            json={
                "source": "qr",
                "items": [{
                    "menu_item_id": item.id,
                    "quantity": 1,
                    "selected_maid_ids": [maid1.id, maid2.id],
                }],
            },
        )
        assert resp.status_code == 200, resp.text
        body = resp.json()
        # 2 of 3 maids selected → no cap → 20 + 10 = 30
        assert body["items"][0]["unit_price"] == "30.00"

    def test_maid_service_no_maid_selected_returns_400(self, client, db_session):
        """Placing a maid-service item without selecting any maid must be rejected."""
        session, _, _ = _seed_session_table(db_session)
        _seed_maid(db_session, session, "Alice")
        item = self._seed_maid_service_item(
            db_session, session,
            base_price="20.00", additional_price="10.00",
        )
        db_session.commit()

        resp = client.post(
            "/api/v1/customer-orders/customer/table/A1/orders",
            json={
                "source": "qr",
                "items": [{"menu_item_id": item.id, "quantity": 1, "selected_maid_ids": []}],
            },
        )
        assert resp.status_code == 400

    def test_bill_total_with_quantity_multiplier(self, client, db_session):
        """unit_price * quantity gives correct total_price (2 maids, qty=3)."""
        session, _, _ = _seed_session_table(db_session)
        maid1 = _seed_maid(db_session, session, "Alice")
        maid2 = _seed_maid(db_session, session, "Betty")
        item = self._seed_maid_service_item(
            db_session, session,
            base_price="20.00", additional_price="10.00",
        )
        db_session.commit()

        resp = client.post(
            "/api/v1/customer-orders/customer/table/A1/orders",
            json={
                "source": "qr",
                "items": [{
                    "menu_item_id": item.id,
                    "quantity": 3,
                    "selected_maid_ids": [maid1.id, maid2.id],
                }],
            },
        )
        assert resp.status_code == 200, resp.text
        body = resp.json()
        # unit = 30, qty = 3, total = 90
        assert body["items"][0]["unit_price"] == "30.00"
        assert body["items"][0]["total_price"] == "90.00"
        assert body["bill_total"] == "90.00"


# ---------------------------------------------------------------------------
# 3. Production task splitting
# ---------------------------------------------------------------------------

class TestProductionTaskSplitting:
    """Ensures ProductionTask rows are created with the right station when
    ordering items whose category has production_station = kitchen or bar."""

    def test_kitchen_item_creates_kitchen_task(self, client, db_session):
        """A regular item in a kitchen-station category → 1 kitchen task."""
        _seed_session_table(db_session)

        kitchen_cat = MenuCategory(
            name="Kitchen", display_order=1,
            production_station=ProductionStation.kitchen,
        )
        db_session.add(kitchen_cat)
        db_session.flush()

        item = _seed_regular_item(db_session, kitchen_cat, "Pasta", "12.00")
        db_session.commit()

        resp = client.post(
            "/api/v1/customer-orders/customer/table/A1/orders",
            json={"source": "qr", "items": [{"menu_item_id": item.id, "quantity": 2}]},
        )
        assert resp.status_code == 200, resp.text

        tasks = db_session.execute(select(ProductionTask)).scalars().all()
        assert len(tasks) == 1
        assert tasks[0].station == ProductionStation.kitchen
        assert tasks[0].quantity == 2
        assert tasks[0].display_name == "Pasta"

    def test_bar_item_creates_bar_task(self, client, db_session):
        """A regular item in a bar-station category → 1 bar task."""
        _seed_session_table(db_session)

        bar_cat = MenuCategory(
            name="Bar", display_order=2,
            production_station=ProductionStation.bar,
        )
        db_session.add(bar_cat)
        db_session.flush()

        item = _seed_regular_item(db_session, bar_cat, "Cocktail", "15.00")
        db_session.commit()

        resp = client.post(
            "/api/v1/customer-orders/customer/table/A1/orders",
            json={"source": "qr", "items": [{"menu_item_id": item.id, "quantity": 1}]},
        )
        assert resp.status_code == 200, resp.text

        tasks = db_session.execute(select(ProductionTask)).scalars().all()
        assert len(tasks) == 1
        assert tasks[0].station == ProductionStation.bar

    def test_no_station_item_no_task(self, client, db_session):
        """A regular item in a none-station category → no ProductionTask rows."""
        _seed_session_table(db_session)

        none_cat = MenuCategory(
            name="No Station", display_order=3,
            production_station=ProductionStation.none,
        )
        db_session.add(none_cat)
        db_session.flush()

        item = _seed_regular_item(db_session, none_cat, "Service", "0.00")
        db_session.commit()

        resp = client.post(
            "/api/v1/customer-orders/customer/table/A1/orders",
            json={"source": "qr", "items": [{"menu_item_id": item.id, "quantity": 1}]},
        )
        assert resp.status_code == 200, resp.text

        tasks = db_session.execute(select(ProductionTask)).scalars().all()
        assert len(tasks) == 0

    def test_bundle_components_each_create_task(self, client, db_session):
        """Bundle with a kitchen component + bar component → 2 tasks, one per station."""
        _seed_session_table(db_session)

        kitchen_cat = MenuCategory(
            name="Kitchen", display_order=1,
            production_station=ProductionStation.kitchen,
        )
        bar_cat = MenuCategory(
            name="Bar", display_order=2,
            production_station=ProductionStation.bar,
        )
        db_session.add_all([kitchen_cat, bar_cat])
        db_session.flush()

        food_component = _seed_regular_item(db_session, kitchen_cat, "Sandwich", "8.00")
        drink_component = _seed_regular_item(db_session, bar_cat, "Juice", "5.00")

        # Bundle item itself has no category (station = none; tasks come from components)
        bundle = MenuItem(
            name="Combo Set",
            price=Decimal("13.00"),
            item_type=MenuItemType.regular,
            is_active=True,
            is_bundle=True,
        )
        db_session.add(bundle)
        db_session.flush()

        db_session.add(MenuItemComponent(
            parent_menu_item_id=bundle.id,
            component_menu_item_id=food_component.id,
            quantity=1,
        ))
        db_session.add(MenuItemComponent(
            parent_menu_item_id=bundle.id,
            component_menu_item_id=drink_component.id,
            quantity=1,
        ))
        db_session.flush()
        db_session.commit()

        resp = client.post(
            "/api/v1/customer-orders/customer/table/A1/orders",
            json={"source": "qr", "items": [{"menu_item_id": bundle.id, "quantity": 1}]},
        )
        assert resp.status_code == 200, resp.text

        tasks = db_session.execute(select(ProductionTask)).scalars().all()
        assert len(tasks) == 2
        stations = {t.station for t in tasks}
        assert ProductionStation.kitchen in stations
        assert ProductionStation.bar in stations

    def test_bundle_component_quantity_multiplied(self, client, db_session):
        """Bundle ordered qty=2 with component.quantity=3 → task.quantity = 6."""
        _seed_session_table(db_session)

        kitchen_cat = MenuCategory(
            name="Kitchen", display_order=1,
            production_station=ProductionStation.kitchen,
        )
        db_session.add(kitchen_cat)
        db_session.flush()

        food_component = _seed_regular_item(db_session, kitchen_cat, "Bun", "3.00")

        bundle = MenuItem(
            name="Pack of Buns",
            price=Decimal("9.00"),
            item_type=MenuItemType.regular,
            is_active=True,
            is_bundle=True,
        )
        db_session.add(bundle)
        db_session.flush()

        db_session.add(MenuItemComponent(
            parent_menu_item_id=bundle.id,
            component_menu_item_id=food_component.id,
            quantity=3,  # 3 buns per bundle
        ))
        db_session.flush()
        db_session.commit()

        resp = client.post(
            "/api/v1/customer-orders/customer/table/A1/orders",
            json={"source": "qr", "items": [{"menu_item_id": bundle.id, "quantity": 2}]},
        )
        assert resp.status_code == 200, resp.text

        tasks = db_session.execute(select(ProductionTask)).scalars().all()
        assert len(tasks) == 1
        # ordered_quantity(2) * component.quantity(3) = 6
        assert tasks[0].quantity == 6

    def test_bundle_none_station_component_no_task(self, client, db_session):
        """Bundle component with station=none should not generate a task."""
        _seed_session_table(db_session)

        none_cat = MenuCategory(
            name="No Station", display_order=1,
            production_station=ProductionStation.none,
        )
        db_session.add(none_cat)
        db_session.flush()

        no_station_comp = _seed_regular_item(db_session, none_cat, "Card", "0.00")

        bundle = MenuItem(
            name="Gift Bundle",
            price=Decimal("5.00"),
            item_type=MenuItemType.regular,
            is_active=True,
            is_bundle=True,
        )
        db_session.add(bundle)
        db_session.flush()

        db_session.add(MenuItemComponent(
            parent_menu_item_id=bundle.id,
            component_menu_item_id=no_station_comp.id,
            quantity=1,
        ))
        db_session.flush()
        db_session.commit()

        resp = client.post(
            "/api/v1/customer-orders/customer/table/A1/orders",
            json={"source": "qr", "items": [{"menu_item_id": bundle.id, "quantity": 1}]},
        )
        assert resp.status_code == 200, resp.text

        tasks = db_session.execute(select(ProductionTask)).scalars().all()
        assert len(tasks) == 0


# ---------------------------------------------------------------------------
# 4. Table / session-table CRUD
# ---------------------------------------------------------------------------

class TestTableSessionTableCRUD:
    """Covers table creation, listing, updating, and session-table assignment."""

    def _seed_active_session(self, db) -> SessionModel:
        session = SessionModel(
            name="CRUD Test Session",
            service_date=date.today(),
            status=SessionStatus.active,
        )
        db.add(session)
        db.commit()
        db.refresh(session)
        return session

    def test_create_table_returns_table(self, client, db_session):
        """POST /api/v1/tables creates and returns a table."""
        resp = client.post(
            "/api/v1/tables/",
            json={"code": "B1", "seats": 4, "is_active": True, "is_shareable": False},
        )
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["code"] == "B1"
        assert body["seats"] == 4
        assert "id" in body

    def test_list_tables_returns_created(self, client, db_session):
        """GET /api/v1/tables lists all tables including newly created ones."""
        client.post(
            "/api/v1/tables/",
            json={"code": "C1", "seats": 2},
        )
        resp = client.get("/api/v1/tables/")
        assert resp.status_code == 200, resp.text
        codes = [t["code"] for t in resp.json()]
        assert "C1" in codes

    def test_duplicate_code_returns_400(self, client, db_session):
        """Creating two tables with the same code must be rejected."""
        client.post("/api/v1/tables/", json={"code": "DUP", "seats": 2})
        resp = client.post("/api/v1/tables/", json={"code": "DUP", "seats": 4})
        assert resp.status_code == 400

    def test_update_table_seats(self, client, db_session):
        """PATCH /api/v1/tables/{id} can update seat count."""
        r = client.post("/api/v1/tables/", json={"code": "E1", "seats": 2})
        table_id = r.json()["id"]

        resp = client.patch(f"/api/v1/tables/{table_id}", json={"seats": 8})
        assert resp.status_code == 200
        assert resp.json()["seats"] == 8

    def test_delete_table(self, client, db_session):
        """DELETE /api/v1/tables/{id} removes the table."""
        r = client.post("/api/v1/tables/", json={"code": "F1", "seats": 2})
        table_id = r.json()["id"]

        resp = client.delete(f"/api/v1/tables/{table_id}")
        assert resp.status_code == 200
        assert resp.json()["deleted_id"] == table_id

        # Confirm absence via list
        tables = client.get("/api/v1/tables/").json()
        assert all(t["id"] != table_id for t in tables)

    def _get_session_table_id(self, client, session_id: int, table_code: str) -> int:
        """Retrieve the auto-created session-table id for a given session + table code."""
        rows = client.get(
            f"/api/v1/tables/session-tables?session_id={session_id}"
        ).json()
        for row in rows:
            if row["table_code"] == table_code:
                return row["id"]
        raise AssertionError(
            f"No session-table found for session={session_id} table_code={table_code}"
        )

    def test_add_table_to_session_via_post(self, client, db_session):
        """POST /api/v1/tables creates a table and auto-links it to the active session.
        Verify the link is present via GET session-tables."""
        session = self._seed_active_session(db_session)

        r = client.post("/api/v1/tables/", json={"code": "G1", "seats": 4})
        assert r.status_code == 200, r.text
        table_id = r.json()["id"]

        # The POST /tables/ endpoint auto-creates a SessionTable when a session is active.
        rows = client.get(f"/api/v1/tables/session-tables?session_id={session.id}").json()
        codes = [row["table_code"] for row in rows]
        assert "G1" in codes

        matching = next(row for row in rows if row["table_code"] == "G1")
        assert matching["session_id"] == session.id
        assert matching["status"] == "available"
        assert matching["table_id"] == table_id

    def test_add_table_with_party_sets_occupied(self, client, db_session):
        """PATCH session-table with current_party_size > 0 sets status=occupied.

        (POST /tables auto-creates the session-table with size=0; we then PATCH it.)
        """
        session = self._seed_active_session(db_session)

        client.post("/api/v1/tables/", json={"code": "H1", "seats": 4})
        st_id = self._get_session_table_id(client, session.id, "H1")

        resp = client.patch(
            f"/api/v1/tables/session-tables/{st_id}",
            json={"current_party_size": 2},
        )
        assert resp.status_code == 200
        assert resp.json()["status"] == "occupied"
        assert resp.json()["current_party_size"] == 2

    def test_list_session_tables(self, client, db_session):
        """GET /api/v1/tables/session-tables?session_id=X lists the session's tables."""
        session = self._seed_active_session(db_session)

        client.post("/api/v1/tables/", json={"code": "I1", "seats": 4})

        resp = client.get(f"/api/v1/tables/session-tables?session_id={session.id}")
        assert resp.status_code == 200
        codes = [t["table_code"] for t in resp.json()]
        assert "I1" in codes

    def test_update_session_table_party_size(self, client, db_session):
        """PATCH /api/v1/tables/session-tables/{id} can update current_party_size."""
        session = self._seed_active_session(db_session)

        client.post("/api/v1/tables/", json={"code": "J1", "seats": 6})
        st_id = self._get_session_table_id(client, session.id, "J1")

        resp = client.patch(
            f"/api/v1/tables/session-tables/{st_id}",
            json={"current_party_size": 4},
        )
        assert resp.status_code == 200
        assert resp.json()["current_party_size"] == 4
        assert resp.json()["status"] == "occupied"

    def test_update_party_size_to_zero_sets_available(self, client, db_session):
        """Setting current_party_size to 0 changes status back to available."""
        session = self._seed_active_session(db_session)

        client.post("/api/v1/tables/", json={"code": "K1", "seats": 4})
        st_id = self._get_session_table_id(client, session.id, "K1")

        # First set to occupied
        client.patch(
            f"/api/v1/tables/session-tables/{st_id}",
            json={"current_party_size": 3},
        )

        resp = client.patch(
            f"/api/v1/tables/session-tables/{st_id}",
            json={"current_party_size": 0},
        )
        assert resp.status_code == 200
        assert resp.json()["status"] == "available"

    def test_exceed_seats_returns_400(self, client, db_session):
        """Trying to seat more guests than the table has must return 400."""
        session = self._seed_active_session(db_session)

        client.post("/api/v1/tables/", json={"code": "L1", "seats": 2})
        st_id = self._get_session_table_id(client, session.id, "L1")

        resp = client.patch(
            f"/api/v1/tables/session-tables/{st_id}",
            json={"current_party_size": 5},
        )
        assert resp.status_code == 400

    def test_create_table_auto_links_active_session(self, client, db_session):
        """When an active session exists, POST /tables auto-creates a SessionTable row."""
        session = self._seed_active_session(db_session)

        r = client.post(
            "/api/v1/tables/",
            json={"code": "M1", "seats": 4, "is_active": True},
        )
        assert r.status_code == 200
        table_id = r.json()["id"]

        # Verify the SessionTable was auto-created
        st = db_session.execute(
            select(SessionTable).where(
                SessionTable.session_id == session.id,
                SessionTable.table_id == table_id,
            )
        ).scalars().first()
        assert st is not None
        assert st.status == SessionTableStatus.available

    def test_duplicate_session_table_returns_400(self, client, db_session):
        """Manually POSTing a session-table for a table already linked to the session
        must be rejected with 400 (duplicate constraint)."""
        session = self._seed_active_session(db_session)

        # POST /tables/ auto-creates a SessionTable for the active session.
        r = client.post("/api/v1/tables/", json={"code": "N1", "seats": 4})
        table_id = r.json()["id"]

        # Trying to manually add the same (session, table) again must fail.
        payload = {"session_id": session.id, "table_id": table_id, "current_party_size": 0}
        resp = client.post("/api/v1/tables/session-tables", json=payload)
        assert resp.status_code == 400

    def test_explicit_session_table_post_without_active_session(self, client, db_session):
        """POST /api/v1/tables/session-tables manually links a table when there is no
        active session (so auto-link did not fire during table creation)."""
        # Create a session but keep it scheduled (not active)
        session = SessionModel(
            name="Manual Link Session",
            service_date=date.today(),
            status=SessionStatus.scheduled,
        )
        db_session.add(session)
        db_session.commit()
        db_session.refresh(session)

        r = client.post("/api/v1/tables/", json={"code": "O1", "seats": 4})
        assert r.status_code == 200
        table_id = r.json()["id"]

        # No active session → auto-link should NOT have fired
        rows_before = client.get(
            f"/api/v1/tables/session-tables?session_id={session.id}"
        ).json()
        assert len(rows_before) == 0, "No auto-link expected for scheduled session"

        # Manually link it
        resp = client.post(
            "/api/v1/tables/session-tables",
            json={"session_id": session.id, "table_id": table_id, "current_party_size": 0},
        )
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["table_code"] == "O1"
        assert body["session_id"] == session.id
        assert body["status"] == "available"


# ---------------------------------------------------------------------------
# 5. Bug fix: customer order sets session_table status to occupied (Bug 5)
# ---------------------------------------------------------------------------

class TestOrderSetsTableOccupied:
    """When a customer places the first order on an available table, the
    session_table.status must transition from 'available' to 'occupied'."""

    def test_first_order_sets_table_occupied(self, client, db_session):
        """After the first POST /orders on an available table the session_table
        must be occupied."""
        _, _, st = _seed_session_table(db_session)
        assert st.status == SessionTableStatus.available

        category = MenuCategory(
            name="Drinks", display_order=1,
            production_station=ProductionStation.none,
        )
        db_session.add(category)
        db_session.flush()
        item = _seed_regular_item(db_session, category, "Tea", "5.00")
        db_session.commit()

        resp = client.post(
            "/api/v1/customer-orders/customer/table/A1/orders",
            json={"source": "qr", "items": [{"menu_item_id": item.id, "quantity": 1}]},
        )
        assert resp.status_code == 200, resp.text

        db_session.expire(st)
        assert st.status == SessionTableStatus.occupied

    def test_second_order_table_stays_occupied(self, client, db_session):
        """Subsequent orders on an already-occupied table leave status occupied."""
        _, _, st = _seed_session_table(db_session)

        category = MenuCategory(
            name="Food", display_order=1,
            production_station=ProductionStation.none,
        )
        db_session.add(category)
        db_session.flush()
        item = _seed_regular_item(db_session, category, "Cake", "8.00")
        db_session.commit()

        # First order
        client.post(
            "/api/v1/customer-orders/customer/table/A1/orders",
            json={"source": "qr", "items": [{"menu_item_id": item.id, "quantity": 1}]},
        )
        db_session.expire(st)
        assert st.status == SessionTableStatus.occupied

        # Second order – must remain occupied, not reset to some other state
        resp = client.post(
            "/api/v1/customer-orders/customer/table/A1/orders",
            json={"source": "qr", "items": [{"menu_item_id": item.id, "quantity": 2}]},
        )
        assert resp.status_code == 200, resp.text
        db_session.expire(st)
        assert st.status == SessionTableStatus.occupied
