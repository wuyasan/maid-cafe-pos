from datetime import date, datetime, time
from typing import Optional

from pydantic import BaseModel, ConfigDict

from app.models.enums import SessionStatus


class SessionBase(BaseModel):
    name: str
    service_date: date
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    kitchen_last_order_time: Optional[time] = None
    bar_last_order_time: Optional[time] = None
    status: SessionStatus = SessionStatus.scheduled


class SessionCreate(SessionBase):
    pass


class SessionUpdate(BaseModel):
    name: Optional[str] = None
    service_date: Optional[date] = None
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    kitchen_last_order_time: Optional[time] = None
    bar_last_order_time: Optional[time] = None
    status: Optional[SessionStatus] = None


class SessionRead(SessionBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    created_at: datetime


class CurrentSessionRead(BaseModel):
    session: Optional[SessionRead] = None
