from datetime import datetime
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.orm import Session, joinedload

from app.models.bill import Bill
from app.models.enums import MenuItemType, ProductionStation
from app.models.maid import SessionMaid
from app.models.menu import MenuItem
from app.models.order import Order, OrderItem, OrderItemMaid
from app.models.session import Session as SessionModel
from app.models.table import SessionTable
from app.schemas.order import CustomerOrderCreate
from app.services.bill_service import recalculate_bill_totals
from app.services.pricing_service import calculate_order_item_price


def _get_session_table_for_bill(db: Session, bill: Bill) -> SessionTable:
    session_table = db.execute(
        select(SessionTable).where(SessionTable.id == bill.session_table_id)
    ).scalars().first()
    if not session_table:
        raise ValueError("Session table not found for bill.")
    return session_table


def _get_session(db: Session, session_id: int) -> SessionModel:
    session = db.get(SessionModel, session_id)
    if not session:
        raise ValueError("Session not found.")
    return session


def _get_total_available_maid_count(db: Session, session_id: int) -> int:
    return db.execute(
        select(func.count(SessionMaid.id)).where(
            SessionMaid.session_id == session_id,
            SessionMaid.is_available.is_(True),
        )
    ).scalar_one()


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
        raise ValueError(
            "One or more selected maids are not available in this session."
        )


def _station_is_closed(
    session: SessionModel,
    station: ProductionStation,
    now: datetime,
) -> bool:
    if station == ProductionStation.none:
        return False

    cutoff = (
        session.kitchen_last_order_time
        if station == ProductionStation.kitchen
        else session.bar_last_order_time
    )
    if cutoff is None:
        return False

    if now.date() > session.service_date:
        return True
    if now.date() < session.service_date:
        return False

    return now.time().replace(tzinfo=None) >= cutoff


def _validate_station_ordering(
    session: SessionModel,
    menu_item: MenuItem,
) -> None:
    station = (
        menu_item.category.production_station
        if menu_item.category is not None
        else ProductionStation.none
    )
    if not _station_is_closed(session, station, datetime.now()):
        return

    station_name = "Kitchen" if station == ProductionStation.kitchen else "Bar"
    raise ValueError(
        f'{station_name} ordering is closed. "{menu_item.name}" can no longer be ordered.'
    )


def create_order_for_bill(
    db: Session,
    bill: Bill,
    payload: CustomerOrderCreate,
) -> Order:
    if not payload.items:
        raise ValueError("Order must contain at least one item.")

    session_table = _get_session_table_for_bill(db, bill)
    session_id = session_table.session_id
    session = _get_session(db, session_id)
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
                .options(
                    joinedload(MenuItem.maid_service_pricing),
                    joinedload(MenuItem.category),
                )
                .where(MenuItem.id == line.menu_item_id)
            )
            .unique()
            .scalars()
            .first()
        )
        if not menu_item:
            raise ValueError(f"Menu item {line.menu_item_id} not found.")
        if not menu_item.is_active:
            raise ValueError(f'Menu item "{menu_item.name}" is inactive.')

        _validate_station_ordering(session, menu_item)

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

    refreshed_bill = (
        db.execute(
            select(Bill)
            .options(joinedload(Bill.orders).joinedload(Order.items))
            .where(Bill.id == bill.id)
        )
        .unique()
        .scalars()
        .first()
    )
    recalculate_bill_totals(refreshed_bill)
    db.flush()

    return (
        db.execute(
            select(Order)
            .options(joinedload(Order.items).joinedload(OrderItem.selected_maids))
            .where(Order.id == order.id)
        )
        .unique()
        .scalars()
        .first()
    )
