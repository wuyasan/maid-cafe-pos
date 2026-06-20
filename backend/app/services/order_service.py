from datetime import datetime
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.orm import Session, joinedload, selectinload

from app.models.bill import Bill
from app.models.enums import MenuItemType, ProductionStation
from app.models.maid import SessionMaid
from app.models.menu import MenuItem, MenuItemComponent
from app.models.order import Order, OrderItem, OrderItemMaid, ProductionTask
from app.models.session import Session as SessionModel
from app.models.table import SessionTable
from app.schemas.order import CustomerOrderCreate
from app.core.time import now_in_cafe_tz
from app.services.bill_service import recalculate_bill_totals
from app.services.pricing_service import calculate_order_item_price


def _get_session_table_for_bill(db: Session, bill: Bill) -> SessionTable:
    row = db.execute(
        select(SessionTable).where(SessionTable.id == bill.session_table_id)
    ).scalars().first()
    if not row:
        raise ValueError("Session table not found for bill.")
    return row


def _get_session(db: Session, session_id: int) -> SessionModel:
    row = db.get(SessionModel, session_id)
    if not row:
        raise ValueError("Session not found.")
    return row


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

    valid = set(
        db.execute(
            select(SessionMaid.maid_id).where(
                SessionMaid.session_id == session_id,
                SessionMaid.is_available.is_(True),
                SessionMaid.maid_id.in_(selected_maid_ids),
            )
        ).scalars().all()
    )
    if len(valid) != len(set(selected_maid_ids)):
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
    # now may be timezone-aware (cafe tz); strip tzinfo for comparison with
    # the naive time stored in session.kitchen/bar_last_order_time.
    return now.time().replace(tzinfo=None) >= cutoff


def _validate_station(
    session: SessionModel,
    station: ProductionStation,
    item_name: str,
) -> None:
    if not _station_is_closed(session, station, now_in_cafe_tz()):
        return
    station_name = (
        "Kitchen" if station == ProductionStation.kitchen else "Bar"
    )
    raise ValueError(
        f'{station_name} ordering is closed. "{item_name}" can no longer be ordered.'
    )


def _validate_item_and_components_orderable(
    session: SessionModel,
    menu_item: MenuItem,
) -> None:
    if menu_item.is_bundle:
        if not menu_item.bundle_components:
            raise ValueError(f'Bundle "{menu_item.name}" has no components.')
        for link in menu_item.bundle_components:
            component = link.component_menu_item
            if not component.is_active:
                raise ValueError(
                    f'Bundle component "{component.name}" is inactive.'
                )
            station = (
                component.category.production_station
                if component.category is not None
                else ProductionStation.none
            )
            _validate_station(session, station, component.name)
        return

    station = (
        menu_item.category.production_station
        if menu_item.category is not None
        else ProductionStation.none
    )
    _validate_station(session, station, menu_item.name)


def _create_production_tasks(
    db: Session,
    order_item: OrderItem,
    menu_item: MenuItem,
    ordered_quantity: int,
    notes: str | None,
) -> None:
    if menu_item.is_bundle:
        for link in menu_item.bundle_components:
            component = link.component_menu_item
            station = (
                component.category.production_station
                if component.category is not None
                else ProductionStation.none
            )
            if station == ProductionStation.none:
                continue
            db.add(
                ProductionTask(
                    order_item_id=order_item.id,
                    source_menu_item_id=component.id,
                    station=station,
                    display_name=component.name,
                    quantity=ordered_quantity * link.quantity,
                    notes=notes,
                )
            )
        return

    station = (
        menu_item.category.production_station
        if menu_item.category is not None
        else ProductionStation.none
    )
    if station == ProductionStation.none:
        return
    db.add(
        ProductionTask(
            order_item_id=order_item.id,
            source_menu_item_id=menu_item.id,
            station=station,
            display_name=menu_item.name,
            quantity=ordered_quantity,
            notes=notes,
        )
    )


def _bundle_maid_surcharge_per_unit(
    menu_item: MenuItem,
    selected_maid_count: int,
    total_available_maid_count: int,
) -> Decimal:
    surcharge = Decimal("0.00")

    for link in menu_item.bundle_components:
        component = link.component_menu_item
        if component.item_type != MenuItemType.maid_service:
            continue

        pricing = component.maid_service_pricing
        if pricing is None:
            raise ValueError(
                f'Maid service component "{component.name}" is missing pricing config.'
            )

        if (
            pricing.all_maids_price is not None
            and total_available_maid_count > 0
            and selected_maid_count == total_available_maid_count
        ):
            per_component = max(
                Decimal(pricing.all_maids_price) - Decimal(component.price),
                Decimal("0.00"),
            )
        else:
            per_component = (
                Decimal(max(selected_maid_count - 1, 0))
                * Decimal(pricing.additional_maid_price or 0)
            )

        surcharge += per_component * link.quantity

    return surcharge


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
    total_available_maid_count = _get_total_available_maid_count(
        db, session_id
    )

    order = Order(bill_id=bill.id, source=payload.source)
    db.add(order)
    db.flush()

    for line in payload.items:
        menu_item = (
            db.execute(
                select(MenuItem)
                .options(
                    joinedload(MenuItem.maid_service_pricing),
                    joinedload(MenuItem.category),
                    selectinload(MenuItem.bundle_components)
                    .joinedload(MenuItemComponent.component_menu_item)
                    .joinedload(MenuItem.category),
                    selectinload(MenuItem.bundle_components)
                    .joinedload(MenuItemComponent.component_menu_item)
                    .joinedload(MenuItem.maid_service_pricing),
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
        if line.quantity < 1:
            raise ValueError("Quantity must be at least 1.")

        _validate_item_and_components_orderable(session, menu_item)

        selected_maid_ids = line.selected_maid_ids or []
        bundle_has_maid_service = (
            menu_item.is_bundle
            and any(
                link.component_menu_item.item_type
                == MenuItemType.maid_service
                for link in menu_item.bundle_components
            )
        )
        requires_maid_selection = (
            menu_item.item_type == MenuItemType.maid_service
            or bundle_has_maid_service
        )

        if requires_maid_selection:
            _validate_selected_maids_for_session(
                db,
                session_id,
                selected_maid_ids,
            )

        if menu_item.item_type == MenuItemType.maid_service:
            unit_price, total_price = calculate_order_item_price(
                menu_item=menu_item,
                quantity=line.quantity,
                selected_maid_count=len(selected_maid_ids),
                total_available_maid_count=total_available_maid_count,
            )
        elif bundle_has_maid_service:
            unit_price = (
                Decimal(menu_item.price)
                + _bundle_maid_surcharge_per_unit(
                    menu_item,
                    len(selected_maid_ids),
                    total_available_maid_count,
                )
            )
            total_price = unit_price * line.quantity
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

        _create_production_tasks(
            db,
            order_item,
            menu_item,
            line.quantity,
            line.notes,
        )

        if requires_maid_selection:
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
            .options(
                joinedload(Order.items).joinedload(
                    OrderItem.selected_maids
                )
            )
            .where(Order.id == order.id)
        )
        .unique()
        .scalars()
        .first()
    )
