"""Casos del catálogo y ejecución sobre la instancia local de pruebas."""

from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
import json
from math import ceil
import os
import re
from time import monotonic
from urllib.error import HTTPError
from urllib.request import Request, urlopen
from uuid import uuid4

from playwright.sync_api import Error, expect, sync_playwright

from smoke_login import CASE_ID, EXPECTED, LOGIN_API, MASK_COLOR, TARGET, run_login

API = LOGIN_API.removesuffix("/login")
ADMIN = "organizador_qa"
GAME = "Ajedrez QA"
PLAYERS = ("Ana QA", "Bruno QA", "Carla QA", "Diego QA")
LOAD_PATH = "/games/?paginated=true&page_size=20"
CLIENTS, REQUESTS_PER_CLIENT = 5, 12
P95_LIMIT, ERROR_LIMIT = 750, 1


class CaseEvidence:
    def __init__(self, directory):
        self.directory = directory
        self.steps = []
        self.metrics = {}
        self.current = "Preparar el ambiente de QA"
        self.error_image = None

    def begin(self, action):
        self.current = action

    def record(self, observed, page=None):
        step = {"accion": self.current, "observado": observed}
        if page is not None:
            filename = f"{len(self.steps) + 1:02d}-paso.png"
            page.screenshot(path=self.directory / filename, timeout=5000)
            step["evidencia"] = filename
        self.steps.append(step)


def api(method, path, payload=None, token=None, expected=200):
    headers = {"Accept": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    body = None
    if payload is not None:
        headers["Content-Type"] = "application/json"
        body = json.dumps(payload).encode()
    request = Request(API + path, data=body, headers=headers, method=method)
    try:
        with urlopen(request, timeout=8) as response:
            status, content = response.status, response.read()
    except HTTPError as error:
        with error:
            status, content = error.code, error.read()
    if status >= 500:
        raise RuntimeError(f"{method} {path} respondió HTTP {status}.")
    if status != expected:
        raise AssertionError(f"{method} {path}: HTTP {status}; se esperaba HTTP {expected}.")
    return json.loads(content)


def password():
    value = os.environ.get("LUDISIST_QA_PASSWORD")
    if not value:
        raise RuntimeError("Falta la contraseña del ambiente de pruebas.")
    return value


def organizer_token():
    return api("POST", "/login", {"username": ADMIN, "password": password()})["access_token"]


def check(condition, reason):
    if not condition:
        raise AssertionError(reason)


def fixture_game():
    try:
        fixture = api("GET", "/qa-fixture")
        if fixture["ambiente"] == "ludisist-qa-local":
            return fixture["juego"]
    except (AssertionError, KeyError):
        pass
    raise RuntimeError("Reinicia qa/target.py para cargar los datos de prueba de esta versión.")


def sanity_game(evidence, game_id):
    evidence.begin("Leer la ficha inicial del juego y autenticar al organizador")
    path = f"/games/{game_id}"
    original = api("GET", path)
    token = organizer_token()
    evidence.record(f"La ficha identifica a {original['name']}; el organizador obtuvo su sesión.")
    evidence.begin("Actualizar la descripción del juego")
    description = f"Descripción verificada QA {uuid4().hex[:8]}"
    try:
        api("PUT", path, {"description": description}, token)
        evidence.record(f"HTTP 200 al guardar «{description}».")
        evidence.begin("Consultar otra vez la ficha del juego")
        fresh = api("GET", path)
        check(fresh["description"] == description, f"Descripción obtenida: {fresh['description']!r}; se esperaba {description!r}.")
        evidence.record(f"HTTP 200. La ficha devuelve «{description}».")
    finally:
        api("PUT", path, {"description": original["description"]}, token)


def regression_login(evidence, _game_id):
    evidence.begin("Enviar una contraseña incorrecta para el jugador de QA")
    username = os.environ.get("LUDISIST_QA_USERNAME", "jugador_qa")
    secret = password()
    wrong = ("A" if secret[0] != "A" else "B") + secret[1:]
    response = api("POST", "/login", {"username": username, "password": wrong}, expected=401)
    check("access_token" not in response, "La respuesta de rechazo contiene un token.")
    evidence.record("HTTP 401 y una respuesta sin token.")


def prepare_tournament(evidence, game_id, *, public=False):
    evidence.begin("Crear un torneo individual y registrar cuatro participantes de prueba")
    token = organizer_token()
    tournament = api("POST", "/tournaments/", {
        "name": f"Torneo QA {uuid4().hex[:8]}", "game_id": game_id, "is_public": public,
    }, token)
    path = f"/tournaments/{tournament['id']}"
    for name in PLAYERS:
        api("POST", path + "/participants", {"external_name": name}, token)
    evidence.record(f"Torneo {tournament['name']}; se inscribieron cuatro personas.")
    evidence.begin("Iniciar el torneo y registrar el ganador de la primera mesa")
    api("POST", path + "/start", token=token)
    started = api("GET", path, token=token)
    match = started["rounds"][0]["matches"][0]
    winner = match["participant1_name"]
    api("PUT", f"/tournaments/matches/{match['id']}/result", {
        "winner_id": match["participant1_id"], "score_p1": 1, "score_p2": 0,
    }, token)
    evidence.record(f"HTTP 200 al registrar a {winner} como ganador de la mesa {match['table_number']}.")
    return token, tournament["id"], match, winner


def integration_tournament(evidence, game_id):
    token, tournament_id, match, winner = prepare_tournament(evidence, game_id)
    evidence.begin("Leer el torneo en una petición nueva y comprobar la clasificación")
    fresh = api("GET", f"/tournaments/{tournament_id}", token=token)
    stored = next(item for item in fresh["rounds"][0]["matches"] if item["id"] == match["id"])
    check(stored["status"] == "completed" and stored["winner_id"] == match["participant1_id"],
          "La mesa no conserva el estado finalizado y el ganador esperado.")
    first = fresh["standings"][0]
    check(first["id"] == match["participant1_id"] and first["points"] == 1 and first["wins"] == 1,
          f"Clasificación obtenida: {first['name']}, {first['points']} puntos y {first['wins']} victorias.")
    evidence.record(f"Mesa finalizada y {winner} en primer puesto con 1 punto y 1 victoria.")


def with_browser(evidence, scenario):
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(channel=os.environ.get("LUDISIST_QA_BROWSER"))
        context = browser.new_context(viewport={"width": 1280, "height": 900}, service_workers="block")
        page = context.new_page()
        page.set_default_timeout(8000)

        def guard(route):
            if route.request.method in {"POST", "PUT", "PATCH", "DELETE"} and not route.request.url.startswith(API + "/"):
                route.abort()
            else:
                route.continue_()

        context.route("**/*", guard)
        try:
            scenario(page)
        except Exception:
            try:
                page.screenshot(path=evidence.directory / "error.png", timeout=3000,
                                mask=[page.locator("#login-username, #login-password")], mask_color=MASK_COLOR)
                evidence.error_image = "error.png"
            except Error:
                pass
            raise
        finally:
            browser.close()


def regression_standings(evidence, game_id):
    _, tournament_id, _, winner = prepare_tournament(evidence, game_id, public=True)

    def scenario(page):
        evidence.begin("Abrir la clasificación pública antes de recargar")
        page.goto(f"{TARGET}/torneos/{tournament_id}", wait_until="domcontentloaded")
        heading = page.get_by_role("heading", name="Clasificación", exact=True)
        expect(heading).to_be_visible(timeout=8000)
        entries = heading.locator("xpath=following-sibling::ol[1]").get_by_role("listitem")
        expect(entries).to_have_count(4)
        expect(entries.first).to_contain_text(f"{winner}: 1 puntos")
        before = entries.all_text_contents()
        evidence.record(f"{winner} aparece primero con 1 punto.", page)
        evidence.begin("Recargar y comprobar el orden y los puntos de todos los participantes")
        page.reload(wait_until="domcontentloaded")
        expect(entries).to_have_text(before, timeout=8000)
        evidence.record("Se conservaron el orden y los puntos de los cuatro participantes.", page)

    with_browser(evidence, scenario)


def e2e_tournament(evidence, _game_id):
    def scenario(page):
        evidence.begin("Iniciar sesión como organizador desde el navegador")
        page.goto(f"{TARGET}/login", wait_until="domcontentloaded")
        page.get_by_label("Usuario", exact=True).fill(ADMIN)
        page.get_by_label("Contraseña", exact=True).fill(password())
        page.get_by_role("button", name="Iniciar sesión", exact=True).click()
        expect(page).to_have_url(f"{TARGET}/", timeout=8000)
        page.goto(f"{TARGET}/admin?modulo=tournaments", wait_until="domcontentloaded")
        create = page.get_by_role("button", name=re.compile("Nuevo torneo", re.I))
        expect(create).to_be_visible(timeout=8000)
        evidence.record("Se abrió la gestión de torneos.")
        evidence.begin("Crear un torneo individual desde el formulario de gestión")
        name = f"Torneo web QA {uuid4().hex[:8]}"
        create.click()
        page.get_by_label(re.compile("Nombre del Torneo")).fill(name)
        page.get_by_label(re.compile(r"^Juego \*")).select_option(label=GAME)
        page.get_by_role("button", name="Guardar borrador").click()
        expect(page.get_by_role("heading", name=name, exact=True)).to_be_visible(timeout=8000)
        evidence.record(f"Se creó el borrador «{name}».", page)
        evidence.begin("Inscribir a cuatro personas externas e iniciar el torneo")
        page.get_by_role("button", name=re.compile("^Participantes")).click()
        page.get_by_role("button", name="Persona Externa (Invitado)").click()
        for player in PLAYERS:
            page.get_by_label("Nombre de la persona externa").fill(player)
            page.get_by_role("button", name="Inscribir", exact=True).click()
            expect(page.locator(".participant-name").filter(has_text=player)).to_be_visible(timeout=8000)
        page.get_by_role("button", name=re.compile("^Iniciar torneo")).click()
        page.get_by_role("dialog").get_by_role("button", name="Confirmar", exact=True).click()
        result = page.get_by_role("button", name="Registrar Resultado", exact=True)
        expect(result).to_have_count(2, timeout=8000)
        evidence.record("La primera ronda presenta dos resultados por registrar.", page)
        evidence.begin("Registrar una victoria desde la mesa y comprobar la clasificación")
        result.first.click()
        winner_card = page.locator(".result-player-card").first
        winner = winner_card.locator(".player-name").inner_text()
        winner_card.click()
        page.get_by_role("button", name="Guardar resultado").click()
        expect(page.get_by_role("button", name="Finalizada", exact=True)).to_be_visible(timeout=8000)
        page.get_by_role("button", name="Clasificación", exact=True).click()
        first = page.locator(".standings-table tbody tr").first
        expect(first).to_contain_text(winner)
        expect(first.get_by_role("cell").nth(3)).to_have_text("1")
        evidence.record(f"{winner} aparece en primer puesto con 1 punto.", page)

    with_browser(evidence, scenario)


def performance(evidence, game_id):
    evidence.begin("Confirmar que el catálogo devuelve el juego de prueba")
    page = api("GET", LOAD_PATH)
    check(any(item["id"] == game_id for item in page["items"]), "El juego de prueba no aparece en el catálogo.")
    evidence.record("El catálogo de prueba está disponible y contiene Ajedrez QA.")
    evidence.begin(f"Medir el catálogo con {CLIENTS} clientes concurrentes")

    def client(_index):
        samples = []
        for _ in range(REQUESTS_PER_CLIENT):
            started = monotonic()
            try:
                data = api("GET", LOAD_PATH)
                success = any(item["id"] == game_id for item in data["items"])
            except (OSError, ValueError, KeyError, AssertionError, RuntimeError):
                success = False
            samples.append(((monotonic() - started) * 1000, success))
        return samples

    started = monotonic()
    with ThreadPoolExecutor(max_workers=CLIENTS) as workers:
        samples = [item for batch in workers.map(client, range(CLIENTS)) for item in batch]
    elapsed = monotonic() - started
    latencies = sorted(latency for latency, _ in samples)
    p95 = latencies[ceil(len(samples) * .95) - 1]
    errors = sum(not success for _, success in samples)
    rate = errors / len(samples) * 100
    evidence.metrics = {
        "Clientes concurrentes": CLIENTS, "Peticiones": len(samples), "Errores": errors,
        "Latencia p95 (ms)": round(p95, 2), "Límite p95 (ms)": P95_LIMIT,
        "Tasa de error (%)": round(rate, 2), "Límite de error (%)": ERROR_LIMIT,
        "Peticiones por segundo": round(len(samples) / elapsed, 2),
    }
    evidence.record(f"{len(samples)} peticiones; p95 {p95:.2f} ms y {rate:.2f}% de errores.")
    evidence.begin("Comparar las métricas con los umbrales")
    check(p95 <= P95_LIMIT and rate <= ERROR_LIMIT,
          f"p95 {p95:.2f} ms (máximo {P95_LIMIT}) y error {rate:.2f}% (máximo {ERROR_LIMIT}%).")
    evidence.record("Se cumplieron ambos umbrales de rendimiento.")


def case(case_id, name, expected, runner, data):
    return {"id": case_id, "nombre": name, "esperado": expected, "runner": runner, "datos": data}


LOGIN = case(CASE_ID, "Inicio de sesión válido", EXPECTED, None, "Cuenta verificada de jugador QA.")
SUITES = {
    "Smoke": ("Funcional", [LOGIN]),
    "Sanity": ("Funcional", [
        case("TC-SAN-001", "Editar la ficha de un juego", "La ficha devuelve la descripción nueva.", sanity_game, "Ajedrez QA y una descripción única."),
    ]),
    "Regression": ("Funcional", [
        LOGIN,
        case("TC-REG-001", "Rechazo de credenciales incorrectas", "HTTP 401 sin emitir token.", regression_login, "Jugador QA y contraseña incorrecta."),
        case("TC-REG-002", "Clasificación tras recargar", "La clasificación pública conserva orden y puntos.", regression_standings, "Torneo público con cuatro participantes y una victoria."),
    ]),
    "Integration": ("Funcional", [
        case("TC-INT-001", "Guardar el resultado y actualizar la clasificación", "La API conserva el ganador y lo clasifica primero con 1 punto y 1 victoria.", integration_tournament, "Torneo individual con cuatro participantes y resultado 1–0."),
    ]),
    "E2E": ("Funcional", [
        case("TC-E2E-001", "Gestionar un torneo desde el navegador", "La victoria registrada aparece en la tabla de clasificación.", e2e_tournament, "Organizador QA, Ajedrez QA y cuatro participantes externos."),
    ]),
    "Rendimiento": ("No funcional", [
        case("TC-PER-001", "Carga concurrente sobre el catálogo", f"p95 de hasta {P95_LIMIT} ms y tasa de error de hasta {ERROR_LIMIT}%.", performance, "5 clientes concurrentes, 12 solicitudes por cliente al catálogo local."),
    ]),
}


def catalog():
    return [{"tipo": kind, "suite": suite, "casos": [{key: entry[key] for key in ("id", "nombre", "esperado")} for entry in cases]}
            for suite, (kind, cases) in SUITES.items()]


def run_case(directory, entry, *, controlled_failure=False):
    directory.mkdir(exist_ok=True)
    evidence = CaseEvidence(directory)
    started = monotonic()
    timestamps = lambda: datetime.now(timezone.utc).isoformat()
    info = {key: value for key, value in entry.items() if key != "runner"}
    result = {**info, "inicio": timestamps(), "pasos": evidence.steps}
    try:
        if entry["id"] == CASE_ID:
            result.update(run_login(directory, controlled_failure=controlled_failure))
        else:
            entry["runner"](evidence, fixture_game())
            result["estado"] = "PASS"
    except AssertionError as error:
        result.update(estado="FAIL", observacion=str(error).splitlines()[0])
    except (OSError, Error, ValueError, KeyError, RuntimeError) as error:
        detail = str(error) if isinstance(error, RuntimeError) else type(error).__name__
        result.update(estado="NOT RUN", observacion=f"Error de ejecución. {detail}")
    if result["estado"] != "PASS" and entry["id"] != CASE_ID:
        result["paso_fallido"] = evidence.current
    if evidence.error_image:
        result["evidencia_error"] = evidence.error_image
    if evidence.metrics:
        result["metricas"] = evidence.metrics
    result.update(fin=timestamps(), duracion_segundos=round(monotonic() - started, 3))
    return result
