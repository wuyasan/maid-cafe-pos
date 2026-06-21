from decimal import ROUND_HALF_UP, Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.models.bill import Bill
from app.models.enums import BillStatus, DiscountType, SessionTableStatus, TipType
from app.models.table import SessionTable, Table

CENTS = Decimal("0.01")

# Upper bound for any Numeric(10, 2) column (e.g. bill.total, bill.tip_amount,
# payment columns). Values at or below this fit; anything larger would overflow
# the column and crash the DB write (500). Callers must guard against this and
# surface a 422 instead.
MAX_MONEY = Decimal("99999999.99")


class TotalOverflowError(Exception):
    """Raised when a recompute would push tip_amount or total past MAX_MONEY.

    The API layer catches this and returns 422 instead of letting an oversized
    Numeric(10, 2) value reach the DB (which would raise a 500).
    """


def get_session_table_by_table_code(
    db: Session,
    session_id: int,
    table_code: str,
) -> SessionTable | None:
    stmt = (
        select(SessionTable)
        .join(Table, SessionTable.table_id == Table.id)
        .where(SessionTable.session_id == session_id, Table.code == table_code)
        .options(joinedload(SessionTable.table))
    )
    return db.execute(stmt).scalars().first()


def get_open_bill_for_session_table(db: Session, session_table_id: int) -> Bill | None:
    stmt = (
        select(Bill)
        .where(
            Bill.session_table_id == session_table_id,
            Bill.status.in_([BillStatus.open, BillStatus.paying]),
        )
        .order_by(Bill.id.desc())
    )
    return db.execute(stmt).scalars().first()


def get_or_create_open_bill(db: Session, session_table_id: int) -> Bill:
    bill = get_open_bill_for_session_table(db, session_table_id)
    if bill:
        # Table is already occupied (or in a later state); no status change needed.
        return bill

    bill = Bill(
        session_table_id=session_table_id,
        status=BillStatus.open,
        subtotal=Decimal("0.00"),
        tax=Decimal("0.00"),
        service_charge=Decimal("0.00"),
        total=Decimal("0.00"),
    )
    db.add(bill)

    # Mark the table occupied as soon as a bill is opened for the first time.
    session_table = db.get(SessionTable, session_table_id)
    if session_table and session_table.status == SessionTableStatus.available:
        session_table.status = SessionTableStatus.occupied

    db.flush()
    return bill


def compute_discount_amount(
    subtotal: Decimal,
    discount_type: DiscountType,
    discount_value: Decimal,
) -> Decimal:
    """Compute the discount amount for a bill given its subtotal.

    - none    -> 0
    - percent -> round(subtotal * value/100, 2) (ROUND_HALF_UP)
    - fixed   -> min(value, subtotal) (never discount more than the subtotal)

    The result is always clamped to [0, subtotal].
    """
    subtotal = Decimal(subtotal or 0)
    if subtotal <= 0 or discount_type == DiscountType.none:
        return Decimal("0.00")

    value = Decimal(discount_value or 0)

    if discount_type == DiscountType.percent:
        amount = (subtotal * value / Decimal("100")).quantize(
            CENTS, rounding=ROUND_HALF_UP
        )
    else:  # fixed
        if value <= 0:
            return Decimal("0.00")
        if value >= subtotal:
            return subtotal
        amount = value.quantize(CENTS, rounding=ROUND_HALF_UP)

    # Clamp into [0, subtotal] so the bill total can never go negative.
    if amount < 0:
        amount = Decimal("0.00")
    if amount > subtotal:
        amount = subtotal
    return amount


def compute_tip_amount(
    discounted: Decimal,
    tip_type: TipType,
    tip_value: Decimal,
) -> Decimal:
    """Compute the tip amount for a bill given its DISCOUNTED total.

    - none    -> 0
    - percent -> round(discounted * value/100, 2) (ROUND_HALF_UP)
    - fixed   -> value (an additive charge; NOT clamped)

    Unlike a discount, a tip is an add-on, so the fixed branch is not clamped to
    the subtotal. Overflow protection lives in the recompute / API layer, which
    raises TotalOverflowError -> 422 if the resulting amount or total would
    exceed MAX_MONEY.
    """
    discounted = Decimal(discounted or 0)
    if tip_type == TipType.none:
        return Decimal("0.00")

    value = Decimal(tip_value or 0)
    if value <= 0:
        return Decimal("0.00")

    if tip_type == TipType.percent:
        if discounted <= 0:
            return Decimal("0.00")
        amount = (discounted * value / Decimal("100")).quantize(
            CENTS, rounding=ROUND_HALF_UP
        )
    else:  # fixed
        amount = value.quantize(CENTS, rounding=ROUND_HALF_UP)

    if amount < 0:
        amount = Decimal("0.00")
    return amount


def apply_discount_to_bill(bill: Bill) -> Bill:
    """Recompute discount_amount + total from an already-set bill.subtotal.

    This is the discount half of the single recompute source.  Any path that
    has already set ``bill.subtotal`` (e.g. the SQL-sum recompute in
    staff_order_items) must call this so percent discounts stay correct after
    line-item edits.
    """
    subtotal = Decimal(bill.subtotal or 0)
    bill.tax = Decimal("0.00")
    bill.service_charge = Decimal("0.00")
    bill.discount_amount = compute_discount_amount(
        subtotal,
        bill.discount_type,
        bill.discount_value,
    )
    discounted = subtotal - bill.discount_amount
    if discounted < 0:
        discounted = Decimal("0.00")

    # Tip is computed off the DISCOUNTED amount (percent base = subtotal - discount).
    tip_type = getattr(bill, "tip_type", None) or TipType.none
    tip_amount = compute_tip_amount(
        discounted,
        tip_type,
        getattr(bill, "tip_value", Decimal("0.00")),
    )

    # Overflow guard: fixed tip is unclamped, so either the tip itself or the
    # resulting total can exceed the Numeric(10, 2) column. Refuse to write —
    # the API layer turns this into a 422 (never a 500).
    total = discounted + bill.tax + bill.service_charge + tip_amount
    if tip_amount > MAX_MONEY or total > MAX_MONEY:
        raise TotalOverflowError(
            "Resulting tip amount or bill total exceeds the maximum allowed value."
        )

    bill.tip_amount = tip_amount
    bill.total = total.quantize(CENTS)
    return bill


def recalculate_bill_totals(bill: Bill) -> Bill:
    """Single source of truth for bill totals.

    subtotal       = sum of order-item line totals
    discount_amount = derived from discount_type/value via compute_discount_amount
    total          = max(0, subtotal - discount_amount) + tax + service_charge
    """
    subtotal = Decimal("0.00")

    for order in bill.orders:
        for item in order.items:
            subtotal += Decimal(item.total_price)

    bill.subtotal = subtotal.quantize(CENTS)
    return apply_discount_to_bill(bill)
