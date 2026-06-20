from __future__ import annotations

import os
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
from PIL import Image, UnidentifiedImageError
# Image.DecompressionBombError is a subclass of OSError in recent Pillow, but
# is also registered as its own exception; import it explicitly so the narrow
# except clause below is self-documenting.
_DECODE_ERRORS = (
    UnidentifiedImageError,
    OSError,
    SyntaxError,
    Image.DecompressionBombError,
)

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


# ---------------------------------------------------------------------------
# P3 (updated): full Pillow decode validation + real format detection.
# ---------------------------------------------------------------------------

# Map Pillow format strings to MIME types.
_PILLOW_FORMAT_TO_MIME: dict[str, str] = {
    "PNG": "image/png",
    "JPEG": "image/jpeg",
    "GIF": "image/gif",
    "WEBP": "image/webp",
}


def _validate_and_get_content_type(data: bytes) -> str:
    """Fully decode image bytes with Pillow; return the real MIME type.

    Raises HTTPException 400 if the bytes are not a valid, fully-decodable
    image in one of the supported formats (PNG, JPEG, GIF, WEBP).
    """
    try:
        buf = BytesIO(data)
        img = Image.open(buf)
        # verify() checks the file integrity (detects truncated/corrupt files)
        # but consumes the stream; we re-open for load() which fully decodes.
        img.verify()
        buf.seek(0)
        img2 = Image.open(buf)
        img2.load()
        fmt = img2.format  # e.g. "PNG", "JPEG"
    except _DECODE_ERRORS:
        raise HTTPException(
            status_code=400,
            detail=(
                "File contents do not match a supported image format "
                "(PNG, JPEG, WEBP, or GIF)."
            ),
        )

    mime = _PILLOW_FORMAT_TO_MIME.get(fmt or "")
    if not mime:
        raise HTTPException(
            status_code=400,
            detail=(
                "File contents do not match a supported image format "
                "(PNG, JPEG, WEBP, or GIF)."
            ),
        )
    return mime


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

    # P3: fully decode with Pillow; get real format (ignores declared MIME).
    real_content_type = _validate_and_get_content_type(payload)

    try:
        stored_value = save_image(
            BytesIO(payload),
            folder,
            image.filename or "image",
            real_content_type,
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
        # P4: prefer PUBLIC_UPLOAD_BASE_URL env var (production CDN / proxy).
        # Fall back to a relative path so the browser resolves it against the
        # Next.js origin, which proxies /uploads → FastAPI StaticFiles.
        public_base = os.environ.get("PUBLIC_UPLOAD_BASE_URL", "").strip()
        if public_base:
            image_url = (
                public_base.rstrip("/")
                + "/uploads/"
                + stored_value
            )
        else:
            # Relative path — browser resolves against the page origin.
            image_url = "/uploads/" + stored_value
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
