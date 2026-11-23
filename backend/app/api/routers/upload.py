import os
import shutil
import uuid

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from PIL import Image, UnidentifiedImageError

from app.api import deps
from app.models import User

router = APIRouter()

PROJECT_DIR = os.path.dirname(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(__file__))))
)
FRONTEND_DIR = os.path.join(PROJECT_DIR, "frontend")
PUBLIC_UPLOAD_DIR = os.path.join(FRONTEND_DIR, "public", "assets")
BUILD_UPLOAD_DIR = os.path.join(FRONTEND_DIR, "build", "assets")
ALLOWED_TYPES = {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp"}
MAX_IMAGE_BYTES = 5 * 1024 * 1024


@router.post("/upload")
async def upload_image(
    file: UploadFile = File(...),
    user: User = Depends(deps.get_current_user),
):
    extension = ALLOWED_TYPES.get(file.content_type or "")
    if not extension:
        raise HTTPException(status_code=400, detail="Usa una imagen JPG, PNG o WebP")

    os.makedirs(PUBLIC_UPLOAD_DIR, exist_ok=True)
    unique_filename = f"uploaded_{uuid.uuid4()}{extension}"
    public_path = os.path.join(PUBLIC_UPLOAD_DIR, unique_filename)

    size = 0
    try:
        with open(public_path, "wb") as buffer:
            while chunk := await file.read(1024 * 1024):
                size += len(chunk)
                if size > MAX_IMAGE_BYTES:
                    raise HTTPException(status_code=400, detail="La imagen no puede superar 5 MB")
                buffer.write(chunk)

        with Image.open(public_path) as image:
            image.verify()

        if os.path.isdir(os.path.join(FRONTEND_DIR, "build")):
            os.makedirs(BUILD_UPLOAD_DIR, exist_ok=True)
            shutil.copy2(public_path, os.path.join(BUILD_UPLOAD_DIR, unique_filename))

        return {"url": f"/assets/{unique_filename}"}
    except HTTPException:
        if os.path.exists(public_path):
            os.remove(public_path)
        raise
    except (UnidentifiedImageError, OSError):
        if os.path.exists(public_path):
            os.remove(public_path)
        raise HTTPException(status_code=400, detail="El archivo no contiene una imagen válida")
    finally:
        await file.close()
