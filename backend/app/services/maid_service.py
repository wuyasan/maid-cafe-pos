from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.maid import Maid, SessionMaid


def get_available_maids_for_session(db: Session, session_id: int) -> list[Maid]:
    stmt = (
        select(Maid)
        .join(SessionMaid, SessionMaid.maid_id == Maid.id)
        .where(
            SessionMaid.session_id == session_id,
            SessionMaid.is_available == True,
            Maid.is_active == True,
        )
        .order_by(Maid.display_order.asc(), Maid.id.asc())
    )
    return list(db.execute(stmt).scalars().all())


def validate_selected_maids(
    db: Session,
    session_id: int,
    selected_maid_ids: list[int],
) -> list[Maid]:
    if not selected_maid_ids:
        return []

    stmt = (
        select(Maid)
        .join(SessionMaid, SessionMaid.maid_id == Maid.id)
        .where(
            SessionMaid.session_id == session_id,
            SessionMaid.is_available == True,
            Maid.is_active == True,
            Maid.id.in_(selected_maid_ids),
        )
    )
    maids = list(db.execute(stmt).scalars().all())

    if len(maids) != len(set(selected_maid_ids)):
        raise ValueError("One or more selected maids are not available in this session.")

    return maids


def is_all_maids_selected(
    db: Session,
    session_id: int,
    selected_maid_ids: list[int],
) -> bool:
    available_maids = get_available_maids_for_session(db, session_id)
    available_ids = {maid.id for maid in available_maids}
    selected_ids = set(selected_maid_ids)

    return len(available_ids) > 0 and selected_ids == available_ids