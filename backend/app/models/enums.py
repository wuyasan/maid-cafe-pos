import enum


class SessionStatus(str, enum.Enum):
    scheduled = "scheduled"
    active = "active"
    winding_down = "winding_down"
    closed = "closed"


class SessionTableStatus(str, enum.Enum):
    available = "available"
    occupied = "occupied"
    ready = "ready"
    paying = "paying"
    paid = "paid"


class MenuItemType(str, enum.Enum):
    regular = "regular"
    maid_service = "maid_service"


class BillStatus(str, enum.Enum):
    open = "open"
    paying = "paying"
    paid = "paid"
    cancelled = "cancelled"


class OrderSource(str, enum.Enum):
    qr = "qr"
    staff = "staff"


class PaymentStatus(str, enum.Enum):
    pending = "pending"
    completed = "completed"
    failed = "failed"