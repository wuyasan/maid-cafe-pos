from decimal import Decimal
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.time import utcnow
from app.models.bill import Bill
from app.models.enums import (
    BillStatus,
    DiscountType,
    PaymentStatus,
    SessionTableStatus,
)
from app.models.payment import Payment
from app.models.maid import Maid
from app.models.menu import MenuItem, MenuItemComponent
from app.models.order import Order, OrderItem, OrderItemMaid
from app.models.session import Session as SessionModel
from app.models.table import SessionTable, Table
from app.schemas.staff import (
    SessionSummaryItem,
    SessionSummarySetSource,
    SessionSummarySetComponent,
    SessionSummaryMaidCount,
    SessionSummaryResponse,
)
from app.schemas.table import SessionTableListResponse, SessionTableSummary
from app.services.bill_service import recalculate_bill_totals
from app.services.session_service import get_current_active_session
from app.services.square_verification import verify_square_payment

router = APIRouter(prefix="/staff", tags=["staff"])


def get_current_session_table_by_code(
    db: Session,
    table_code: str,
) -> tuple[SessionModel, SessionTable, Table]:
    current_session = get_current_active_session(db)
    if not current_session:
        raise HTTPException(status_code=404, detail="No active session found.")

    row = (
        db.execute(
            select(SessionTable, Table)
            .join(Table, SessionTable.table_id == Table.id)
            .where(
                SessionTable.session_id == current_session.id,
                Table.code == table_code,
            )
        )
        .first()
    )

    if not row:
        raise HTTPException(
            status_code=404,
            detail="Table not found in current session.",
        )

    session_table, table = row
    return current_session, session_table, table


def get_open_or_paying_bill_for_session_table(
    db: Session,
    session_table_id: int,
) -> Bill | None:
    return (
        db.execute(
            select(Bill)
            .where(
                Bill.session_table_id == session_table_id,
                Bill.status.in_([BillStatus.open, BillStatus.paying]),
            )
            .order_by(Bill.id.desc())
        )
        .scalars()
        .first()
    )


@router.get("/tables", response_model=SessionTableListResponse)
def get_staff_tables_overview(db: Session = Depends(get_db)):
    current_session = get_current_active_session(db)
    if not current_session:
        raise HTTPException(status_code=404, detail="No active session found.")

    rows = list(
        db.execute(
            select(SessionTable, Table)
            .join(Table, SessionTable.table_id == Table.id)
            .where(SessionTable.session_id == current_session.id)
            .order_by(Table.code.asc(), Table.id.asc())
        ).all()
    )

    tables: list[SessionTableSummary] = []
    for session_table, table in rows:
        open_bill = get_open_or_paying_bill_for_session_table(
            db,
            session_table.id,
        )

        tables.append(
            SessionTableSummary(
                id=session_table.id,
                session_id=session_table.session_id,
                table_id=table.id,
                table_code=table.code,
                seats=table.seats,
                is_shareable=table.is_shareable,
                status=session_table.status,
                current_party_size=session_table.current_party_size,
                layout_x=table.layout_x,
                layout_y=table.layout_y,
                layout_width=table.layout_width,
                layout_height=table.layout_height,
                layout_shape=table.layout_shape,
                open_bill_id=open_bill.id if open_bill else None,
                open_bill_total=(
                    open_bill.total if open_bill else Decimal("0.00")
                ),
            )
        )

    return SessionTableListResponse(
        session_id=current_session.id,
        session_name=current_session.name,
        tables=tables,
    )


@router.get(
    "/session-summary/{session_id}",
    response_model=SessionSummaryResponse,
)
def get_session_summary(
    session_id: int,
    db: Session = Depends(get_db),
):
    session_obj = db.get(SessionModel, session_id)

    if not session_obj:
        raise HTTPException(status_code=404, detail="Session not found.")

    direct_rows = db.execute(
        select(
            MenuItem.id.label("menu_item_id"),
            MenuItem.name.label("menu_item_name"),
            MenuItem.item_type.label("item_type"),
            MenuItem.is_bundle.label("is_bundle"),
            func.coalesce(func.sum(OrderItem.quantity), 0).label(
                "direct_ordered"
            ),
            func.coalesce(func.sum(OrderItem.total_price), 0).label(
                "total_sales"
            ),
        )
        .join(OrderItem, OrderItem.menu_item_id == MenuItem.id)
        .join(Order, Order.id == OrderItem.order_id)
        .join(Bill, Bill.id == Order.bill_id)
        .join(SessionTable, SessionTable.id == Bill.session_table_id)
        .where(SessionTable.session_id == session_id)
        .group_by(
            MenuItem.id,
            MenuItem.name,
            MenuItem.item_type,
            MenuItem.is_bundle,
        )
    ).all()

    component_rows = db.execute(
        select(
            MenuItemComponent.component_menu_item_id.label("menu_item_id"),
            MenuItem.name.label("menu_item_name"),
            MenuItem.item_type.label("item_type"),
            MenuItem.is_bundle.label("is_bundle"),
            MenuItemComponent.parent_menu_item_id.label("set_menu_item_id"),
            MenuItemComponent.quantity.label("component_quantity_per_set"),
            func.coalesce(func.sum(OrderItem.quantity), 0).label(
                "set_quantity_ordered"
            ),
            func.coalesce(
                func.sum(OrderItem.quantity * MenuItemComponent.quantity),
                0,
            ).label("quantity_from_set"),
        )
        .join(
            MenuItem,
            MenuItem.id == MenuItemComponent.component_menu_item_id,
        )
        .join(
            OrderItem,
            OrderItem.menu_item_id == MenuItemComponent.parent_menu_item_id,
        )
        .join(Order, Order.id == OrderItem.order_id)
        .join(Bill, Bill.id == Order.bill_id)
        .join(SessionTable, SessionTable.id == Bill.session_table_id)
        .where(SessionTable.session_id == session_id)
        .group_by(
            MenuItemComponent.component_menu_item_id,
            MenuItem.name,
            MenuItem.item_type,
            MenuItem.is_bundle,
            MenuItemComponent.parent_menu_item_id,
            MenuItemComponent.quantity,
        )
    ).all()

    set_ids = {row.set_menu_item_id for row in component_rows}
    set_names = {}

    if set_ids:
        set_names = {
            item.id: item.name
            for item in db.execute(
                select(MenuItem).where(MenuItem.id.in_(set_ids))
            )
            .scalars()
            .all()
        }

    item_map: dict[int, dict] = {}

    for row in direct_rows:
        item_map[row.menu_item_id] = {
            "menu_item_id": row.menu_item_id,
            "menu_item_name": row.menu_item_name,
            "item_type": row.item_type,
            "is_bundle": row.is_bundle,
            "direct_ordered": int(row.direct_ordered),
            "from_sets": 0,
            "total_sales": row.total_sales,
            "from_set_breakdown": [],
        }

    for row in component_rows:
        entry = item_map.setdefault(
            row.menu_item_id,
            {
                "menu_item_id": row.menu_item_id,
                "menu_item_name": row.menu_item_name,
                "item_type": row.item_type,
                "is_bundle": row.is_bundle,
                "direct_ordered": 0,
                "from_sets": 0,
                "total_sales": Decimal("0.00"),
                "from_set_breakdown": [],
            },
        )

        quantity_from_set = int(row.quantity_from_set)
        entry["from_sets"] += quantity_from_set
        entry["from_set_breakdown"].append(
            SessionSummarySetSource(
                set_menu_item_id=row.set_menu_item_id,
                set_menu_item_name=set_names.get(
                    row.set_menu_item_id,
                    f"Set #{row.set_menu_item_id}",
                ),
                set_quantity_ordered=int(row.set_quantity_ordered),
                component_quantity_per_set=int(
                    row.component_quantity_per_set
                ),
                quantity_from_set=quantity_from_set,
            )
        )

    set_component_map: dict[int, list[SessionSummarySetComponent]] = {}

    for row in component_rows:
        set_entry = item_map.get(row.set_menu_item_id)
        set_total_ordered = (
            set_entry["direct_ordered"]
            if set_entry
            else int(row.set_quantity_ordered)
        )

        set_component_map.setdefault(row.set_menu_item_id, []).append(
            SessionSummarySetComponent(
                menu_item_id=row.menu_item_id,
                menu_item_name=row.menu_item_name,
                item_type=row.item_type,
                quantity_per_set=int(row.component_quantity_per_set),
                total_quantity_from_set=(
                    set_total_ordered
                    * int(row.component_quantity_per_set)
                ),
            )
        )

    maid_rows = db.execute(
        select(
            MenuItem.id.label("menu_item_id"),
            Maid.id.label("maid_id"),
            Maid.name.label("maid_name"),
            func.count(OrderItemMaid.id).label("total_ordered"),
        )
        .join(OrderItem, OrderItem.id == OrderItemMaid.order_item_id)
        .join(MenuItem, MenuItem.id == OrderItem.menu_item_id)
        .join(Order, Order.id == OrderItem.order_id)
        .join(Bill, Bill.id == Order.bill_id)
        .join(SessionTable, SessionTable.id == Bill.session_table_id)
        .join(Maid, Maid.id == OrderItemMaid.maid_id)
        .where(
            SessionTable.session_id == session_id,
            MenuItem.item_type == "maid_service",
        )
        .group_by(MenuItem.id, Maid.id, Maid.name)
        .order_by(MenuItem.id.asc(), Maid.name.asc())
    ).all()

    maid_map: dict[int, list[SessionSummaryMaidCount]] = {}

    for row in maid_rows:
        maid_map.setdefault(row.menu_item_id, []).append(
            SessionSummaryMaidCount(
                maid_id=row.maid_id,
                maid_name=row.maid_name,
                total_ordered=row.total_ordered,
            )
        )

    items = []

    for entry in item_map.values():
        direct_ordered = int(entry["direct_ordered"])
        from_sets = int(entry["from_sets"])

        items.append(
            SessionSummaryItem(
                menu_item_id=entry["menu_item_id"],
                menu_item_name=entry["menu_item_name"],
                item_type=entry["item_type"],
                is_bundle=entry["is_bundle"],
                direct_ordered=direct_ordered,
                from_sets=from_sets,
                total_ordered=direct_ordered + from_sets,
                total_sales=entry["total_sales"],
                maid_breakdown=maid_map.get(entry["menu_item_id"], []),
                set_components=set_component_map.get(
                    entry["menu_item_id"], []
                ),
                from_set_breakdown=entry["from_set_breakdown"],
            )
        )

    items.sort(
        key=lambda item: (
            not item.is_bundle,
            item.menu_item_name.lower(),
        )
    )

    return SessionSummaryResponse(
        session_id=session_obj.id,
        session_name=session_obj.name,
        items=items,
    )

@router.post("/table/{table_code}/start-checkout")
def start_checkout(
    table_code: str,
    db: Session = Depends(get_db),
):
    _current_session, session_table, _table = (
        get_current_session_table_by_code(db, table_code)
    )

    bill = get_open_or_paying_bill_for_session_table(db, session_table.id)
    if not bill:
        raise HTTPException(
            status_code=404,
            detail="No open bill found for this table.",
        )

    if bill.status == BillStatus.paid:
        raise HTTPException(
            status_code=400,
            detail="This bill is already paid.",
        )

    bill.status = BillStatus.paying
    bill.checkout_total = bill.total
    session_table.status = SessionTableStatus.paying

    db.commit()
    db.refresh(bill)
    db.refresh(session_table)

    return {
        "success": True,
        "table_code": table_code,
        "bill_id": bill.id,
        "bill_status": bill.status,
        "session_table_status": session_table.status,
        "checkout_total": str(bill.checkout_total),
    }


@router.post("/table/{table_code}/cancel-checkout")
def cancel_checkout(
    table_code: str,
    db: Session = Depends(get_db),
):
    """Revert a bill from 'paying' back to 'open' when the card swipe is cancelled.

    Only allowed when:
      - The table's current bill is in BillStatus.paying, AND
      - No Payment row exists for that bill yet.

    If the bill already has a Payment row (charge may have gone through) or is
    not in 'paying' state, returns 409 to require human verification.
    """
    _current_session, session_table, _table = (
        get_current_session_table_by_code(db, table_code)
    )

    bill = get_open_or_paying_bill_for_session_table(db, session_table.id)

    if not bill or bill.status != BillStatus.paying:
        raise HTTPException(
            status_code=409,
            detail=(
                "Cannot cancel checkout: bill is not in 'paying' state. "
                "Current status: "
                + (bill.status.value if bill else "no active bill")
                + "."
            ),
        )

    # Check for any existing Payment rows — if one exists the charge may have
    # gone through and we must not silently reopen the bill.
    existing_payment = (
        db.execute(
            select(Payment).where(Payment.bill_id == bill.id)
        )
        .scalars()
        .first()
    )
    if existing_payment:
        raise HTTPException(
            status_code=409,
            detail=(
                "Cannot cancel checkout: a Payment record already exists for "
                "this bill. Manual verification required."
            ),
        )

    # Safe to revert: no charge was recorded.
    bill.status = BillStatus.open
    bill.checkout_total = None
    session_table.status = SessionTableStatus.occupied

    db.commit()
    db.refresh(bill)
    db.refresh(session_table)

    return {
        "success": True,
        "table_code": table_code,
        "bill_id": bill.id,
        "bill_status": bill.status,
        "session_table_status": session_table.status,
    }


class MarkPaidRequest(BaseModel):
    provider_payment_id: Optional[str] = None
    amount: Optional[Decimal] = None
    idempotency_key: Optional[str] = None
    manual: bool = False  # Set True for staff-override / cash / manual payments.


@router.post("/table/{table_code}/mark-paid")
def mark_paid(
    table_code: str,
    payload: Optional[MarkPaidRequest] = None,
    db: Session = Depends(get_db),
):
    """Mark a table's bill as paid and release the table.

    Payment path:
    - Square (default): caller sets provider_payment_id to the Square transaction
      ID returned by the Square POS app deep-link callback. In production
      (APP_ENV=production), provider_payment_id is REQUIRED for Square payments —
      a missing ID is rejected with 400 to ensure every charge is traceable.
    - Manual override (staff cashier override): set manual=True in the request.
      This path is always allowed and records provider="manual" on the Payment row
      for audit purposes. No provider_payment_id is needed.

    Square server-side verification (IMPLEMENTED — config-gated):
    When SQUARE_ACCESS_TOKEN and SQUARE_LOCATION_ID are set in the environment,
    this endpoint calls the Square Payments API to verify every non-manual charge:
      GET https://connect.squareup.com/v2/payments/{provider_payment_id}
    Assertions: payment.status == "COMPLETED", amount_money.amount matches the
    expected bill total in cents, and location_id matches SQUARE_LOCATION_ID.

    If credentials are NOT configured (MVP / local dev), the endpoint falls back
    to the original trust-the-frontend behaviour (traceable but unverified).

    To enable real-money verification, set:
      SQUARE_ACCESS_TOKEN  – Square OAuth / personal access token
      SQUARE_LOCATION_ID   – Square location ID that must own the charge
      SQUARE_API_BASE      – (optional) override API base; default https://connect.squareup.com
    """
    import os

    app_env = os.getenv("APP_ENV", "development").strip().lower()
    is_production = app_env == "production"

    # Determine payment path.
    is_manual = bool(payload and payload.manual)
    given_provider_id = payload.provider_payment_id if payload else None

    # In production, Square payments MUST include a provider_payment_id so that
    # every transaction can be traced back to a real Square charge.
    if is_production and not is_manual and not given_provider_id:
        raise HTTPException(
            status_code=400,
            detail=(
                "provider_payment_id is required for Square payments in production. "
                "For manual/cash overrides set manual=true."
            ),
        )

    _current_session, session_table, _table = (
        get_current_session_table_by_code(db, table_code)
    )

    # Resolve the current open/paying bill FIRST so that idempotency checks
    # are scoped to THIS bill only — not to arbitrary past paid bills on the
    # same table.
    bill = get_open_or_paying_bill_for_session_table(db, session_table.id)

    # Idempotency: if the CURRENT bill is already paid and the caller
    # supplies a matching idempotency_key (or provider_payment_id), replay
    # the existing result without creating a new Payment row.
    # A bill with no open/paying state means it was already settled.
    if bill is None:
        # No active bill — search for an existing Payment on ANY paid bill for
        # this session_table that matches the caller's identifiers.  This covers
        # the "late replay" scenario where the table has been reused (bill A paid,
        # new bill B opened and paid) and the client retries bill-A's identifiers.
        # Restricting to only `most_recent_paid_bill` would cause a 404 in that
        # case.
        if payload and (payload.idempotency_key or payload.provider_payment_id):
            from sqlalchemy import or_
            req_idem = payload.idempotency_key
            req_ppid = payload.provider_payment_id
            both_supplied = bool(req_idem and req_ppid)

            # Helper: look up a Payment whose bill belongs to this session_table.
            def _find_payment_on_table(conditions_list) -> Payment | None:
                return (
                    db.execute(
                        select(Payment)
                        .join(Bill, Payment.bill_id == Bill.id)
                        .where(
                            Bill.session_table_id == session_table.id,
                            Bill.status == BillStatus.paid,
                            *conditions_list,
                        )
                        .order_by(Payment.id.desc())
                    )
                    .scalars()
                    .first()
                )

            if both_supplied:
                # Strict AND match: both fields must agree on the same Payment.
                existing_payment = _find_payment_on_table([
                    Payment.idempotency_key == req_idem,
                    Payment.provider_payment_id == req_ppid,
                ])
                if existing_payment:
                    replay_bill = db.get(Bill, existing_payment.bill_id)
                    # [P3] Amount consistency check on replay.
                    if payload.amount is not None and Decimal(str(payload.amount)) != existing_payment.amount:
                        raise HTTPException(
                            status_code=409,
                            detail=(
                                f"Replay amount {payload.amount} does not match "
                                f"original payment amount {existing_payment.amount}."
                            ),
                        )
                    return {
                        "success": True,
                        "idempotent": True,
                        "table_code": table_code,
                        "bill_id": replay_bill.id,
                        "bill_status": replay_bill.status,
                        "session_table_status": session_table.status,
                        "current_party_size": session_table.current_party_size,
                        "closed_at": replay_bill.closed_at,
                        "payment_id": existing_payment.id,
                        "payment_provider": existing_payment.provider,
                    }
                # No AND-match found.  Check whether either field alone hits a
                # payment — that indicates an inconsistent combination → 409.
                partial_match = _find_payment_on_table([
                    or_(
                        Payment.idempotency_key == req_idem,
                        Payment.provider_payment_id == req_ppid,
                    )
                ])
                if partial_match:
                    raise HTTPException(
                        status_code=409,
                        detail=(
                            "Conflicting payment identifiers: the supplied "
                            "idempotency_key and provider_payment_id do not "
                            "both match the same existing payment."
                        ),
                    )
            else:
                # Single-field path: match by whichever identifier was supplied.
                conditions = []
                if req_idem:
                    conditions.append(Payment.idempotency_key == req_idem)
                if req_ppid:
                    conditions.append(Payment.provider_payment_id == req_ppid)
                existing_payment = _find_payment_on_table([or_(*conditions)])
                if existing_payment:
                    replay_bill = db.get(Bill, existing_payment.bill_id)
                    # [P3] Amount consistency check on replay.
                    if payload.amount is not None and Decimal(str(payload.amount)) != existing_payment.amount:
                        raise HTTPException(
                            status_code=409,
                            detail=(
                                f"Replay amount {payload.amount} does not match "
                                f"original payment amount {existing_payment.amount}."
                            ),
                        )
                    return {
                        "success": True,
                        "idempotent": True,
                        "table_code": table_code,
                        "bill_id": replay_bill.id,
                        "bill_status": replay_bill.status,
                        "session_table_status": session_table.status,
                        "current_party_size": session_table.current_party_size,
                        "closed_at": replay_bill.closed_at,
                        "payment_id": existing_payment.id,
                        "payment_provider": existing_payment.provider,
                    }
        raise HTTPException(
            status_code=404,
            detail="No open or paying bill found for this table.",
        )

    # Amount validation — only when the caller explicitly provides amount.
    if payload and payload.amount is not None:
        expected = (
            bill.checkout_total
            if bill.checkout_total is not None
            else bill.total
        )
        if payload.amount != expected:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"Payment amount {payload.amount} does not match "
                    f"expected amount {expected}."
                ),
            )

    # Resolve the fields we'll record on Payment.
    payment_amount = (
        payload.amount
        if (payload and payload.amount is not None)
        else (
            bill.checkout_total
            if bill.checkout_total is not None
            else bill.total
        )
    )

    # Square server-side verification (config-gated).
    # Only runs for non-manual Square payments that carry a provider_payment_id.
    #
    # Production fail-closed (P3): if Square credentials are NOT configured
    # and the payment is a non-manual Square charge, reject in production to
    # prevent unverified money from closing bills.  Manual overrides (cash /
    # staff cashier) are always allowed even in production.
    #
    # Development / staging: maintain trust-the-frontend behaviour when
    # credentials are absent (MVP ergonomics for unconfigured deployments).
    if not is_manual and given_provider_id:
        expected_cents = int(
            (
                bill.checkout_total
                if bill.checkout_total is not None
                else bill.total
            )
            * 100
        )
        verification = verify_square_payment(given_provider_id, expected_cents)
        if not verification.get("configured"):
            # Square not configured.
            if is_production:
                # Fail-closed: production must have Square configured.
                raise HTTPException(
                    status_code=503,
                    detail=(
                        "Payment verification not configured. "
                        "Set SQUARE_ACCESS_TOKEN and SQUARE_LOCATION_ID, "
                        "or use manual=true for cash/staff overrides."
                    ),
                )
            # Dev/staging: fall through (trust-the-frontend).
        elif not verification.get("valid"):
            raise HTTPException(
                status_code=402,
                detail=(
                    f"Square payment verification failed: "
                    f"{verification.get('reason', 'unknown error')}"
                ),
            )

    # Choose provider label for audit trail.
    # "manual" = explicit staff cashier override (no Square transaction).
    # "square" = Square POS deep-link flow (provider_payment_id should be set).
    provider_label = "manual" if is_manual else "square"

    now = utcnow()

    # Create a Payment record.
    given_idempotency_key = payload.idempotency_key if payload else None
    payment = Payment(
        bill_id=bill.id,
        provider=provider_label,
        provider_payment_id=given_provider_id,
        idempotency_key=given_idempotency_key,
        amount=payment_amount,
        status=PaymentStatus.completed,
        paid_at=now,
    )
    db.add(payment)

    bill.status = BillStatus.paid
    bill.closed_at = now

    # Payment completed: make the table immediately reusable.
    session_table.status = SessionTableStatus.available
    session_table.current_party_size = 0

    try:
        db.commit()
    except IntegrityError:
        # Concurrent duplicate: another request with the same idempotency_key
        # committed first.  Roll back and replay the existing Payment row so
        # the caller gets an idempotent 200 instead of a 500.
        db.rollback()
        if given_idempotency_key or given_provider_id:
            from sqlalchemy import or_
            _both_supplied = bool(given_idempotency_key and given_provider_id)

            if _both_supplied:
                # Strict AND match: both fields must agree for a safe replay.
                existing_payment = (
                    db.execute(
                        select(Payment)
                        .where(
                            Payment.bill_id == bill.id,
                            Payment.idempotency_key == given_idempotency_key,
                            Payment.provider_payment_id == given_provider_id,
                        )
                        .order_by(Payment.id.desc())
                    )
                    .scalars()
                    .first()
                )
                if existing_payment:
                    # Re-fetch bill/table state from DB after rollback.
                    db.refresh(bill)
                    db.refresh(session_table)
                    # [P3] Amount consistency check on IntegrityError replay.
                    if payload and payload.amount is not None and Decimal(str(payload.amount)) != existing_payment.amount:
                        raise HTTPException(
                            status_code=409,
                            detail=(
                                f"Replay amount {payload.amount} does not match "
                                f"original payment amount {existing_payment.amount}."
                            ),
                        )
                    return {
                        "success": True,
                        "idempotent": True,
                        "table_code": table_code,
                        "bill_id": bill.id,
                        "bill_status": bill.status,
                        "session_table_status": session_table.status,
                        "current_party_size": session_table.current_party_size,
                        "closed_at": bill.closed_at,
                        "payment_id": existing_payment.id,
                        "payment_provider": existing_payment.provider,
                    }
                # Check for a partial (inconsistent) match → 409 conflict.
                partial_match = (
                    db.execute(
                        select(Payment)
                        .where(
                            Payment.bill_id == bill.id,
                            or_(
                                Payment.idempotency_key == given_idempotency_key,
                                Payment.provider_payment_id == given_provider_id,
                            ),
                        )
                        .order_by(Payment.id.desc())
                    )
                    .scalars()
                    .first()
                )
                if partial_match:
                    raise HTTPException(
                        status_code=409,
                        detail=(
                            "Conflicting payment identifiers: the supplied "
                            "idempotency_key and provider_payment_id do not "
                            "both match the same existing payment."
                        ),
                    )
            else:
                # Single-field path: match by whichever identifier was supplied.
                _conditions = []
                if given_idempotency_key:
                    _conditions.append(
                        Payment.idempotency_key == given_idempotency_key
                    )
                if given_provider_id:
                    _conditions.append(
                        Payment.provider_payment_id == given_provider_id
                    )
                existing_payment = (
                    db.execute(
                        select(Payment)
                        .where(
                            Payment.bill_id == bill.id,
                            or_(*_conditions),
                        )
                        .order_by(Payment.id.desc())
                    )
                    .scalars()
                    .first()
                )
                if existing_payment:
                    # Re-fetch bill/table state from DB after rollback.
                    db.refresh(bill)
                    db.refresh(session_table)
                    # [P3] Amount consistency check on IntegrityError replay.
                    if payload and payload.amount is not None and Decimal(str(payload.amount)) != existing_payment.amount:
                        raise HTTPException(
                            status_code=409,
                            detail=(
                                f"Replay amount {payload.amount} does not match "
                                f"original payment amount {existing_payment.amount}."
                            ),
                        )
                    return {
                        "success": True,
                        "idempotent": True,
                        "table_code": table_code,
                        "bill_id": bill.id,
                        "bill_status": bill.status,
                        "session_table_status": session_table.status,
                        "current_party_size": session_table.current_party_size,
                        "closed_at": bill.closed_at,
                        "payment_id": existing_payment.id,
                        "payment_provider": existing_payment.provider,
                    }
        raise HTTPException(
            status_code=409,
            detail="Concurrent payment conflict. Please retry.",
        )

    db.refresh(bill)
    db.refresh(session_table)
    db.refresh(payment)

    return {
        "success": True,
        "idempotent": False,
        "table_code": table_code,
        "bill_id": bill.id,
        "bill_status": bill.status,
        "session_table_status": session_table.status,
        "current_party_size": session_table.current_party_size,
        "closed_at": bill.closed_at,
        "payment_id": payment.id,
        "payment_provider": payment.provider,
    }


# --------------------------------------------------------------------------- #
# Bill discount (F15)
# --------------------------------------------------------------------------- #


class ApplyDiscountRequest(BaseModel):
    type: str  # "percent" | "fixed"
    value: Decimal
    note: Optional[str] = Field(default=None, max_length=500)


def _bill_discount_response(table_code: str, bill: Bill) -> dict:
    return {
        "success": True,
        "table_code": table_code,
        "bill_id": bill.id,
        "bill_status": bill.status,
        "subtotal": str(bill.subtotal),
        "discount_type": bill.discount_type.value,
        "discount_value": str(bill.discount_value),
        "discount_amount": str(bill.discount_amount),
        "discount_note": bill.discount_note,
        "total": str(bill.total),
    }


@router.post("/table/{table_code}/discount")
def apply_bill_discount(
    table_code: str,
    payload: ApplyDiscountRequest,
    db: Session = Depends(get_db),
    x_actor_id: Optional[str] = Header(default=None, alias="X-Actor-Id"),
):
    """Apply a whole-bill discount. Only allowed while the bill is open.

    Validation (422 on failure):
      - type must be "percent" or "fixed"
      - value must be a number; percent in [0, 100]; fixed >= 0

    Returns 409 if the bill is not in the 'open' state.
    """
    # Validate type.
    if payload.type not in (DiscountType.percent.value, DiscountType.fixed.value):
        raise HTTPException(
            status_code=422,
            detail="type must be 'percent' or 'fixed'.",
        )

    value = payload.value
    if value is None:
        raise HTTPException(status_code=422, detail="value is required.")

    # Range checks.
    if payload.type == DiscountType.percent.value:
        if value < 0 or value > 100:
            raise HTTPException(
                status_code=422,
                detail="percent discount value must be between 0 and 100.",
            )
    else:  # fixed
        if value < 0:
            raise HTTPException(
                status_code=422,
                detail="fixed discount value must be >= 0.",
            )

    _current_session, session_table, _table = (
        get_current_session_table_by_code(db, table_code)
    )

    bill = get_open_or_paying_bill_for_session_table(db, session_table.id)
    if not bill:
        raise HTTPException(
            status_code=404,
            detail="No open bill found for this table.",
        )

    if bill.status != BillStatus.open:
        raise HTTPException(
            status_code=409,
            detail=(
                "Discount can only be changed while the bill is open. "
                f"Current status: {bill.status.value}."
            ),
        )

    bill.discount_type = DiscountType(payload.type)
    bill.discount_value = Decimal(value)
    bill.discount_note = payload.note

    actor_id: Optional[int] = None
    if x_actor_id is not None:
        try:
            actor_id = int(x_actor_id)
        except (TypeError, ValueError):
            actor_id = None
    bill.discounted_by = actor_id
    bill.discounted_at = utcnow()

    # Recompute via the single source of truth so percent stays correct.
    recalculate_bill_totals(bill)

    db.commit()
    db.refresh(bill)

    return _bill_discount_response(table_code, bill)


@router.delete("/table/{table_code}/discount")
def remove_bill_discount(
    table_code: str,
    db: Session = Depends(get_db),
):
    """Remove any discount from the bill. Only allowed while the bill is open."""
    _current_session, session_table, _table = (
        get_current_session_table_by_code(db, table_code)
    )

    bill = get_open_or_paying_bill_for_session_table(db, session_table.id)
    if not bill:
        raise HTTPException(
            status_code=404,
            detail="No open bill found for this table.",
        )

    if bill.status != BillStatus.open:
        raise HTTPException(
            status_code=409,
            detail=(
                "Discount can only be changed while the bill is open. "
                f"Current status: {bill.status.value}."
            ),
        )

    bill.discount_type = DiscountType.none
    bill.discount_value = Decimal("0.00")
    bill.discount_note = None
    bill.discounted_by = None
    bill.discounted_at = None

    recalculate_bill_totals(bill)

    db.commit()
    db.refresh(bill)

    return _bill_discount_response(table_code, bill)
