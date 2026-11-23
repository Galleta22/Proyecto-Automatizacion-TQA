from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from app.api import deps
from app.models import ContentReport, ContentRevision, GameManual, Game, GameRule, User
from app.services.notifications import notify, notify_admins
from app.api.routers.audit import log_action

router = APIRouter()

class ReportRequest(BaseModel):
    manual_id: UUID
    message: str = Field(min_length=10, max_length=1000)

class ResolveRequest(BaseModel):
    resolution: str = Field(min_length=5, max_length=1000)

@router.post("/reports")
def report_manual(payload: ReportRequest, db: Session = Depends(deps.get_db), user: User = Depends(deps.get_current_user)):
    manual = db.query(GameManual).filter_by(id=payload.manual_id).first()
    if not manual:
        raise HTTPException(status_code=404, detail="Manual no encontrado")
    if len(payload.message.strip()) < 10:
        raise HTTPException(status_code=422, detail="Explica el problema con al menos 10 caracteres")
    existing = db.query(ContentReport).filter_by(manual_id=manual.id, user_id=user.id, status="pending").first()
    if existing:
        raise HTTPException(status_code=409, detail="Ya tienes un aviso pendiente para este manual")
    report = ContentReport(manual_id=manual.id, user_id=user.id, title=manual.title, message=payload.message.strip())
    db.add(report)
    managers = db.query(User).filter(User.role.in_(["admin", "facilitador"]), User.is_active.is_(True)).all()
    for manager in managers:
        notify(db, manager.id, "manual_report", "Manual pendiente de revisión", manual.title, "/revision-contenido")
    db.commit()
    return {"detail": "Aviso enviado. Un facilitador revisará el manual"}

@router.get("/reports")
def list_reports(db: Session = Depends(deps.get_db), user: User = Depends(deps.require_role("admin", "facilitador"))):
    return [{"id": str(r.id), "manual_id": str(r.manual_id) if r.manual_id else None, "title": r.title, "message": r.message, "status": r.status, "resolution": r.resolution, "created_at": r.created_at} for r in db.query(ContentReport).order_by(ContentReport.created_at.desc()).limit(200).all()]

@router.put("/reports/{report_id}/resolve")
def resolve_report(report_id: UUID, payload: ResolveRequest, db: Session = Depends(deps.get_db), user: User = Depends(deps.require_role("admin", "facilitador"))):
    report = db.query(ContentReport).filter_by(id=report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Aviso no encontrado")
    if report.status != "pending":
        raise HTTPException(status_code=409, detail="Este aviso ya fue revisado")
    if len(payload.resolution.strip()) < 5:
        raise HTTPException(status_code=422, detail="Describe el resultado de la revisión")
    report.status = "resolved"; report.resolution = payload.resolution.strip()
    if report.user_id:
        notify(db, report.user_id, "manual_report_resolved", "Revisión del manual completada", report.resolution, "/reglas?section=manuals")
    db.commit()
    log_action(db, user, "REVIEW_MANUAL", "GameManual", report.manual_id, report.title, {"resolution": report.resolution})
    return {"detail": "Revisión registrada"}

@router.get("/revisions")
def revisions(db: Session = Depends(deps.get_db), user: User = Depends(deps.require_role("admin"))):
    return [{"id": str(r.id), "entity_type": r.entity_type, "entity_name": r.entity_name, "before": r.before, "after": r.after, "created_at": r.created_at} for r in db.query(ContentRevision).order_by(ContentRevision.created_at.desc()).limit(100).all()]

@router.post("/revisions/{revision_id}/restore")
def restore_revision(revision_id: UUID, db: Session = Depends(deps.get_db), user: User = Depends(deps.require_role("admin"))):
    revision = db.query(ContentRevision).filter_by(id=revision_id).first()
    if not revision:
        raise HTTPException(status_code=404, detail="Revisión no encontrada")
    model = {"game": Game, "rule": GameRule}.get(revision.entity_type)
    entity = db.query(model).filter_by(id=revision.entity_id).with_for_update().first() if model else None
    if not entity:
        raise HTTPException(status_code=404, detail="El contenido ya no existe")
    if any(getattr(entity, key) != value for key, value in revision.after.items()):
        raise HTTPException(status_code=409, detail="Hay cambios posteriores. Revísalos antes de restaurar")
    for key, value in revision.before.items(): setattr(entity, key, value)
    db.add(ContentRevision(entity_type=revision.entity_type, entity_id=revision.entity_id, entity_name=revision.entity_name, user_id=user.id, before=revision.after, after=revision.before))
    db.commit()
    log_action(db, user, "RESTORE_CONTENT", revision.entity_type, revision.entity_id, revision.entity_name, {"revision": str(revision.id)})
    return {"detail": "Versión anterior restaurada"}
