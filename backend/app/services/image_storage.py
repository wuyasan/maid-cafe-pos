from __future__ import annotations

import os
import uuid
from pathlib import Path
from typing import BinaryIO

ALLOWED_CONTENT_TYPES = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/gif": ".gif",
}
MAX_IMAGE_BYTES = 8 * 1024 * 1024
ALLOWED_FOLDERS = {
    "menu-items",
    "maids",
}


def storage_backend() -> str:
    return os.getenv(
        "IMAGE_STORAGE_BACKEND",
        "local",
    ).strip().lower()


def local_upload_root() -> Path:
    configured = os.getenv(
        "LOCAL_UPLOAD_ROOT",
        "uploads",
    )
    return Path(configured).resolve()


def _safe_folder(folder: str) -> str:
    if folder not in ALLOWED_FOLDERS:
        raise ValueError(
            f'Unsupported image folder "{folder}".'
        )
    return folder


def _safe_extension(
    content_type: str,
    original_name: str,
) -> str:
    if content_type in ALLOWED_CONTENT_TYPES:
        return ALLOWED_CONTENT_TYPES[
            content_type
        ]

    suffix = Path(
        original_name,
    ).suffix.lower()

    if suffix in {
        ".jpg",
        ".jpeg",
        ".png",
        ".webp",
        ".gif",
    }:
        return (
            ".jpg"
            if suffix == ".jpeg"
            else suffix
        )

    raise ValueError(
        "Unsupported image type."
    )


def _new_object_key(
    folder: str,
    original_name: str,
    content_type: str,
) -> str:
    safe_folder = _safe_folder(folder)
    suffix = _safe_extension(
        content_type,
        original_name,
    )

    return (
        f"{safe_folder}/"
        f"{uuid.uuid4().hex}{suffix}"
    )


def save_local_image(
    file_obj: BinaryIO,
    folder: str,
    original_name: str,
    content_type: str,
) -> str:
    root = local_upload_root()
    key = _new_object_key(
        folder,
        original_name,
        content_type,
    )
    destination = root / key
    destination.parent.mkdir(
        parents=True,
        exist_ok=True,
    )

    with destination.open("wb") as output:
        while chunk := file_obj.read(
            1024 * 1024
        ):
            output.write(chunk)

    return key


def save_s3_image(
    file_obj: BinaryIO,
    folder: str,
    original_name: str,
    content_type: str,
) -> str:
    try:
        import boto3
    except ImportError as exc:
        raise RuntimeError(
            "boto3 is required when "
            "IMAGE_STORAGE_BACKEND=s3."
        ) from exc

    bucket = os.getenv(
        "S3_BUCKET",
        "",
    ).strip()
    public_base_url = os.getenv(
        "S3_PUBLIC_BASE_URL",
        "",
    ).strip().rstrip("/")

    if not bucket:
        raise RuntimeError(
            "S3_BUCKET is not configured."
        )

    if not public_base_url:
        raise RuntimeError(
            "S3_PUBLIC_BASE_URL is not configured."
        )

    client = boto3.client(
        "s3",
        endpoint_url=(
            os.getenv("S3_ENDPOINT_URL")
            or None
        ),
        region_name=(
            os.getenv("S3_REGION")
            or None
        ),
        aws_access_key_id=(
            os.getenv("S3_ACCESS_KEY_ID")
            or None
        ),
        aws_secret_access_key=(
            os.getenv(
                "S3_SECRET_ACCESS_KEY"
            )
            or None
        ),
    )

    key = _new_object_key(
        folder,
        original_name,
        content_type,
    )

    client.upload_fileobj(
        file_obj,
        bucket,
        key,
        ExtraArgs={
            "ContentType": content_type,
            "CacheControl": (
                "public, max-age=31536000, "
                "immutable"
            ),
        },
    )

    return f"{public_base_url}/{key}"


def save_image(
    file_obj: BinaryIO,
    folder: str,
    original_name: str,
    content_type: str,
) -> str:
    backend = storage_backend()

    if backend == "local":
        return save_local_image(
            file_obj,
            folder,
            original_name,
            content_type,
        )

    if backend == "s3":
        return save_s3_image(
            file_obj,
            folder,
            original_name,
            content_type,
        )

    raise RuntimeError(
        f'Unsupported IMAGE_STORAGE_BACKEND '
        f'"{backend}". Use "local" or "s3".'
    )


def save_menu_image(
    file_obj: BinaryIO,
    original_name: str,
    content_type: str,
) -> str:
    return save_image(
        file_obj,
        "menu-items",
        original_name,
        content_type,
    )


def save_maid_image(
    file_obj: BinaryIO,
    original_name: str,
    content_type: str,
) -> str:
    return save_image(
        file_obj,
        "maids",
        original_name,
        content_type,
    )
