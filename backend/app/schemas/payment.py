from datetime import datetime
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel, ConfigDict

from app.models.enums import PaymentStatus


class PaymentBase(BaseModel):
    bill_id: int
    amount: Decimal
    provider: str = "square"
    provider_payment_id: Optional[str] = None
    status: PaymentStatus = PaymentStatus.pending
    paid_at: Optional[datetime] = None


class PaymentCreate(PaymentBase):
    pass


class PaymentUpdate(BaseModel):
    provider_payment_id: Optional[str] = None
    status: Optional[PaymentStatus] = None
    paid_at: Optional[datetime] = None


class PaymentRead(PaymentBase):
    model_config = ConfigDict(from_attributes=True)

    id: int