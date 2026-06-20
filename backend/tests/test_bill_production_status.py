"""
Tests for bill item production_status aggregation (Task C).

The _aggregate_production_status function (in customer_orders.py) derives a
single status from all ProductionTask rows for an OrderItem:
  - No tasks            → None
  - All completed       → "completed"
  - Any preparing       → "preparing"
  - Otherwise (pending) → "pending"
"""

import pytest
from unittest.mock import MagicMock

from app.api.v1.endpoints.customer_orders import _aggregate_production_status
from app.models.enums import ProductionStatus


def _make_item_with_tasks(*statuses: str):
    """Return a mock OrderItem whose production_tasks have the given statuses."""
    item = MagicMock()
    item.production_tasks = [
        MagicMock(status=ProductionStatus(s)) for s in statuses
    ]
    return item


class TestAggregateProductionStatus:
    def test_no_tasks_returns_none(self):
        item = MagicMock()
        item.production_tasks = []
        assert _aggregate_production_status(item) is None

    def test_all_completed_returns_completed(self):
        item = _make_item_with_tasks("completed", "completed")
        assert _aggregate_production_status(item) == "completed"

    def test_single_completed_returns_completed(self):
        item = _make_item_with_tasks("completed")
        assert _aggregate_production_status(item) == "completed"

    def test_all_pending_returns_pending(self):
        item = _make_item_with_tasks("pending", "pending")
        assert _aggregate_production_status(item) == "pending"

    def test_single_pending_returns_pending(self):
        item = _make_item_with_tasks("pending")
        assert _aggregate_production_status(item) == "pending"

    def test_all_preparing_returns_preparing(self):
        item = _make_item_with_tasks("preparing", "preparing")
        assert _aggregate_production_status(item) == "preparing"

    def test_mixed_pending_and_preparing_returns_preparing(self):
        """Any preparing beats all-pending."""
        item = _make_item_with_tasks("pending", "preparing")
        assert _aggregate_production_status(item) == "preparing"

    def test_mixed_preparing_and_completed_returns_preparing(self):
        """Any preparing beats all-completed."""
        item = _make_item_with_tasks("preparing", "completed")
        assert _aggregate_production_status(item) == "preparing"

    def test_mixed_pending_and_completed_returns_pending(self):
        """Not all completed, none preparing → pending."""
        item = _make_item_with_tasks("pending", "completed")
        assert _aggregate_production_status(item) == "pending"

    def test_all_three_statuses_returns_preparing(self):
        """Preparing takes highest priority."""
        item = _make_item_with_tasks("pending", "preparing", "completed")
        assert _aggregate_production_status(item) == "preparing"


class TestBillItemReadSchema:
    def test_production_status_field_exists_and_nullable(self):
        """BillItemRead must have production_status as Optional[str]."""
        from app.schemas.bill import BillItemRead
        from decimal import Decimal
        item = BillItemRead(
            order_item_id=1,
            menu_item_id=1,
            menu_item_name="Coffee",
            item_type="regular",
            quantity=1,
            unit_price=Decimal("5.00"),
            total_price=Decimal("5.00"),
        )
        # Default is None (no tasks)
        assert item.production_status is None

    def test_production_status_accepts_string_values(self):
        from app.schemas.bill import BillItemRead
        from decimal import Decimal
        for status in ("pending", "preparing", "completed"):
            item = BillItemRead(
                order_item_id=1,
                menu_item_id=1,
                menu_item_name="Coffee",
                item_type="regular",
                quantity=1,
                unit_price=Decimal("5.00"),
                total_price=Decimal("5.00"),
                production_status=status,
            )
            assert item.production_status == status
