from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.core.database import get_db
from app.models.bill import Bill
from app.models.enums import BillStatus
from app.models.order import Order, OrderItem

router = APIRouter(
    prefix="/staff/order-items",
    tags=["staff-order-items"],
)


class OrderItemQuantityUpdate(BaseModel):
    quantity: int = Field(ge=1)


def _get_editable_item(
    db: Session,
    order_item_id: int,
) -> tuple[OrderItem, Order, Bill]:
    order_item = (
        db.execute(
            select(OrderItem)
            .options(
                selectinload(OrderItem.production_tasks),
                selectinload(OrderItem.selected_maids),
                selectinload(OrderItem.menu_item),
            )
            .where(OrderItem.id == order_item_id)
        )
        .scalars()
        .first()
    )

    if not order_item:
        raise HTTPException(
            status_code=404,
            detail="Order item not found.",
        )

    order = db.get(Order, order_item.order_id)

    if not order:
        raise HTTPException(
            status_code=404,
            detail="Parent order not found.",
        )

    bill = db.get(Bill, order.bill_id)

    if not bill:
        raise HTTPException(
            status_code=404,
            detail="Bill not found.",
        )

    if bill.status == BillStatus.paid:
        raise HTTPException(
            status_code=409,
            detail="A paid bill cannot be edited.",
        )

    if bill.status == BillStatus.paying:
        raise HTTPException(
            status_code=409,
            detail=(
                "This bill is already in checkout. "
                "Return it to open status before editing items."
            ),
        )

    return order_item, order, bill


def _recalculate_bill(
    db: Session,
    bill: Bill,
) -> None:
    subtotal = db.scalar(
        select(
            func.coalesce(
                func.sum(OrderItem.total_price),
                0,
            )
        )
        .join(Order, Order.id == OrderItem.order_id)
        .where(Order.bill_id == bill.id)
    )

    bill.subtotal = Decimal(
        str(subtotal or 0)
    ).quantize(Decimal("0.01"))

    bill.tax = Decimal("0.00")
    bill.service_charge = Decimal("0.00")
    bill.total = (
        bill.subtotal
        + bill.tax
        + bill.service_charge
    ).quantize(Decimal("0.01"))


@router.patch("/{order_item_id}/quantity")
def update_order_item_quantity(
    order_item_id: int,
    payload: OrderItemQuantityUpdate,
    db: Session = Depends(get_db),
):
    order_item, _, bill = _get_editable_item(
        db,
        order_item_id,
    )

    old_quantity = order_item.quantity
    new_quantity = payload.quantity

    if new_quantity == old_quantity:
        return {
            "success": True,
            "order_item_id": order_item.id,
            "quantity": order_item.quantity,
            "unit_price": str(order_item.unit_price),
            "total_price": str(order_item.total_price),
            "bill_id": bill.id,
            "bill_subtotal": str(bill.subtotal),
            "bill_total": str(bill.total),
        }

    order_item.quantity = new_quantity
    order_item.total_price = (
        Decimal(order_item.unit_price)
        * new_quantity
    ).quantize(Decimal("0.01"))

    for task in order_item.production_tasks:
        if old_quantity > 0:
            per_parent_item = (
                Decimal(task.quantity)
                / Decimal(old_quantity)
            )

            new_task_quantity = (
                per_parent_item
                * Decimal(new_quantity)
            )

            task.quantity = max(
                1,
                int(new_task_quantity.to_integral_value()),
            )

    db.flush()
    _recalculate_bill(db, bill)
    db.commit()
    db.refresh(order_item)
    db.refresh(bill)

    return {
        "success": True,
        "order_item_id": order_item.id,
        "quantity": order_item.quantity,
        "unit_price": str(order_item.unit_price),
        "total_price": str(order_item.total_price),
        "bill_id": bill.id,
        "bill_subtotal": str(bill.subtotal),
        "bill_total": str(bill.total),
    }


@router.delete("/{order_item_id}")
def delete_order_item(
    order_item_id: int,
    db: Session = Depends(get_db),
):
    order_item, order, bill = _get_editable_item(
        db,
        order_item_id,
    )

    deleted_name = (
        order_item.menu_item.name
        if order_item.menu_item
        else "Item"
    )

    db.delete(order_item)
    db.flush()

    remaining_in_order = db.scalar(
        select(func.count(OrderItem.id)).where(
            OrderItem.order_id == order.id
        )
    )

    if not remaining_in_order:
        db.delete(order)
        db.flush()

    _recalculate_bill(db, bill)
    db.commit()
    db.refresh(bill)

    return {
        "success": True,
        "deleted_order_item_id": order_item_id,
        "deleted_name": deleted_name,
        "bill_id": bill.id,
        "bill_subtotal": str(bill.subtotal),
        "bill_total": str(bill.total),
    }
