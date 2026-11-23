"""Panel local de Ludisist QA. Iniciar con un solo proceso de Uvicorn."""

from concurrent.futures import ThreadPoolExecutor
from contextlib import asynccontextmanager
from datetime import datetime, timezone
import json
import logging
from pathlib import Path
import smtplib
from threading import RLock
from time import sleep
from uuid import UUID, uuid4

from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from starlette.middleware.trustedhost import TrustedHostMiddleware
from pydantic import BaseModel, EmailStr

from reports import send_reports, write_html_report, write_reports
from smoke_login import CASE_ID
from suites import SUITES, catalog as suite_catalog, run_case

ROOT = Path(__file__).resolve().parent
RUNS = ROOT / "artifacts"
DIST = ROOT / "frontend" / "dist"
ACTIVE = {"Pendiente", "En curso"}
LOCK = RLock()
LOG = logging.getLogger(__name__)


def now():
    return datetime.now(timezone.utc).isoformat()


def save(run):
    path = RUNS / run["id"] / "corrida.json"
    temporary = path.with_suffix(".tmp")
    with LOCK:
        temporary.write_text(json.dumps(run, ensure_ascii=False), encoding="utf-8")
        for attempt in range(6):
            try:
                temporary.replace(path)
                return
            except PermissionError:
                if attempt == 5:
                    raise
                sleep(0.05 * (attempt + 1))


def handle_worker_error(future, run_id):
    error = future.exception()
    if error is None:
        return
    LOG.error("El trabajador interrumpió la corrida %s", run_id, exc_info=error)
    with LOCK:
        run = load(run_id)
        if run["correo_estado"] == "Enviando":
            run.update(correo_estado="Sin confirmar", correo_error="Verifica el buzón antes de reintentar.")
        else:
            run.update(estado="Fallida", fin=now(), error="El ejecutor se interrumpió al guardar la ejecución.")
        save(run)


def load(run_id):
    path = RUNS / run_id / "corrida.json"
    with LOCK:
        if not path.is_file():
            raise HTTPException(404, "No se encontró esa ejecución.")
        return json.loads(path.read_text(encoding="utf-8"))


def history():
    return sorted(
        (load(path.parent.name) for path in RUNS.glob("*/corrida.json")),
        key=lambda run: run["inicio"], reverse=True,
    )


def deliver(run, *, refresh_html=False):
    try:
        directory = RUNS / run["id"]
        if refresh_html:
            write_html_report(directory, run)
        send_reports(directory, run)
        run.update(correo_estado="Enviado", correo_error=None)
    except ValueError as error:
        run.update(correo_estado="Fallido", correo_error=str(error))
    except smtplib.SMTPAuthenticationError:
        run.update(correo_estado="Fallido", correo_error="El servidor SMTP rechazó la autenticación. Verifica la cuenta remitente y su contraseña de aplicación.")
    except smtplib.SMTPRecipientsRefused:
        run.update(correo_estado="Fallido", correo_error="El servidor SMTP rechazó el correo destinatario.")
    except (OSError, smtplib.SMTPConnectError):
        run.update(correo_estado="Fallido", correo_error="No se pudo conectar con el servidor SMTP. Verifica la conexión, el host y el puerto.")
    except Exception:
        LOG.warning("Falló SMTP en la corrida %s", run["id"])
        run.update(correo_estado="Fallido", correo_error="El servidor SMTP no confirmó el envío. Revisa la configuración.")
    save(run)


def execute(run):
    run.update(estado="En curso", inicio=now())
    save(run)
    directory = RUNS / run["id"]
    _, entries = SUITES[run["suite"]]
    for entry in entries:
        case_id = entry["id"]
        if case_id not in run["seleccion"]:
            continue
        try:
            result = run_case(directory / case_id, entry, controlled_failure=run["fallo_controlado"])
        except Exception:
            LOG.exception("El caso %s se interrumpió en la corrida %s", case_id, run["id"])
            result = {
                "id": case_id, "nombre": entry["nombre"], "estado": "NOT RUN",
                "esperado": entry["esperado"], "datos": entry["datos"], "pasos": [],
                "observacion": "Error interno del ejecutor de QA.",
                "inicio": now(), "fin": now(), "duracion_segundos": 0,
            }
        run["casos"].append(result)
        save(run)
    statuses = {case["estado"] for case in run["casos"]}
    overall = next(state for state in ("NOT RUN", "FAIL", "PASS", "SKIPPED") if state in statuses)
    run.update(fin=now(), resultado=overall, estado="Fallida" if "NOT RUN" in statuses else "Finalizada")
    try:
        write_reports(directory, run)
    except Exception:
        LOG.exception("No se generaron los informes de %s", run["id"])
        run.update(estado="Fallida", error="No se pudieron generar los informes.")
        save(run)
        return
    run.update(reportes=True, correo_estado="Enviando")
    save(run)
    deliver(run)


@asynccontextmanager
async def lifespan(app):
    RUNS.mkdir(exist_ok=True)
    for run in history():
        if run["estado"] in ACTIVE:
            run.update(estado="Fallida", fin=now(), error="La ejecución se interrumpió al cerrar el panel.")
        elif run["correo_estado"] == "Enviando":
            run.update(correo_estado="Sin confirmar", correo_error="El panel se cerró durante el envío. Verifica el buzón antes de reintentar.")
        else:
            continue
        save(run)
    with ThreadPoolExecutor(max_workers=1) as worker:
        app.state.worker = worker
        yield


app = FastAPI(title="Ludisist QA", lifespan=lifespan)
app.add_middleware(TrustedHostMiddleware, allowed_hosts=["127.0.0.1", "localhost"])


class RunRequest(BaseModel):
    correo: EmailStr
    suite: str = "Smoke"
    casos: list[str]
    fallo_controlado: bool = False


def require_panel(x_ludisist_qa: str = Header(default="")):
    if x_ludisist_qa != "panel":
        raise HTTPException(403, "Acción disponible desde el panel local.")


@app.get("/api/catalogo")
def catalog():
    return suite_catalog()


@app.get("/api/corridas")
def list_runs():
    return history()[:30]


@app.post("/api/corridas", status_code=202, dependencies=[Depends(require_panel)])
def start_run(request: RunRequest):
    if request.suite not in SUITES:
        raise HTTPException(422, "La suite seleccionada no existe.")
    kind, entries = SUITES[request.suite]
    allowed = {entry["id"] for entry in entries}
    selected = set(request.casos)
    if not selected or not selected <= allowed or len(selected) != len(request.casos):
        raise HTTPException(422, "Selecciona uno o más casos válidos de la suite.")
    if request.fallo_controlado and (request.suite != "Smoke" or CASE_ID not in selected):
        raise HTTPException(422, "El fallo controlado pertenece al caso de login de Smoke.")
    with LOCK:
        if any(run["estado"] in ACTIVE or run["correo_estado"] == "Enviando" for run in history()):
            raise HTTPException(409, "Ya hay una ejecución o un envío en curso.")
        run = {
            "id": uuid4().hex, "correo": request.correo, "estado": "Pendiente",
            "inicio": now(), "fin": None, "casos": [], "reportes": False,
            "suite": request.suite, "tipo": kind, "seleccion": request.casos,
            "correo_estado": "Pendiente", "fallo_controlado": request.fallo_controlado,
        }
        (RUNS / run["id"]).mkdir()
        save(run)
        job = app.state.worker.submit(execute, dict(run))
        job.add_done_callback(lambda future: handle_worker_error(future, run["id"]))
    return run


@app.post("/api/corridas/{run_id}/correo", status_code=202, dependencies=[Depends(require_panel)])
def retry_email(run_id: UUID):
    with LOCK:
        run = load(run_id.hex)
        if not run["reportes"] or run["correo_estado"] not in {"Fallido", "Sin confirmar"}:
            raise HTTPException(409, "Esta ejecución no tiene un envío pendiente de reintento.")
        run.update(correo_estado="Enviando", correo_error=None)
        save(run)
        job = app.state.worker.submit(deliver, dict(run), refresh_html=True)
        job.add_done_callback(lambda future: handle_worker_error(future, run["id"]))
    return run


@app.get("/api/corridas/{run_id}/reportes/{filename}")
def download(run_id: UUID, filename: str):
    types = {"informe.pdf": "application/pdf", "resumen.html": "text/html"}
    if filename not in types or not load(run_id.hex)["reportes"]:
        raise HTTPException(404, "Reporte no disponible.")
    return FileResponse(RUNS / run_id.hex / filename, media_type=types[filename], filename=filename)


@app.get("/")
def index():
    if not (DIST / "index.html").is_file():
        raise HTTPException(503, "Compila el frontend de Ludisist QA con npm run build.")
    return FileResponse(DIST / "index.html")


app.mount("/assets", StaticFiles(directory=DIST / "assets", check_dir=False), name="assets")
