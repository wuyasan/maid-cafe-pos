from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.enums import SessionStatus
from app.models.session import Session as SessionModel


def get_current_active_session(db: Session) -> SessionModel | None:
    stmt = (
        select(SessionModel)
        .where(SessionModel.status == SessionStatus.active)
        .order_by(SessionModel.id.desc())
    )
    return db.execute(stmt).scalars().first()