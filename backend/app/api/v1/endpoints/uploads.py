from __future__ import annotations

from io import BytesIO
from pathlib import Path

from fastapi import (
    APIRouter,
    File,
    HTTPException,
    Request,
    UploadFile,
)
from fastapi.responses import FileResponse

from app.services.image_storage import (
    ALLOWED_CONTENT_TYPES,
    ALLOWED_FOLDERS,
    MAX_IMAGE_BYTES,
    local_upload_root,
    save_image,
    storage_backend,
)

router = APIRouter(
    prefix="/admin/uploads",
    tags=["admin-uploads"],
)


async def _upload(
    request: Request,
    image: UploadFile,
    folder: str,
):
    content_type = (
        image.content_type or ""
    ).lower()

    if (
        content_type
        not in ALLOWED_CONTENT_TYPES
    ):
        raise HTTPException(
            status_code=400,
            detail=(
                "Please upload a JPG, PNG, "
                "WEBP, or GIF image."
            ),
        )

    payload = await image.read(
        MAX_IMAGE_BYTES + 1
    )

    if len(payload) > MAX_IMAGE_BYTES:
        raise HTTPException(
            status_code=413,
            detail=(
                "Image is too large. "
                "Maximum size is 8 MB."
            ),
        )

    if not payload:
        raise HTTPException(
            status_code=400,
            detail=(
                "The uploaded image is empty."
            ),
        )

    try:
        stored_value = save_image(
            BytesIO(payload),
            folder,
            image.filename or "image",
            content_type,
        )
    except (
        RuntimeError,
        ValueError,
    ) as exc:
        raise HTTPException(
            status_code=500,
            detail=str(exc),
        ) from exc

    if storage_backend() == "local":
        image_url = (
            str(request.base_url).rstrip("/")
            + "api/v1/admin/uploads/files/"
            + stored_value
        )
    else:
        image_url = stored_value

    return {
        "image_url": image_url,
        "storage_backend": (
            storage_backend()
        ),
    }


@router.post("/menu-image")
async def upload_menu_image(
    request: Request,
    image: UploadFile = File(...),
):
    return await _upload(
        request,
        image,
        "menu-items",
    )


@router.post("/maid-image")
async def upload_maid_image(
    request: Request,
    image: UploadFile = File(...),
):
    return await _upload(
        request,
        image,
        "maids",
    )


@router.get(
    "/files/{folder}/{filename}"
)
def read_local_image(
    folder: str,
    filename: str,
):
    if storage_backend() != "local":
        raise HTTPException(
            status_code=404,
            detail="Local image not found.",
        )

    if folder not in ALLOWED_FOLDERS:
        raise HTTPException(
            status_code=404,
            detail="Image folder not found.",
        )

    safe_filename = Path(filename).name
    path = (
        local_upload_root()
        / folder
        / safe_filename
    )

    if not path.is_file():
        raise HTTPException(
            status_code=404,
            detail="Image not found.",
        )

    return FileResponse(path)
