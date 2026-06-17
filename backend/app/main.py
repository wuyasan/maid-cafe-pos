import os
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.api.v1.api import api_router

app = FastAPI(title="Maid Cafe Order API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:3001",
        "http://127.0.0.1:3001",
    ],
    allow_origin_regex=(
        r"^https?://("
        r"192\.168\.\d{1,3}\.\d{1,3}|"
        r"10\.\d{1,3}\.\d{1,3}\.\d{1,3}|"
        r"172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}|"
        r"[^/]+"
        r")(:\d+)?$"
    ),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

if os.getenv("IMAGE_STORAGE_BACKEND", "local").strip().lower() == "local":
    upload_root = Path(
        os.getenv("LOCAL_UPLOAD_DIR", "uploads/menu-items")
    ).resolve()
    upload_root.mkdir(parents=True, exist_ok=True)
    app.mount(
        "/uploads/menu-items",
        StaticFiles(directory=str(upload_root)),
        name="menu-item-uploads",
    )

app.include_router(api_router, prefix="/api/v1")
