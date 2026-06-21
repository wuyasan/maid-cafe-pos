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


class ProductionStation(str, enum.Enum):
    kitchen = "kitchen"
    bar = "bar"
    none = "none"


class ProductionStatus(str, enum.Enum):
    pending = "pending"
    preparing = "preparing"
    completed = "completed"


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


class StaffRole(str, enum.Enum):
    staff = "staff"
    manager = "manager"
    admin = "admin"


class DiscountType(str, enum.Enum):
    none = "none"
    percent = "percent"
    fixed = "fixed"


class TipType(str, enum.Enum):
    none = "none"
    percent = "percent"
    fixed = "fixed"
