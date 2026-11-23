"""TC-SMK-001 · Inicio de sesión con una cuenta de prueba activa."""

from datetime import datetime, timezone
import json
import os
from pathlib import Path
from time import monotonic
from uuid import uuid4

from playwright.sync_api import Error, expect, sync_playwright

CASE_ID = "TC-SMK-001"
TARGET = "http://127.0.0.1:3101"
LOGIN_API = "http://127.0.0.1:8110/login"
EXPECTED = "La sesión permite abrir la pantalla Mi cuenta y privacidad."
MASK_COLOR = "#a7b7c4"


def run_login(output, *, controlled_failure=False):
    username = os.environ.get("LUDISIST_QA_USERNAME", "jugador_qa")
    password = os.environ.get("LUDISIST_QA_PASSWORD")
    if not password:
        raise RuntimeError("Configura LUDISIST_QA_PASSWORD con una contraseña de prueba.")

    if controlled_failure:
        password = ("A" if password[0] != "A" else "B") + password[1:]
    output.mkdir(parents=True, exist_ok=True)
    result = {
        "id": CASE_ID,
        "suite": "Smoke",
        "nombre": "Inicio de sesión válido",
        "esperado": EXPECTED,
        "inicio": datetime.now(timezone.utc).isoformat(),
        "pasos": [],
    }
    started = monotonic()
    step = "Preparar el navegador"
    try:
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(channel=os.environ.get("LUDISIST_QA_BROWSER"))
            page = browser.new_page(viewport={"width": 1280, "height": 900})
            page.set_default_timeout(10000)
            login_url = None

            def route_login(route):
                nonlocal login_url
                if route.request.method != "POST":
                    route.fallback()
                    return
                login_url = route.request.url
                if login_url == LOGIN_API:
                    route.continue_()
                else:
                    route.abort()

            page.route("**/login", route_login)
            credentials = [page.locator("#login-username, #login-password")]
            try:
                step = "Abrir el formulario de inicio de sesión"
                response = page.goto(f"{TARGET}/login", wait_until="domcontentloaded")
                if response is None or not response.ok:
                    raise RuntimeError("El frontend no devolvió una página disponible.")
                submit = page.get_by_role("button", name="Iniciar sesión", exact=True)
                expect(submit).to_be_visible(timeout=10000)
                page.screenshot(path=output / "01-formulario.png")
                result["pasos"].append({"accion": step, "evidencia": "01-formulario.png"})

                step = "Enviar las credenciales de la cuenta de prueba"
                page.get_by_label("Usuario", exact=True).fill(username)
                page.get_by_label("Contraseña", exact=True).fill(password)
                try:
                    with page.expect_response(
                        lambda response: response.url == LOGIN_API
                        and response.request.method == "POST"
                    ) as login_response:
                        submit.click()
                except Error:
                    if login_url and login_url != LOGIN_API:
                        raise RuntimeError("El frontend no apunta a la API aislada de QA.") from None
                    raise
                status = login_response.value.status
                if status >= 500:
                    raise RuntimeError(f"La API de login devolvió HTTP {status}.")
                if status != 200:
                    raise AssertionError(f"El login devolvió HTTP {status}; se esperaba HTTP 200.")
                expect(page).to_have_url(f"{TARGET}/", timeout=10000)
                result["pasos"].append({"accion": step, "observado": "HTTP 200 y regreso a Inicio."})

                step = "Verificar el acceso a la pantalla protegida de cuenta"
                page.goto(f"{TARGET}/cuenta", wait_until="domcontentloaded")
                expect(page).to_have_url(f"{TARGET}/cuenta", timeout=10000)
                expect(page.get_by_role("heading", name="Mi cuenta y privacidad")).to_be_visible()
                page.screenshot(path=output / "02-cuenta.png")
                result["pasos"].append({
                    "accion": step, "observado": EXPECTED, "evidencia": "02-cuenta.png",
                })
                result["estado"] = "PASS"
            except (AssertionError, Error, RuntimeError):
                try:
                    page.screenshot(
                        path=output / "error.png", mask=credentials, mask_color=MASK_COLOR, timeout=3000,
                    )
                    result["evidencia_error"] = "error.png"
                except Error:
                    pass
                raise
            finally:
                browser.close()
    except AssertionError as error:
        result.update(estado="FAIL", paso_fallido=step, observacion=str(error).splitlines()[0])
    except (Error, RuntimeError) as error:
        detail = str(error).splitlines()[0] if isinstance(error, RuntimeError) else type(error).__name__
        result.update(
            estado="NOT RUN",
            paso_fallido=step,
            observacion=f"Error de ejecución. {detail}",
        )
    finally:
        result["fin"] = datetime.now(timezone.utc).isoformat()
        result["duracion_segundos"] = round(monotonic() - started, 3)
        (output / "resultado.json").write_text(
            json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8"
        )

    return result


def main():
    output = Path(__file__).resolve().parent / "artifacts" / uuid4().hex
    try:
        result = run_login(output)
    except RuntimeError as error:
        raise SystemExit(str(error)) from None
    print(f"{CASE_ID} {result['estado']} | {output}")
    return {"PASS": 0, "FAIL": 1, "NOT RUN": 2}[result["estado"]]


if __name__ == "__main__":
    raise SystemExit(main())
