"""Levanta una instancia aislada de Ludisist para pruebas locales."""

import os
from pathlib import Path
import secrets
import sys
from tempfile import TemporaryDirectory


def main():
    username = os.environ.get("LUDISIST_QA_USERNAME", "jugador_qa")
    password = os.environ.get("LUDISIST_QA_PASSWORD")
    if not password:
        raise SystemExit("Configura LUDISIST_QA_PASSWORD con una contraseña de prueba.")

    backend = Path(__file__).resolve().parent.parent / "backend"
    sys.path.insert(0, str(backend))

    with TemporaryDirectory(prefix="ludisist-qa-") as directory:
        workdir = Path(directory)
        os.chdir(workdir)
        os.environ.update(
            DATABASE_URL=f"sqlite:///{(workdir / 'qa.sqlite3').as_posix()}",
            SECRET_KEY=secrets.token_hex(32),
            STORAGE_CLEANUP_ENABLED="false",
            EMAIL_DELIVERY_MODE="console",
        )

        import uvicorn
        from app.main import app
        from app.core.security import get_password_hash
        from app.database.base import SessionLocal, engine
        from app.models import Game, User
        from fastapi.middleware.cors import CORSMiddleware

        app.add_middleware(
            CORSMiddleware,
            allow_origins=["http://127.0.0.1:3101"],
            allow_methods=["*"],
            allow_headers=["*"],
        )

        try:
            with SessionLocal() as db:
                password_hash = get_password_hash(password)
                db.add_all([User(
                    username=username,
                    email="jugador.qa@example.com",
                    password=password_hash,
                    role="player",
                    email_verified=True,
                ), User(
                    username="organizador_qa",
                    email="organizador.qa@example.com",
                    password=password_hash,
                    role="admin",
                    email_verified=True,
                )])
                game = Game(name="Ajedrez QA", slug="ajedrez-qa", description="Juego de prueba.", min_players=2, max_players=2)
                db.add(game)
                db.commit()
                game_id = str(game.id)

            @app.get("/qa-fixture", include_in_schema=False)
            def fixture():
                return {"ambiente": "ludisist-qa-local", "juego": game_id}

            uvicorn.run(app, host="127.0.0.1", port=8110)
        finally:
            engine.dispose()
            os.chdir(backend)


if __name__ == "__main__":
    main()
