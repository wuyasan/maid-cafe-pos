from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.orm import Session, joinedload

from app.models.bill import Bill
from app.models.enums import MenuItemType
from app.models.menu import MenuItem
from app.models.order import Order, OrderItem, OrderItemMaid
from app.models.maid import SessionMaid
from app.models.table import SessionTable
from app.schemas.order import CustomerOrderCreate
from app.services.bill_service import recalculate_bill_totals
from app.services.pricing_service import calculate_order_item_price


def _get_session_table_for_bill(db: Session, bill: Bill) -> SessionTable:
    session_table = (
        db.execute(
            select(SessionTable).where(SessionTable.id == bill.session_table_id)
        )
        .scalars()
        .first()
    )
    if not session_table:
        raise ValueError("Session table not found for bill.")
    return session_table


def _get_total_available_maid_count(db: Session, session_id: int) -> int:
    return (
        db.execute(
            select(func.count(SessionMaid.id)).where(
                SessionMaid.session_id == session_id,
                SessionMaid.is_available.is_(True),
            )
        )
        .scalar_one()
    )


def _validate_selected_maids_for_session(
    db: Session,
    session_id: int,
    selected_maid_ids: list[int],
) -> None:
    if not selected_maid_ids:
        raise ValueError("Maid service item requires maid selection.")

    valid_maid_ids = set(
        db.execute(
            select(SessionMaid.maid_id).where(
                SessionMaid.session_id == session_id,
                SessionMaid.is_available.is_(True),
                SessionMaid.maid_id.in_(selected_maid_ids),
            )
        )
        .scalars()
        .all()
    )

    if len(valid_maid_ids) != len(set(selected_maid_ids)):
        raise ValueError("One or more selected maids are not available in this session.")


def create_order_for_bill(
    db: Session,
    bill: Bill,
    payload: CustomerOrderCreate,
) -> Order:
    if not payload.items:
        raise ValueError("Order must contain at least one item.")

    session_table = _get_session_table_for_bill(db, bill)
    session_id = session_table.session_id
    total_available_maid_count = _get_total_available_maid_count(db, session_id)

    order = Order(
        bill_id=bill.id,
        source=payload.source,
    )
    db.add(order)
    db.flush()

    for line in payload.items:
        menu_item = (
            db.execute(
                select(MenuItem)
                .options(joinedload(MenuItem.maid_service_pricing))
                .where(MenuItem.id == line.menu_item_id)
            )
            .scalars()
            .first()
        )

        if not menu_item:
            raise ValueError(f"Menu item {line.menu_item_id} not found.")

        if not menu_item.is_active:
            raise ValueError(f'Menu item "{menu_item.name}" is inactive.')

        selected_maid_ids = line.selected_maid_ids or []

        if menu_item.item_type == MenuItemType.maid_service:
            _validate_selected_maids_for_session(
                db=db,
                session_id=session_id,
                selected_maid_ids=selected_maid_ids,
            )

            unit_price, total_price = calculate_order_item_price(
                menu_item=menu_item,
                quantity=line.quantity,
                selected_maid_count=len(selected_maid_ids),
                total_available_maid_count=total_available_maid_count,
            )
        else:
            unit_price, total_price = calculate_order_item_price(
                menu_item=menu_item,
                quantity=line.quantity,
                selected_maid_count=0,
                total_available_maid_count=0,
            )

        order_item = OrderItem(
            order_id=order.id,
            menu_item_id=menu_item.id,
            quantity=line.quantity,
            unit_price=Decimal(unit_price),
            total_price=Decimal(total_price),
            notes=line.notes,
        )
        db.add(order_item)
        db.flush()

        if menu_item.item_type == MenuItemType.maid_service:
            for maid_id in selected_maid_ids:
                db.add(
                    OrderItemMaid(
                        order_item_id=order_item.id,
                        maid_id=maid_id,
                    )
                )

    db.flush()

    bill = (
        db.execute(
            select(Bill)
            .options(
                joinedload(Bill.orders)
                .joinedload(Order.items)
            )
            .where(Bill.id == bill.id)
        )
        .scalars()
        .first()
    )

    recalculate_bill_totals(bill)
    db.flush()

    order = (
        db.execute(
            select(Order)
            .options(
                joinedload(Order.items).joinedload(OrderItem.selected_maids)
            )
            .where(Order.id == order.id)
        )
        .scalars()
        .first()
    )

    return order