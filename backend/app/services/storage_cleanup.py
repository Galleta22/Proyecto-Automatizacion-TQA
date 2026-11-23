import asyncio
import logging
import os
import re
from datetime import datetime, timedelta
from pathlib import Path

from sqlalchemy.orm import Session

from app.database.base import SessionLocal
from app.models import Badge, Game, GameManual, GameSession, User


logger = logging.getLogger(__name__)
PROJECT_DIR = Path(__file__).resolve().parents[3]
PUBLIC_UPLOAD_DIR = PROJECT_DIR / "frontend" / "public" / "assets"
BUILD_UPLOAD_DIR = PROJECT_DIR / "frontend" / "build" / "assets"
MANUALS_DIR = PROJECT_DIR / "backend" / "uploads" / "manuals"
ORPHAN_GRACE_HOURS = max(int(os.getenv("UPLOAD_ORPHAN_GRACE_HOURS", "24")), 1)
CLEANUP_INTERVAL_HOURS = max(int(os.getenv("UPLOAD_CLEANUP_INTERVAL_HOURS", "24")), 1)
UPLOAD_FILENAME_RE = re.compile(
    r"^uploaded_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(?:jpg|png|webp)$",
    re.IGNORECASE,
)
UPLOAD_GLOB = "uploaded_????????-????-????-????-????????????.*"


def _uploaded_name(value: str | None) -> str | None:
    if not value or not value.startswith("/assets/uploaded_"):
        return None
    name = Path(value).name
    return name if UPLOAD_FILENAME_RE.fullmatch(name) else None


def _referenced_images(db: Session) -> set[str]:
    referenced = set()
    for (image_url,) in db.query(Game.image_url).all():
        if name := _uploaded_name(image_url):
            referenced.add(name)
    for (image_url,) in db.query(Badge.image_url).all():
        if name := _uploaded_name(image_url):
            referenced.add(name)
    for (preferences,) in db.query(User.preferences).all():
        if name := _uploaded_name((preferences or {}).get("avatar_url")):
            referenced.add(name)
    for (snapshots,) in db.query(GameSession.snapshots).all():
        for snapshot in snapshots or []:
            if name := _uploaded_name(snapshot):
                referenced.add(name)
    return referenced


def _is_old_enough(path: Path, cutoff: datetime) -> bool:
    return datetime.fromtimestamp(path.stat().st_mtime) <= cutoff


def cleanup_orphaned_storage(db: Session, now: datetime | None = None) -> dict:
    """Remove old files that no database record references."""
    cutoff = (now or datetime.now()) - timedelta(hours=ORPHAN_GRACE_HOURS)
    referenced_images = _referenced_images(db)
    referenced_manuals = {
        filename for (filename,) in db.query(GameManual.stored_filename).all()
    }
    removed_images = set()
    removed_manuals = 0

    for directory in (PUBLIC_UPLOAD_DIR, BUILD_UPLOAD_DIR):
        if not directory.is_dir():
            continue
        for path in directory.glob(UPLOAD_GLOB):
            if path.is_file() and path.name not in referenced_images and _is_old_enough(path, cutoff):
                path.unlink()
                removed_images.add(path.name)

    if MANUALS_DIR.is_dir():
        for path in MANUALS_DIR.iterdir():
            if path.is_file() and path.name not in referenced_manuals and _is_old_enough(path, cutoff):
                path.unlink()
                removed_manuals += 1

    return {"images": len(removed_images), "manuals": removed_manuals}


def run_storage_cleanup() -> dict:
    db = SessionLocal()
    try:
        result = cleanup_orphaned_storage(db)
        logger.info(
            "Limpieza de archivos completada: %s imágenes, %s manuales",
            result["images"],
            result["manuals"],
        )
        return result
    finally:
        db.close()


async def storage_cleanup_loop() -> None:
    while True:
        try:
            await asyncio.to_thread(run_storage_cleanup)
        except Exception:
            logger.exception("No se pudo completar la limpieza automática de archivos")
        await asyncio.sleep(CLEANUP_INTERVAL_HOURS * 60 * 60)
