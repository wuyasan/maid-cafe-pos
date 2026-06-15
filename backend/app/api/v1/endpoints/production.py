from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.bill import Bill
from app.models.enums import ProductionStation, ProductionStatus
from app.models.menu import MenuCategory, MenuItem
from app.models.order import Order, OrderItem
from app.models.table import SessionTable, Table
from app.schemas.production import (
    ProductionQueueItemRead,
    ProductionQueueResponse,
    ProductionStatusUpdate,
)
from app.services.session_service import get_current_active_session

router = APIRouter(prefix="/staff/production", tags=["staff-production"])


def _validate_station(station: ProductionStation) -> None:
    if station == ProductionStation.none:
        raise HTTPException(
            status_code=400,
            detail="The none station does not have a production queue.",
        )


@router.get("/{station}", response_model=ProductionQueueResponse)
def get_production_queue(
    station: ProductionStation,
    include_completed: bool = Query(default=False),
    db: Session = Depends(get_db),
):
    _validate_station(station)

    current_session = get_current_active_session(db)
    if not current_session:
        raise HTTPException(status_code=404, detail="No active session found.")

    statement = (
        select(
            OrderItem,
            Order,
            Bill,
            Table,
            MenuItem,
            MenuCategory,
        )
        .join(Order, Order.id == OrderItem.order_id)
        .join(Bill, Bill.id == Order.bill_id)
        .join(SessionTable, SessionTable.id == Bill.session_table_id)
        .join(Table, Table.id == SessionTable.table_id)
        .join(MenuItem, MenuItem.id == OrderItem.menu_item_id)
        .join(MenuCategory, MenuCategory.id == MenuItem.category_id)
        .where(
            SessionTable.session_id == current_session.id,
            MenuCategory.production_station == station,
        )
        .order_by(OrderItem.created_at.asc(), OrderItem.id.asc())
    )

    if not include_completed:
        statement = statement.where(
            OrderItem.production_status != ProductionStatus.completed
        )

    rows = db.execute(statement).all()

    return ProductionQueueResponse(
        session_id=current_session.id,
        session_name=current_session.name,
        station=station,
        items=[
            ProductionQueueItemRead(
                order_item_id=order_item.id,
                order_id=order.id,
                bill_id=bill.id,
                table_code=table.code,
                menu_item_id=menu_item.id,
                menu_item_name=menu_item.name,
                quantity=order_item.quantity,
                notes=order_item.notes,
                source=order.source,
                station=category.production_station,
                production_status=order_item.production_status,
                ordered_at=order_item.created_at,
            )
            for order_item, order, bill, table, menu_item, category in rows
        ],
    )


@router.patch("/items/{order_item_id}/status", response_model=ProductionQueueItemRead)
def update_production_status(
    order_item_id: int,
    payload: ProductionStatusUpdate,
    db: Session = Depends(get_db),
):
    row = db.execute(
        select(OrderItem, Order, Bill, Table, MenuItem, MenuCategory)
        .join(Order, Order.id == OrderItem.order_id)
        .join(Bill, Bill.id == Order.bill_id)
        .join(SessionTable, SessionTable.id == Bill.session_table_id)
        .join(Table, Table.id == SessionTable.table_id)
        .join(MenuItem, MenuItem.id == OrderItem.menu_item_id)
        .join(MenuCategory, MenuCategory.id == MenuItem.category_id)
        .where(OrderItem.id == order_item_id)
    ).first()

    if not row:
        raise HTTPException(status_code=404, detail="Order item not found.")

    order_item, order, bill, table, menu_item, category = row
    if category.production_station == ProductionStation.none:
        raise HTTPException(
            status_code=400,
            detail="This item does not belong to a production station.",
        )

    order_item.production_status = payload.production_status
    db.commit()
    db.refresh(order_item)

    return ProductionQueueItemRead(
        order_item_id=order_item.id,
        order_id=order.id,
        bill_id=bill.id,
        table_code=table.code,
        menu_item_id=menu_item.id,
        menu_item_name=menu_item.name,
        quantity=order_item.quantity,
        notes=order_item.notes,
        source=order.source,
        station=category.production_station,
        production_status=order_item.production_status,
        ordered_at=order_item.created_at,
    )
