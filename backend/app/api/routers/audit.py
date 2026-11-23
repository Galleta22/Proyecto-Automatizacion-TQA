from typing import List, Optional
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from sqlalchemy import desc, func
from app.api import deps
from app.models import AIInteraction, AuditLog, Badge, Game, GameManual, GameRule, GameSession, User
from fpdf import FPDF
import io
import traceback
import sys

router = APIRouter()
SENSITIVE_DETAIL_KEYS = {"authorization", "cookie", "password", "secret", "token"}


def _sanitize_audit_details(value):
    if isinstance(value, dict):
        sanitized = {}
        for key, item in value.items():
            normalized_key = str(key).lower()
            is_sensitive = any(term in normalized_key for term in SENSITIVE_DETAIL_KEYS)
            sanitized[key] = (
                item if is_sensitive and isinstance(item, bool)
                else "[REDACTADO]" if is_sensitive
                else _sanitize_audit_details(item)
            )
        return sanitized
    if isinstance(value, (list, tuple)):
        return [_sanitize_audit_details(item) for item in value]
    return value


def log_action(
    db: Session,
    user: Optional[User],
    action: str,
    entity_type: str,
    entity_id: str = None,
    entity_name: str = None,
    details: dict = None,
    ip_address: str = None
):
    """
    Helper function to create an audit log entry.
    Call this after any CREATE, UPDATE, DELETE, or important action.
    """
    log_entry = AuditLog(
        user_id=user.id if user else None,
        username=user.username if user else "Sistema",
        action=action,
        entity_type=entity_type,
        entity_id=str(entity_id) if entity_id else None,
        entity_name=entity_name,
        details=_sanitize_audit_details(details or {}),
        ip_address=ip_address
    )
    db.add(log_entry)
    db.commit()
    return log_entry


@router.get("/", response_model=dict)
def list_audit_logs(
    db: Session = Depends(deps.get_db),
    user: User = Depends(deps.require_role("admin")),
    entity_type: Optional[str] = Query(None, description="Filter by entity type (Game, Rule, User, Session)"),
    action: Optional[str] = Query(None, description="Filter by action (CREATE, UPDATE, DELETE)"),
    user_id: Optional[str] = Query(None, description="Filter by user ID"),
    days: int = Query(7, description="Number of days to look back"),
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=5, le=100),
    all_items: bool = Query(False),
):
    """
    Get audit logs with optional filters.
    Only accessible by admin users.
    """
    query = db.query(AuditLog)

    # Apply filters
    if entity_type:
        query = query.filter(AuditLog.entity_type == entity_type)
    if action:
        query = query.filter(AuditLog.action == action)
    if user_id:
        query = query.filter(AuditLog.user_id == user_id)

    # Date filter
    start_date = datetime.now() - timedelta(days=days)
    query = query.filter(AuditLog.timestamp >= start_date)

    total = query.count()
    ordered = query.order_by(desc(AuditLog.timestamp))
    logs = ordered.all() if all_items else ordered.offset((page - 1) * page_size).limit(page_size).all()

    items = [
        {
            "id": str(log.id),
            "timestamp": log.timestamp.isoformat(),
            "username": log.username,
            "action": log.action,
            "entity_type": log.entity_type,
            "entity_id": log.entity_id,
            "entity_name": log.entity_name,
            "details": log.details,
            "ip_address": log.ip_address
        }
        for log in logs
    ]
    pages = 1 if all_items else max((total + page_size - 1) // page_size, 1)
    return {"items": items, "page": 1 if all_items else page, "page_size": total if all_items else page_size, "total": total, "pages": pages, "all_items": all_items}


@router.get("/summary", response_model=dict)
def get_audit_summary(
    db: Session = Depends(deps.get_db),
    user: User = Depends(deps.require_role("admin")),
    days: int = Query(1, description="Number of days for summary")
):
    """
    Get a summary of actions for reporting.
    Returns counts of actions by type and entity.
    """
    from sqlalchemy import func

    start_date = datetime.now() - timedelta(days=days)

    # Count by action type
    action_counts = db.query(
        AuditLog.action,
        func.count(AuditLog.id).label("count")
    ).filter(
        AuditLog.timestamp >= start_date
    ).group_by(AuditLog.action).all()

    # Count by entity type
    entity_counts = db.query(
        AuditLog.entity_type,
        func.count(AuditLog.id).label("count")
    ).filter(
        AuditLog.timestamp >= start_date
    ).group_by(AuditLog.entity_type).all()

    # Recent activity by user
    user_activity = db.query(
        AuditLog.username,
        func.count(AuditLog.id).label("count")
    ).filter(
        AuditLog.timestamp >= start_date
    ).group_by(AuditLog.username).order_by(desc("count")).limit(10).all()

    return {
        "period_days": days,
        "start_date": start_date.isoformat(),
        "actions": {action: count for action, count in action_counts},
        "entities": {entity: count for entity, count in entity_counts},
        "top_users": [{"username": u, "count": c} for u, c in user_activity]
    }


@router.get("/export")
def export_audit_logs(
    db: Session = Depends(deps.get_db),
    user: User = Depends(deps.require_role("admin")),
    entity_type: Optional[str] = Query(None),
    action: Optional[str] = Query(None),
    user_id: Optional[str] = Query(None),
    days: int = Query(30)
):
    """
    Export audit logs to CSV format.
    """
    from fastapi.responses import StreamingResponse
    import csv
    import io

    # Filter logic (duplicated from list endpoint, could be refactored)
    query = db.query(AuditLog)

    if entity_type:
        query = query.filter(AuditLog.entity_type == entity_type)
    if action:
        query = query.filter(AuditLog.action == action)
    if user_id:
        query = query.filter(AuditLog.user_id == user_id)

    start_date = datetime.now() - timedelta(days=days)
    query = query.filter(AuditLog.timestamp >= start_date)

    # Get all logs for export (no limit)
    logs = query.order_by(desc(AuditLog.timestamp)).all()

    # Create CSV stream
    stream = io.StringIO()
    writer = csv.writer(stream)

    # Header
    writer.writerow(["Fecha", "Usuario", "Accion", "Entidad", "ID Entidad", "Nombre Entidad", "Detalles"])

    def iter_csv():
        yield stream.getvalue()
        stream.seek(0)
        stream.truncate(0)

        for log in logs:
            writer.writerow([
                log.timestamp.isoformat(),
                log.username,
                log.action,
                log.entity_type,
                log.entity_id or "",
                log.entity_name or "",
                str(log.details)
            ])
            yield stream.getvalue()
            stream.seek(0)
            stream.truncate(0)

    response = StreamingResponse(iter_csv(), media_type="text/csv")
    response.headers["Content-Disposition"] = f"attachment; filename=audit_logs_{datetime.now().strftime('%Y%m%d')}.csv"
    return response


@router.get("/export-pdf")
def export_audit_logs_pdf(
    db: Session = Depends(deps.get_db),
    user: User = Depends(deps.require_role("admin")),
    entity_type: Optional[str] = Query(None),
    action: Optional[str] = Query(None),
    user_id: Optional[str] = Query(None),
    days: int = Query(30),
):
    """Export an administrative PDF with system and audit detail."""
    try:
        start_date = datetime.now() - timedelta(days=days)
        filtered_query = db.query(AuditLog).filter(AuditLog.timestamp >= start_date)
        if entity_type:
            filtered_query = filtered_query.filter(AuditLog.entity_type == entity_type)
        if action:
            filtered_query = filtered_query.filter(AuditLog.action == action)
        if user_id:
            filtered_query = filtered_query.filter(AuditLog.user_id == user_id)
        logs = filtered_query.order_by(desc(AuditLog.timestamp)).all()

        period_query = db.query(AuditLog).filter(AuditLog.timestamp >= start_date)
        action_counts = period_query.with_entities(
            AuditLog.action, func.count(AuditLog.id)
        ).group_by(AuditLog.action).order_by(desc(func.count(AuditLog.id))).all()
        entity_counts = period_query.with_entities(
            AuditLog.entity_type, func.count(AuditLog.id)
        ).group_by(AuditLog.entity_type).order_by(desc(func.count(AuditLog.id))).all()
        user_activity = period_query.with_entities(
            AuditLog.username, func.count(AuditLog.id)
        ).group_by(AuditLog.username).order_by(desc(func.count(AuditLog.id))).limit(8).all()

        system_stats = {
            "Usuarios": db.query(func.count(User.id)).scalar() or 0,
            "Usuarios activos": db.query(func.count(User.id)).filter(User.is_active.is_(True)).scalar() or 0,
            "Juegos": db.query(func.count(Game.id)).filter(Game.is_active.is_(True)).scalar() or 0,
            "Reglas": db.query(func.count(GameRule.id)).scalar() or 0,
            "Reglamentos": db.query(func.count(GameManual.id)).scalar() or 0,
            "Partidas": db.query(func.count(GameSession.id)).scalar() or 0,
            "Consultas IA": db.query(func.count(AIInteraction.id)).scalar() or 0,
            "Insignias": db.query(func.count(Badge.id)).filter(Badge.is_active.is_(True)).scalar() or 0,
        }
        security_stats = {
            "Accesos correctos": period_query.filter(AuditLog.action == "LOGIN").count(),
            "Accesos fallidos": period_query.filter(AuditLog.action == "LOGIN_FAILED").count(),
            "Cuentas desactivadas": period_query.filter(AuditLog.action == "DEACTIVATE_ACCOUNT").count(),
            "Cambios de credenciales": period_query.filter(
                AuditLog.action.in_(["CHANGE_PASSWORD", "RESET_PASSWORD", "UPDATE_PASSWORD"])
            ).count(),
        }

        class PDF(FPDF):
            def header(self):
                self.set_fill_color(54, 88, 107)
                self.rect(0, 0, 210, 22, "F")
                self.set_xy(10, 6)
                self.set_text_color(255, 255, 255)
                self.set_font("Arial", "B", 14)
                self.cell(120, 8, "Ludisist | Reporte administrativo", 0, 0)
                self.set_font("Arial", "", 8)
                self.cell(70, 8, datetime.now().strftime("%d/%m/%Y %H:%M"), 0, 1, "R")
                self.set_text_color(35, 45, 55)
                self.ln(9)

            def footer(self):
                self.set_y(-15)
                self.set_draw_color(190, 200, 207)
                self.line(10, self.get_y(), 200, self.get_y())
                self.set_font("Arial", "I", 8)
                self.set_text_color(100, 110, 120)
                self.cell(95, 9, "Documento interno de administracion", 0, 0)
                self.cell(95, 9, f"Pagina {self.page_no()}", 0, 0, "R")

        pdf = PDF()
        pdf.set_auto_page_break(auto=True, margin=18)
        pdf.add_page()

        def clean_text(value):
            return str(value or "").encode("latin-1", "replace").decode("latin-1")

        def section_title(title, subtitle=""):
            pdf.ln(4)
            pdf.set_fill_color(65, 101, 121)
            pdf.set_text_color(255, 255, 255)
            pdf.set_font("Arial", "B", 11)
            pdf.cell(190, 8, clean_text(title), 0, 1, "L", True)
            pdf.set_text_color(35, 45, 55)
            if subtitle:
                pdf.set_font("Arial", "", 8)
                pdf.set_text_color(100, 110, 120)
                pdf.multi_cell(190, 5, clean_text(subtitle))
                pdf.set_text_color(35, 45, 55)

        def metric_grid(metrics):
            items = list(metrics.items())
            for index, (label, value) in enumerate(items):
                column = index % 4
                x = 10 + column * 47.5
                if column == 0 and index:
                    pdf.ln(18)
                y = pdf.get_y()
                pdf.set_xy(x, y)
                pdf.set_fill_color(232, 239, 243)
                pdf.set_draw_color(185, 201, 211)
                pdf.rect(x, y, 44.5, 16, "DF")
                pdf.set_xy(x + 2, y + 2)
                pdf.set_font("Arial", "", 7)
                pdf.set_text_color(85, 100, 110)
                pdf.cell(40.5, 4, clean_text(label[:27]), 0, 2)
                pdf.set_font("Arial", "B", 12)
                pdf.set_text_color(45, 75, 92)
                pdf.cell(40.5, 7, clean_text(value), 0, 0)
            if items:
                pdf.set_y(pdf.get_y() + 18)
            pdf.set_text_color(35, 45, 55)

        def count_table(title, rows, empty_text):
            section_title(title)
            if not rows:
                pdf.set_font("Arial", "I", 9)
                pdf.cell(190, 7, clean_text(empty_text), 0, 1)
                return
            max_count = max(count for _, count in rows) or 1
            for label, count in rows[:10]:
                pdf.set_font("Arial", "", 8)
                pdf.cell(42, 6, clean_text(str(label)[:24]), 0, 0)
                width = max(2, 115 * count / max_count)
                pdf.set_fill_color(111, 167, 197)
                pdf.cell(width, 5, "", 0, 0, fill=True)
                pdf.cell(120 - width, 5, "", 0, 0)
                pdf.set_font("Arial", "B", 8)
                pdf.cell(20, 6, str(count), 0, 1, "R")

        pdf.set_font("Arial", "B", 22)
        pdf.set_text_color(45, 75, 92)
        pdf.cell(190, 12, "Informe de actividad y control", 0, 1)
        pdf.set_font("Arial", "", 10)
        pdf.set_text_color(90, 105, 115)
        pdf.cell(190, 6, clean_text(f"Periodo: {start_date.strftime('%d/%m/%Y')} al {datetime.now().strftime('%d/%m/%Y')} ({days} dias)"), 0, 1)
        filters = [
            f"Entidad: {entity_type or 'todas'}",
            f"Accion: {action or 'todas'}",
            f"Usuario: {'seleccionado' if user_id else 'todos'}",
        ]
        pdf.cell(190, 6, clean_text(" | ".join(filters)), 0, 1)

        section_title("Estado actual de Ludisist", "Inventario disponible al momento de generar el documento.")
        metric_grid(system_stats)
        section_title("Seguridad y accesos", f"Eventos registrados durante los ultimos {days} dias.")
        metric_grid(security_stats)
        section_title("Actividad del periodo")
        metric_grid({
            "Registros totales": period_query.count(),
            "Registros filtrados": len(logs),
            "Usuarios con actividad": len(user_activity),
            "Tipos de entidad": len(entity_counts),
        })

        count_table("Acciones mas frecuentes", action_counts, "No se registraron acciones.")
        count_table("Actividad por modulo", entity_counts, "No se registraron entidades.")
        count_table("Usuarios con mayor actividad", user_activity, "No se registro actividad de usuarios.")

        pdf.add_page()
        section_title(
            "Detalle de registros filtrados",
            f"{len(logs)} eventos. Los detalles sensibles se muestran como metadatos administrativos, nunca como contrasenas en texto plano.",
        )

        def detail_header():
            pdf.set_fill_color(54, 88, 107)
            pdf.set_text_color(255, 255, 255)
            pdf.set_font("Arial", "B", 8)
            for width, label in [(29, "Fecha"), (28, "Usuario"), (31, "Accion"), (31, "Entidad"), (71, "Nombre")]:
                pdf.cell(width, 7, label, 1, 0, "C", True)
            pdf.ln()
            pdf.set_text_color(35, 45, 55)

        detail_header()
        for log in logs:
            details = " | ".join(f"{key}: {value}" for key, value in (log.details or {}).items())
            required_height = 8 + (10 if details else 0)
            if pdf.get_y() + required_height > 275:
                pdf.add_page()
                detail_header()
            pdf.set_font("Arial", "", 7)
            values = [
                log.timestamp.strftime("%d/%m/%y %H:%M"),
                str(log.username or "Sistema")[:16],
                str(log.action)[:18],
                str(log.entity_type)[:18],
                str(log.entity_name or "-")[:38],
            ]
            for width, value in zip((29, 28, 31, 31, 71), values):
                pdf.cell(width, 7, clean_text(value), 1)
            pdf.ln()
            if details:
                pdf.set_font("Arial", "I", 7)
                pdf.set_text_color(85, 95, 105)
                pdf.set_fill_color(242, 246, 248)
                pdf.multi_cell(190, 4, clean_text(f"Detalles: {details[:500]}"), 1, "L", True)
                pdf.set_text_color(35, 45, 55)

        if not logs:
            pdf.set_font("Arial", "I", 9)
            pdf.cell(190, 10, "No hay registros para los filtros seleccionados.", 1, 1, "C")

        pdf_bytes = pdf.output(dest="S")
        if isinstance(pdf_bytes, bytearray):
            pdf_bytes = bytes(pdf_bytes)

        return StreamingResponse(
            io.BytesIO(pdf_bytes),
            media_type="application/pdf",
            headers={"Content-Disposition": f"attachment; filename=reporte_ludisist_{datetime.now().strftime('%Y%m%d')}.pdf"}
        )
    except Exception as e:
        import traceback
        error_msg = traceback.format_exc()
        try:
            with open("pdf_error.log", "w") as f:
                f.write(f"Timestamp: {datetime.now()}\n")
                f.write(f"Error: {str(e)}\n")
                f.write(error_msg)
        except:
            pass

        print(f"PDF GENERATION ERROR: {e}")
        # Return plain text error for better visibility in browser if possible, or 500
        raise HTTPException(status_code=500, detail=f"Error generando PDF: {str(e)}")
