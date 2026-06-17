from __future__ import annotations

from fastapi import APIRouter, File, HTTPException, Request, UploadFile

from app.services.image_storage import (
    ALLOWED_CONTENT_TYPES,
    MAX_IMAGE_BYTES,
    save_menu_image,
    storage_backend,
)

router = APIRouter(prefix="/admin/uploads", tags=["admin-uploads"])


@router.post("/menu-image")
async def upload_menu_image(
    request: Request,
    image: UploadFile = File(...),
):
    content_type = (image.content_type or "").lower()

    if content_type not in ALLOWED_CONTENT_TYPES:
        raise HTTPException(
            status_code=400,
            detail="Please upload a JPG, PNG, WEBP, or GIF image.",
        )

    payload = await image.read(MAX_IMAGE_BYTES + 1)

    if len(payload) > MAX_IMAGE_BYTES:
        raise HTTPException(
            status_code=413,
            detail="Image is too large. Maximum size is 8 MB.",
        )

    if not payload:
        raise HTTPException(
            status_code=400,
            detail="The uploaded image is empty.",
        )

    from io import BytesIO

    try:
        stored_url = save_menu_image(
            BytesIO(payload),
            image.filename or "menu-image",
            content_type,
        )
    except (RuntimeError, ValueError) as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    if stored_url.startswith("/"):
        stored_url = str(request.base_url).rstrip("/") + stored_url

    return {
        "image_url": stored_url,
        "storage_backend": storage_backend(),
    }
