import logging
import os
import re
import uuid
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session, joinedload

from app.api import deps
from app.api.routers.audit import log_action
from app.models import Game, GameManual, User

router = APIRouter()
logger = logging.getLogger(__name__)

MANAGER_ROLES = {"admin", "facilitador"}
MAX_FILE_BYTES = 20 * 1024 * 1024
ALLOWED_TYPES = {
    "application/pdf": ".pdf",
    "text/plain": ".txt",
    "text/markdown": ".md",
}
BACKEND_DIR = Path(__file__).resolve().parents[3]
MANUALS_DIR = BACKEND_DIR / "uploads" / "manuals"


def _serialize_manual(manual: GameManual, user: User) -> dict:
    return {
        "id": str(manual.id),
        "game_id": str(manual.game_id),
        "game_name": manual.game.name,
        "game_image_url": manual.game.image_url,
        "title": manual.title,
        "original_filename": manual.original_filename,
        "content_type": manual.content_type,
        "file_size": manual.file_size,
        "version": manual.version or "",
        "language": manual.language or "",
        "source": manual.source or "",
        "uploaded_by": manual.uploaded_by.username,
        "created_at": manual.created_at.isoformat() if manual.created_at else None,
        "can_delete": user.role in MANAGER_ROLES,
    }


def _get_manual(db: Session, manual_id: uuid.UUID) -> GameManual:
    manual = (
        db.query(GameManual)
        .options(joinedload(GameManual.game), joinedload(GameManual.uploaded_by))
        .filter(GameManual.id == manual_id)
        .first()
    )
    if not manual:
        raise HTTPException(status_code=404, detail="Reglamento no encontrado")
    return manual


def _get_manual_for_update(db: Session, manual_id: uuid.UUID) -> GameManual:
    manual = db.query(GameManual).filter(GameManual.id == manual_id).populate_existing().with_for_update().first()
    if not manual:
        raise HTTPException(status_code=404, detail="Reglamento no encontrado")
    return manual


@router.get("/", response_model=list[dict])
def list_manuals(
    game_id: Optional[uuid.UUID] = None,
    db: Session = Depends(deps.get_db),
    user: User = Depends(deps.get_current_user),
):
    query = (
        db.query(GameManual)
        .options(joinedload(GameManual.game), joinedload(GameManual.uploaded_by))
        .order_by(GameManual.created_at.desc())
    )
    if game_id:
        query = query.filter(GameManual.game_id == game_id)
    return [_serialize_manual(manual, user) for manual in query.all()]


async def _store_manual_file(file: UploadFile) -> dict:
    content_type = (file.content_type or "").lower()
    extension = ALLOWED_TYPES.get(content_type)
    filename_extension = Path(file.filename or "").suffix.lower()
    if not extension and filename_extension in {".pdf", ".txt", ".md"}:
        extension = filename_extension
        content_type = {".pdf": "application/pdf", ".txt": "text/plain", ".md": "text/markdown"}[extension]
    if not extension:
        raise HTTPException(status_code=400, detail="Solo se permiten archivos PDF, TXT o Markdown")

    MANUALS_DIR.mkdir(parents=True, exist_ok=True)
    stored_filename = f"{uuid.uuid4()}{extension}"
    stored_path = MANUALS_DIR / stored_filename
    size = 0
    first_chunk = b""
    try:
        with stored_path.open("wb") as buffer:
            while chunk := await file.read(1024 * 1024):
                if not first_chunk:
                    first_chunk = chunk
                size += len(chunk)
                if size > MAX_FILE_BYTES:
                    raise HTTPException(status_code=400, detail="El archivo no puede superar 20 MB")
                buffer.write(chunk)

        if extension == ".pdf" and not first_chunk.startswith(b"%PDF"):
            raise HTTPException(status_code=400, detail="El archivo no contiene un PDF válido")
        if extension in {".txt", ".md"}:
            try:
                stored_path.read_text(encoding="utf-8")
            except UnicodeDecodeError:
                raise HTTPException(status_code=400, detail="El texto debe usar codificación UTF-8")

        safe_original = re.sub(r"[^\w.\- ()]", "_", Path(file.filename or f"manual{extension}").name)
        return {
            "original_filename": safe_original[:255],
            "stored_filename": stored_filename,
            "content_type": content_type,
            "file_size": size,
        }
    except Exception:
        stored_path.unlink(missing_ok=True)
        raise
    finally:
        await file.close()


@router.post("/", response_model=dict)
async def upload_manual(
    game_id: uuid.UUID = Form(...),
    title: str = Form(...),
    version: str = Form(""),
    file: UploadFile = File(...),
    language: str = Form("", max_length=50),
    source: str = Form("", max_length=255),
    db: Session = Depends(deps.get_db),
    user: User = Depends(deps.require_role("admin", "facilitador")),
):
    clean_title = title.strip()
    if len(clean_title) < 3 or len(clean_title) > 255:
        raise HTTPException(status_code=400, detail="El título debe tener entre 3 y 255 caracteres")

    game = db.query(Game).filter(Game.id == game_id, Game.is_active.is_(True)).first()
    if not game:
        raise HTTPException(status_code=404, detail="Juego no encontrado")

    file_info = await _store_manual_file(file)
    manual = GameManual(
        game_id=game.id,
        uploaded_by_id=user.id,
        title=clean_title,
        version=version.strip()[:50] or None,
        language=language.strip() or None,
        source=source.strip() or None,
        **file_info,
    )
    db.add(manual)
    try:
        db.commit()
    except Exception:
        db.rollback()
        (MANUALS_DIR / file_info["stored_filename"]).unlink(missing_ok=True)
        raise
    db.refresh(manual)
    log_action(db, user, "UPLOAD", "GameManual", manual.id, clean_title, {
        "game_id": str(game.id), "filename": manual.original_filename, "file_size": manual.file_size,
    })
    return _serialize_manual(manual, user)


@router.put("/{manual_id}/file", response_model=dict)
async def replace_manual_file(
    manual_id: uuid.UUID,
    file: UploadFile = File(...),
    version: str = Form("", max_length=50),
    language: str = Form("", max_length=50),
    source: str = Form("", max_length=255),
    db: Session = Depends(deps.get_db),
    user: User = Depends(deps.require_role("admin", "facilitador")),
):
    if not db.get(GameManual, manual_id):
        raise HTTPException(status_code=404, detail="Reglamento no encontrado")

    file_info = await _store_manual_file(file)
    try:
        manual = _get_manual_for_update(db, manual_id)
        old_path = MANUALS_DIR / manual.stored_filename
        old_filename = manual.original_filename
        old_version = manual.version
        for field, value in file_info.items():
            setattr(manual, field, value)
        manual.version = version.strip() or None
        manual.language = language.strip() or None
        manual.source = source.strip() or None
        db.commit()
    except Exception:
        db.rollback()
        (MANUALS_DIR / file_info["stored_filename"]).unlink(missing_ok=True)
        raise

    try:
        old_path.unlink(missing_ok=True)
    except OSError:
        logger.warning("No se pudo retirar el archivo anterior del reglamento %s", manual_id)
    log_action(db, user, "REPLACE_MANUAL_FILE", "GameManual", manual.id, manual.title, {
        "old_filename": old_filename, "filename": manual.original_filename,
        "old_version": old_version, "version": manual.version,
    })
    return _serialize_manual(manual, user)


@router.get("/{manual_id}/download")
def download_manual(
    manual_id: uuid.UUID,
    db: Session = Depends(deps.get_db),
    user: User = Depends(deps.get_current_user),
):
    manual = _get_manual(db, manual_id)
    stored_path = MANUALS_DIR / manual.stored_filename
    if not stored_path.is_file():
        raise HTTPException(status_code=404, detail="El archivo del reglamento no está disponible")
    log_action(db, user, "DOWNLOAD", "GameManual", manual.id, manual.title, {
        "game_id": str(manual.game_id),
    })
    return FileResponse(
        path=stored_path,
        media_type=manual.content_type,
        filename=manual.original_filename,
    )


@router.delete("/{manual_id}", response_model=dict)
def delete_manual(
    manual_id: uuid.UUID,
    db: Session = Depends(deps.get_db),
    user: User = Depends(deps.require_role("admin", "facilitador")),
):
    manual = _get_manual_for_update(db, manual_id)
    stored_path = MANUALS_DIR / manual.stored_filename
    title = manual.title
    game_id = str(manual.game_id)
    db.delete(manual)
    db.commit()
    if stored_path.is_file():
        os.remove(stored_path)
    log_action(db, user, "DELETE", "GameManual", str(manual_id), title, {"game_id": game_id})
    return {"detail": "Reglamento eliminado"}
