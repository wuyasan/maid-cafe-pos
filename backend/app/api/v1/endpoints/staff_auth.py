from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.schemas.staff_user import StaffLoginRequest, StaffLoginResponse
from app.services import staff_user_service

router = APIRouter(prefix="/staff/auth", tags=["staff-auth"])

# Single, generic message — never reveals whether the username, the PIN, or the
# active flag was the cause.
_INVALID_CREDENTIALS = "Invalid username or PIN."


@router.post("/login", response_model=StaffLoginResponse)
def staff_login(payload: StaffLoginRequest, db: Session = Depends(get_db)):
    user = staff_user_service.verify_login(db, payload.username, payload.pin)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=_INVALID_CREDENTIALS,
        )
    return user
