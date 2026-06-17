from collections import defaultdict
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.bill import Bill
from app.models.enums import ProductionStation, ProductionStatus
from app.models.menu import MenuItem
from app.models.order import Order, OrderItem, ProductionTask
from app.models.table import SessionTable, Table
from app.schemas.production import (
    PickupOrderListResponse,
    PickupOrderRead,
    PickupOrderResult,
    PickupTaskRead,
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


def _task_statement():
    return (
        select(ProductionTask, OrderItem, Order, Bill, Table, MenuItem)
        .join(OrderItem, OrderItem.id == ProductionTask.order_item_id)
        .join(Order, Order.id == OrderItem.order_id)
        .join(Bill, Bill.id == Order.bill_id)
        .join(SessionTable, SessionTable.id == Bill.session_table_id)
        .join(Table, Table.id == SessionTable.table_id)
        .join(MenuItem, MenuItem.id == OrderItem.menu_item_id)
    )


def _read_task(row) -> ProductionQueueItemRead:
    task, order_item, order, bill, table, parent_item = row
    return ProductionQueueItemRead(
        production_task_id=task.id,
        order_item_id=order_item.id,
        order_id=order.id,
        bill_id=bill.id,
        table_code=table.code,
        parent_menu_item_id=parent_item.id,
        parent_menu_item_name=parent_item.name,
        source_menu_item_id=task.source_menu_item_id,
        display_name=task.display_name,
        quantity=task.quantity,
        notes=task.notes,
        source=order.source,
        station=task.station,
        production_status=task.status,
        ordered_at=task.created_at,
        picked_up_at=task.picked_up_at,
    )


@router.get("/pickup/orders", response_model=PickupOrderListResponse)
def get_pickup_orders(db: Session = Depends(get_db)):
    current_session = get_current_active_session(db)
    if not current_session:
        raise HTTPException(status_code=404, detail="No active session found.")

    rows = db.execute(
        _task_statement()
        .where(
            SessionTable.session_id == current_session.id,
            ProductionTask.picked_up_at.is_(None),
        )
        .order_by(Order.created_at.asc(), ProductionTask.id.asc())
    ).all()

    grouped = defaultdict(list)
    order_meta = {}

    for row in rows:
        task, order_item, order, bill, table, parent_item = row
        grouped[order.id].append(task)
        order_meta[order.id] = (order, bill, table)

    pickup_orders = []

    for order_id, tasks in grouped.items():
        # Do not alert maids until at least one station has completed something.
        if not any(task.status == ProductionStatus.completed for task in tasks):
            continue

        order, bill, table = order_meta[order_id]
        all_completed = all(
            task.status == ProductionStatus.completed for task in tasks
        )
        waiting_count = sum(
            task.status != ProductionStatus.completed for task in tasks
        )

        pickup_orders.append(
            PickupOrderRead(
                order_id=order.id,
                bill_id=bill.id,
                table_code=table.code,
                ordered_at=order.created_at,
                all_completed=all_completed,
                waiting_count=waiting_count,
                tasks=[
                    PickupTaskRead(
                        production_task_id=task.id,
                        display_name=task.display_name,
                        quantity=task.quantity,
                        station=task.station,
                        production_status=task.status,
                        notes=task.notes,
                    )
                    for task in tasks
                ],
            )
        )

    return PickupOrderListResponse(
        session_id=current_session.id,
        session_name=current_session.name,
        orders=pickup_orders,
    )


@router.post(
    "/pickup/orders/{order_id}",
    response_model=PickupOrderResult,
)
def mark_order_picked_up(
    order_id: int,
    db: Session = Depends(get_db),
):
    tasks = list(
        db.execute(
            select(ProductionTask)
            .join(OrderItem, OrderItem.id == ProductionTask.order_item_id)
            .where(OrderItem.order_id == order_id)
            .order_by(ProductionTask.id.asc())
        )
        .scalars()
        .all()
    )

    if not tasks:
        raise HTTPException(
            status_code=404,
            detail="No production tasks found for this order.",
        )

    unfinished = [
        task
        for task in tasks
        if task.status != ProductionStatus.completed
    ]

    if unfinished:
        details = ", ".join(
            f"{task.display_name} ({task.station.value}: {task.status.value})"
            for task in unfinished
        )
        raise HTTPException(
            status_code=409,
            detail=(
                "This order cannot be picked up yet. "
                f"Kitchen/Bar still has unfinished items: {details}"
            ),
        )

    picked_up_at = datetime.utcnow()

    for task in tasks:
        task.picked_up_at = picked_up_at

    db.commit()

    return PickupOrderResult(
        order_id=order_id,
        picked_up_at=picked_up_at,
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
        _task_statement()
        .where(
            SessionTable.session_id == current_session.id,
            ProductionTask.station == station,
        )
        .order_by(ProductionTask.created_at.asc(), ProductionTask.id.asc())
    )

    if not include_completed:
        statement = statement.where(
            ProductionTask.status != ProductionStatus.completed
        )

    rows = db.execute(statement).all()

    return ProductionQueueResponse(
        session_id=current_session.id,
        session_name=current_session.name,
        station=station,
        items=[_read_task(row) for row in rows],
    )


@router.patch(
    "/tasks/{production_task_id}/status",
    response_model=ProductionQueueItemRead,
)
def update_production_status(
    production_task_id: int,
    payload: ProductionStatusUpdate,
    db: Session = Depends(get_db),
):
    row = db.execute(
        _task_statement().where(ProductionTask.id == production_task_id)
    ).first()

    if not row:
        raise HTTPException(status_code=404, detail="Production task not found.")

    task = row[0]
    task.status = payload.production_status

    # Reopening an item means it is no longer considered picked up.
    if payload.production_status != ProductionStatus.completed:
        sibling_tasks = list(
            db.execute(
                select(ProductionTask)
                .join(OrderItem, OrderItem.id == ProductionTask.order_item_id)
                .where(OrderItem.order_id == row[2].id)
            )
            .scalars()
            .all()
        )
        for sibling in sibling_tasks:
            sibling.picked_up_at = None

    db.commit()
    db.refresh(task)

    return _read_task((task, *row[1:]))
