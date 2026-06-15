from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.core.database import get_db
from app.models.bill import Bill
from app.models.order import Order, OrderItem, OrderItemMaid
from app.schemas.bill import BillDetailRead
from app.schemas.order import CustomerOrderCreate, OrderCreateResponse
from app.services.bill_service import (
    get_or_create_open_bill,
    get_session_table_by_table_code,
    recalculate_bill_totals,
)
from app.services.order_service import create_order_for_bill
from app.services.session_service import get_current_active_session

router = APIRouter(prefix="/customer", tags=["customer"])


@router.get("/table/{table_code}/bill", response_model=BillDetailRead)
def get_table_bill(table_code: str, db: Session = Depends(get_db)):
    current_session = get_current_active_session(db)
    if not current_session:
        raise HTTPException(status_code=404, detail="No active session found.")

    session_table = get_session_table_by_table_code(db, current_session.id, table_code)
    if not session_table:
        raise HTTPException(status_code=404, detail="Table not found in current session.")

    base_bill = get_or_create_open_bill(db, session_table.id)
    db.commit()

    bill = (
        db.execute(
            select(Bill)
            .options(
                joinedload(Bill.orders)
                .joinedload(Order.items)
                .joinedload(OrderItem.menu_item),
                joinedload(Bill.orders)
                .joinedload(Order.items)
                .joinedload(OrderItem.selected_maids)
                .joinedload(OrderItemMaid.maid),
            )
            .where(Bill.id == base_bill.id)
        )
        .scalars()
        .first()
    )

    items = []
    for order in bill.orders:
        for item in order.items:
            items.append(
                {
                    "order_item_id": item.id,
                    "menu_item_id": item.menu_item_id,
                    "menu_item_name": item.menu_item.name,
                    "item_type": item.menu_item.item_type.value,
                    "quantity": item.quantity,
                    "unit_price": item.unit_price,
                    "total_price": item.total_price,
                    "notes": item.notes,
                    "selected_maids": [
                        {
                            "id": sm.id,
                            "maid_id": sm.maid_id,
                            "maid_name": sm.maid.name,
                            "maid_photo_url": sm.maid.photo_url,
                        }
                        for sm in item.selected_maids
                    ],
                }
            )

    return BillDetailRead(
        id=bill.id,
        session_table_id=bill.session_table_id,
        status=bill.status,
        subtotal=bill.subtotal,
        tax=bill.tax,
        service_charge=bill.service_charge,
        total=bill.total,
        opened_at=bill.opened_at,
        closed_at=bill.closed_at,
        items=items,
    )


@router.post("/table/{table_code}/orders", response_model=OrderCreateResponse)
def create_customer_order(
    table_code: str,
    payload: CustomerOrderCreate,
    db: Session = Depends(get_db),
):
    current_session = get_current_active_session(db)
    if not current_session:
        raise HTTPException(status_code=404, detail="No active session found.")

    session_table = get_session_table_by_table_code(db, current_session.id, table_code)
    if not session_table:
        raise HTTPException(status_code=404, detail="Table not found in current session.")

    try:
        bill = get_or_create_open_bill(db, session_table.id)
        order = create_order_for_bill(db, bill, payload)

        db.refresh(bill)
        recalculate_bill_totals(bill)

        db.commit()
        db.refresh(order)
        db.refresh(bill)

        return {
            "order": order,
            "items": [
                {
                    "menu_item_id": item.menu_item_id,
                    "quantity": item.quantity,
                    "unit_price": item.unit_price,
                    "total_price": item.total_price,
                    "notes": item.notes,
                    "selected_maid_ids": [m.maid_id for m in item.selected_maids],
                }
                for item in order.items
            ],
            "bill_id": bill.id,
            "bill_total": bill.total,
        }
    except ValueError as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))