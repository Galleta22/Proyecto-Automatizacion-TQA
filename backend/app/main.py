import os
import asyncio
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from app.api.routers import auth, users, games, rules, audit, upload, ai, admin, tips, manuals, sessions, badges, matchmaking, notifications, messages, tournaments, content_review
from app.migrations import run_migrations
from app.services.storage_cleanup import storage_cleanup_loop

# Set client encoding to utf8 to avoid issues with specialized characters
os.environ["PGCLIENTENCODING"] = "utf8"

# Apply pending migrations and create tables on a fresh installation.
try:
    run_migrations()
except Exception as e:
    raise RuntimeError(f"Error al preparar la base de datos: {e}") from e

@asynccontextmanager
async def lifespan(app: FastAPI):
    cleanup_enabled = os.getenv("STORAGE_CLEANUP_ENABLED", "true").lower() in {"1", "true", "yes"}
    cleanup_task = asyncio.create_task(storage_cleanup_loop()) if cleanup_enabled else None
    try:
        yield
    finally:
        if cleanup_task:
            cleanup_task.cancel()
            try:
                await cleanup_task
            except asyncio.CancelledError:
                pass


app = FastAPI(title="Ludisist API", lifespan=lifespan)


@app.exception_handler(RequestValidationError)
async def validation_error_handler(_request: Request, exc: RequestValidationError):
    messages = {
        "missing": "Obligatorio.",
        "string_too_short": "Muy corto.",
        "string_too_long": "Muy largo.",
        "greater_than_equal": "Valor muy bajo.",
        "less_than_equal": "Valor muy alto.",
        "value_error": "Dato no válido.",
        "uuid_parsing": "Selección no válida.",
        "datetime_from_date_parsing": "Fecha no válida.",
    }
    detail = []
    for error in exc.errors():
        context = {
            key: value for key, value in error.get("ctx", {}).items()
            if value is None or isinstance(value, (str, int, float, bool))
        }
        detail.append({
            "type": error.get("type"),
            "loc": error.get("loc", []),
            "msg": messages.get(error.get("type"), "Dato no válido."),
            "ctx": context,
        })
    return JSONResponse(status_code=422, content={"detail": detail})

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:8000",
        "http://127.0.0.1:8000",
        # "http://localhost:3001"  # Add specific origins as needed
        # Nota: en producción, quita "*" y usa orígenes específicos
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, tags=["Auth"])
app.include_router(users.router, prefix="/users", tags=["Users"])
app.include_router(games.router, prefix="/games", tags=["Games"])
app.include_router(rules.router, prefix="/rules", tags=["Rules"])
app.include_router(audit.router, prefix="/audit-logs", tags=["Audit"])
app.include_router(upload.router, tags=["Upload"])
app.include_router(ai.router, prefix="/ai", tags=["AI"])
app.include_router(admin.router, prefix="/admin", tags=["Admin"])
app.include_router(tips.router, prefix="/tips", tags=["Tips"])
app.include_router(manuals.router, prefix="/manuals", tags=["Digital manuals"])
app.include_router(sessions.router, prefix="/sessions", tags=["Game sessions"])
app.include_router(badges.router, prefix="/badges", tags=["Badges"])
app.include_router(matchmaking.router, prefix="/matchmaking", tags=["Matchmaking"])
app.include_router(notifications.router, prefix="/notifications", tags=["Notifications"])
app.include_router(messages.router, prefix="/messages", tags=["Messages"])
app.include_router(content_review.router, prefix="/content-review", tags=["Revisión de contenido"])
app.include_router(tournaments.router, prefix="/tournaments", tags=["Tournaments"])

@app.get("/")
async def root():
    return {"message": "✅ Ludisist API funcionando!"}
