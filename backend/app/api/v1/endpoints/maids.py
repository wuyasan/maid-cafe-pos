from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.maid import Maid
from app.schemas.maid import MaidCreate, MaidRead, MaidUpdate

router = APIRouter(prefix="/maids", tags=["maids"])


@router.get("/", response_model=list[MaidRead])
def list_maids(db: Session = Depends(get_db)):
    stmt = select(Maid).order_by(Maid.display_order.asc(), Maid.id.asc())
    return list(db.execute(stmt).scalars().all())


@router.post("/", response_model=MaidRead)
def create_maid(payload: MaidCreate, db: Session = Depends(get_db)):
    maid = Maid(
        name=payload.name,
        photo_url=payload.photo_url,
        bio=payload.bio,
        is_active=payload.is_active,
        display_order=payload.display_order,
    )
    db.add(maid)
    db.commit()
    db.refresh(maid)
    return maid


@router.patch("/{maid_id}", response_model=MaidRead)
def update_maid(maid_id: int, payload: MaidUpdate, db: Session = Depends(get_db)):
    maid = db.get(Maid, maid_id)
    if not maid:
        raise HTTPException(status_code=404, detail="Maid not found.")

    update_data = payload.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(maid, key, value)

    db.commit()
    db.refresh(maid)
    return maid


@router.delete("/{maid_id}")
def delete_maid(maid_id: int, db: Session = Depends(get_db)):
    maid = db.get(Maid, maid_id)
    if not maid:
        raise HTTPException(status_code=404, detail="Maid not found.")

    db.delete(maid)
    db.commit()
    return {"success": True, "deleted_id": maid_id}