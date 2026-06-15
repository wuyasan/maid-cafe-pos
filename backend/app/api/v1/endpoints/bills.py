from fastapi import APIRouter

router = APIRouter()


@router.get("/")
def placeholder() -> dict[str, str]:
    return {"module": "bills", "status": "todo"}
