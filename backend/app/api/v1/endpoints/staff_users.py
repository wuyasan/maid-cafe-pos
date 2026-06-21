from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.schemas.staff_user import (
    StaffUserCreate,
    StaffUserRead,
    StaffUserResetPin,
    StaffUserUpdate,
)
from app.services import staff_user_service
from app.services.staff_user_service import (
    LastActiveAdminError,
    StaffUserNotFound,
    UsernameAlreadyExists,
)

router = APIRouter(prefix="/admin/staff-users", tags=["admin-staff-users"])


@router.get("", response_model=list[StaffUserRead])
def list_staff_users(db: Session = Depends(get_db)):
    return staff_user_service.list_users(db)


@router.post("", response_model=StaffUserRead, status_code=status.HTTP_201_CREATED)
def create_staff_user(payload: StaffUserCreate, db: Session = Depends(get_db)):
    try:
        return staff_user_service.create(
            db,
            username=payload.username,
            display_name=payload.display_name,
            role=payload.role,
            pin=payload.pin,
        )
    except UsernameAlreadyExists as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc))


@router.patch("/{user_id}", response_model=StaffUserRead)
def update_staff_user(
    user_id: int, payload: StaffUserUpdate, db: Session = Depends(get_db)
):
    try:
        return staff_user_service.update(
            db,
            user_id,
            display_name=payload.display_name,
            role=payload.role,
            is_active=payload.is_active,
        )
    except StaffUserNotFound as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    except LastActiveAdminError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc))


@router.post("/{user_id}/reset-pin", response_model=StaffUserRead)
def reset_staff_user_pin(
    user_id: int, payload: StaffUserResetPin, db: Session = Depends(get_db)
):
    try:
        return staff_user_service.reset_pin(db, user_id, payload.pin)
    except StaffUserNotFound as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
