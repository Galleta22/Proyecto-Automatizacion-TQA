"""Informes descargables y entrega SMTP de una corrida."""

from datetime import datetime, timedelta, timezone
from email.message import EmailMessage
from html import escape
import os
import smtplib
import ssl

from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib.utils import ImageReader
from reportlab.platypus import Image, KeepTogether, Paragraph, SimpleDocTemplate, Spacer


def write_reports(directory, run):
    cases = run["casos"]
    states = [case["estado"] for case in cases]
    counts = " · ".join(f"{state} {states.count(state)}" for state in ("PASS", "FAIL", "SKIPPED", "NOT RUN"))
    summary = f"Total {len(cases)} · {counts} · Éxito {100 * states.count('PASS') / len(cases):g}%"
    duration = (datetime.fromisoformat(run["fin"]) - datetime.fromisoformat(run["inicio"])).total_seconds()
    dates = f"Inicio {run['inicio']} · Fin {run['fin']} · Duración {duration:.3f} s"
    category = f"{run['tipo']} · {run['suite']}"
    styles = getSampleStyleSheet()
    story = []

    def paragraph(value, style="BodyText"):
        return Paragraph(escape(value), styles[style])

    story.extend([
        paragraph("Ludisist QA · Informe de ejecución", "Title"),
        paragraph(f"Ejecución {run['id']}"),
        paragraph(f"Ambiente local de pruebas · {category}"),
        paragraph(f"Destinatario {run['correo']}"),
        paragraph(dates),
        paragraph(summary),
        paragraph(f"Resultado global: {run['resultado']}"),
    ])

    def add_step(text, evidence_dir, filename=None):
        items = [paragraph(text)]
        if filename and (path := evidence_dir / filename).is_file():
            width, height = ImageReader(str(path)).getSize()
            scale = min(450 / width, 310 / height)
            items.extend([Spacer(1, 6), Image(str(path), width * scale, height * scale)])
        story.extend([KeepTogether(items), Spacer(1, 8)])

    for case in cases:
        evidence_dir = directory / case["id"]
        status = case["estado"]
        observation = case.get("observacion", "Sin observaciones.")
        failed_step = case.get("paso_fallido")
        detail = f"{failed_step}. {observation}" if failed_step else observation
        story.extend([
            paragraph(f"{case['id']} · {case['nombre']}", "Heading2"),
            paragraph(f"Objetivo: {case['nombre']}."),
            paragraph("Precondiciones: instancia aislada de Ludisist con los datos de QA."),
            paragraph(f"Datos: {case['datos']}"),
            paragraph(f"Resultado esperado: {case['esperado']}"),
            paragraph(f"{status} · {case['duracion_segundos']} s · {detail}"),
        ])
        for index, step in enumerate(case["pasos"], 1):
            add_step(f"{index}. {step['accion']}. {step.get('observado', '')}".strip(), evidence_dir, step.get("evidencia"))
        if failed_step:
            add_step(f"Paso interrumpido: {detail}", evidence_dir, case.get("evidencia_error"))
        metrics = " · ".join(f"{key}: {value}" for key, value in case.get("metricas", {}).items())
        if metrics:
            story.append(paragraph(f"Métricas: {metrics}"))

    def footer(canvas, document):
        canvas.setFillColor(colors.HexColor("#4b6173"))
        canvas.setFont("Helvetica", 9)
        canvas.drawRightString(document.pagesize[0] - 48, 30, f"Ludisist QA · {document.page}")

    SimpleDocTemplate(
        str(directory / "informe.pdf"), title="Ludisist QA · Informe de ejecución",
        leftMargin=48, rightMargin=48, topMargin=42, bottomMargin=48,
    ).build(story, onFirstPage=footer, onLaterPages=footer)
    write_html_report(directory, run)


def write_html_report(directory, run):
    cases = run.get("casos") or [run["caso"]]
    suite = escape(run.get("suite", "Smoke"))
    status = run.get("resultado") or cases[0]["estado"]
    bolivia = timezone(timedelta(hours=-4))
    start = datetime.fromisoformat(run["inicio"]).astimezone(bolivia)
    end = datetime.fromisoformat(run["fin"]).astimezone(bolivia)
    duration = (end - start).total_seconds()

    def info(label, value):
        return f"<div><dt>{escape(label)}</dt><dd>{escape(str(value))}</dd></div>"

    def badge(value):
        return f'<span class="badge" data-state="{escape(value)}">{escape(value)}</span>'

    metadata = "".join([
        info("Tipo de prueba", run.get("tipo", "Funcional")),
        info("Ambiente", "Instancia local de pruebas"),
        info("Inicio (Bolivia)", start.strftime("%d/%m/%Y %H:%M:%S")),
        info("Fin (Bolivia)", end.strftime("%d/%m/%Y %H:%M:%S")),
        info("Duración", f"{duration:.3f} s"),
        info("Destinatario", run["correo"]),
        info("ID de ejecución", run["id"]),
        info("Modalidad", "Fallo controlado" if run.get("fallo_controlado") else "Normal"),
    ])
    counts = {state: sum(case["estado"] == state for case in cases)
              for state in ("PASS", "FAIL", "SKIPPED", "NOT RUN")}
    summary = "".join(info(label, count) for label, count in {"Total": len(cases), **counts}.items())
    approval = f"{100 * counts['PASS'] / len(cases):.1f}".replace(".", ",")

    rows = []
    details = []
    for index, case in enumerate(cases, 1):
        case_id = escape(case["id"])
        name = escape(case["nombre"])
        observed = case.get("observacion", "Sin observaciones.")
        steps = []
        for step in case["pasos"]:
            output = f"<p>{escape(step['observado'])}</p>" if step.get("observado") else ""
            evidence = "<small>Captura disponible en el PDF adjunto.</small>" if step.get("evidencia") else ""
            steps.append(f"<li><strong>{escape(step['accion'])}</strong>{output}{evidence}</li>")
        step_list = f"<ol>{''.join(steps)}</ol>" if steps else "<p>No se registraron pasos completados.</p>"
        interruption = ""
        if failed_step := case.get("paso_fallido"):
            evidence = "<p>El PDF adjunto incluye la captura del fallo.</p>" if case.get("evidencia_error") else ""
            interruption = f'<aside><strong>Paso interrumpido</strong><p>{escape(failed_step)}</p>{evidence}</aside>'
        metrics = ""
        if values := case.get("metricas"):
            metrics = '<h4>Métricas y umbrales</h4><dl class="grid">' + "".join(
                info(key, value) for key, value in values.items()
            ) + "</dl>"
        mark = badge(case["estado"])
        timing = escape(f"{case['duracion_segundos']} s")
        rows.append(f'<tr><th scope="row"><a href="#caso-{index}">{case_id}</a></th>'
                    f"<td>{name}</td><td>{mark}</td><td>{timing}</td><td>{escape(observed)}</td></tr>")
        case_data = info("Resultado esperado", case["esperado"]) + info("Observación", observed)
        if case.get("datos"):
            case_data += info("Datos de prueba", case["datos"])
        details.append(f"""
<article id="caso-{index}">
<h3>{case_id} · {name}</h3><p>{mark} · {timing}</p>
<dl class="grid">{case_data}</dl>{interruption}
<h4>Pasos ejecutados</h4>{step_list}{metrics}
</article>""")

    headers = ("ID", "Caso", "Estado", "Duración", "Observación")
    header_html = "".join(f'<th scope="col">{label}</th>' for label in headers)
    (directory / "resumen.html").write_text(f"""<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Ludisist QA · Resultados de {suite}</title>
<style>
body{{font:1rem/1.55 system-ui,sans-serif;color:#182e40;background:#f2f5f8;margin:0;padding:clamp(1rem,4vw,3rem);overflow-wrap:anywhere}}
main{{max-width:68rem;margin:auto}}
h1,h2,h3,h4{{line-height:1.25}} h1{{font-size:clamp(1.75rem,4vw,2.5rem);margin:.25rem 0}}
section{{margin-top:2rem}} article{{background:white;border:1px solid #a7b7c4;border-radius:.75rem;padding:1.25rem;margin:1rem 0}}
article h3{{margin-top:0}} .grid{{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,13rem),1fr));gap:.75rem}}
.grid div{{background:#e7eef4;border-radius:.5rem;padding:.7rem .85rem;min-width:0}}
.counts{{grid-template-columns:repeat(auto-fit,minmax(min(100%,6rem),1fr))}}
dt,small{{color:#4b6173}} dd{{margin:0;font-weight:600}} .counts dd{{font-size:1.35rem}}
.table{{overflow-x:auto}} table{{border-collapse:collapse;background:white;width:100%}}
th,td{{text-align:left;vertical-align:top;padding:.7rem;border:1px solid #a7b7c4}} thead th{{background:#e7eef4}}
.badge{{display:inline-block;font-weight:750;padding:.1rem .5rem;border-radius:.4rem;background:#e7eef4;white-space:nowrap}}
.badge[data-state="PASS"]{{color:#126242}} .badge[data-state="FAIL"],.badge[data-state="NOT RUN"]{{color:#a12636}}
aside{{border-left:3px solid #a12636;padding:.6rem .85rem;background:#f2f5f8}}
aside p,li p{{margin:.25rem 0}} li + li{{margin-top:.6rem}}
a{{color:#175c86}} :focus-visible{{outline:3px solid #216b9a;outline-offset:2px}}
</style></head><body><main>
<header><span>Ludisist QA</span><h1>Resultados de {suite}</h1><p>Resultado global {badge(status)}</p></header>
<section><h2>Resumen</h2><dl class="grid counts">{summary}</dl><p>{approval} % de los casos seleccionados obtuvo PASS.</p></section>
<section><h2>Datos de la ejecución</h2><dl class="grid">{metadata}</dl></section>
<section><h2>Casos de prueba</h2>
<div class="table"><table><thead><tr>{header_html}</tr></thead><tbody>{"".join(rows)}</tbody></table></div>
</section><section><h2>Detalle por caso</h2>{"".join(details)}</section>
</main></body></html>""", encoding="utf-8")


def report_message(directory, run, sender):
    message = EmailMessage()
    suite = run.get("suite", "Smoke")
    cases = run.get("casos") or [run["caso"]]
    result = run.get("resultado") or cases[0]["estado"]
    local_start = datetime.fromisoformat(run["inicio"]).astimezone(timezone(timedelta(hours=-4)))
    timestamp = local_start.strftime("%d/%m/%Y %H:%M")
    counts = " · ".join(f"{sum(case['estado'] == state for case in cases)} {state}"
                        for state in ("PASS", "FAIL", "SKIPPED", "NOT RUN"))
    tone = {"PASS": "#126242", "FAIL": "#a12636", "NOT RUN": "#a12636"}.get(result, "#182e40")
    category = run.get("tipo", "Funcional")
    mode = " · Fallo controlado" if run.get("fallo_controlado") else ""
    message["Subject"] = f"Reporte Ludisist QA · {suite} · {local_start:%Y-%m-%d}"
    message["From"] = sender
    message["To"] = run["correo"]
    message.set_content(
        f"Ludisist QA\nResultados de {suite}\n{category}{mode}\n"
        f"{timestamp} (hora de Bolivia)\nResultado global {result}\n"
        f"{len(cases)} caso(s) · {counts}\n\n"
        "informe.pdf — Informe detallado y evidencias.\n"
        "resumen.html — Resultados, pasos y observaciones por caso.\n"
    )
    message.add_alternative(f"""<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Ludisist QA</title></head>
<body style="margin:0;padding:0;background-color:#f2f5f8;color:#182e40;font-family:Outfit,Arial,sans-serif">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#f2f5f8">
<tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:580px;background-color:#ffffff;border:1px solid #a7b7c4;border-radius:12px">
<tr><td style="padding:24px;background-color:#216b9a;color:#ffffff;border-radius:11px 11px 0 0">
<p style="font-size:15px;margin:0 0 8px;color:#ffffff"><strong>Ludisist QA</strong></p>
<h1 style="font-size:26px;line-height:1.25;margin:0;color:#ffffff">Resultados de {escape(suite)}</h1>
</td></tr>
<tr><td style="padding:24px;line-height:1.55">
<p style="margin:0 0 16px;font-size:14px;color:#4b6173">{escape(category + mode)} · {timestamp} (hora de Bolivia)</p>
<p style="margin:0 0 8px;font-size:16px">Resultado global
<strong style="display:inline-block;padding:2px 10px;border-radius:8px;background-color:#e7eef4;color:{tone}">{escape(result)}</strong></p>
<p style="margin:0 0 24px;font-size:14px;color:#4b6173">{len(cases)} caso(s) · {counts}</p>
<h2 style="margin:0 0 8px;font-size:18px">Archivos adjuntos</h2>
<p style="margin:0;padding:12px 0;border-top:1px solid #a7b7c4"><strong>informe.pdf</strong><br>Informe detallado y evidencias.</p>
<p style="margin:0;padding:12px 0 0;border-top:1px solid #a7b7c4"><strong>resumen.html</strong><br>Resultados, pasos y observaciones por caso.</p>
</td></tr></table>
</td></tr></table></body></html>""", subtype="html")
    for filename, subtype, maintype in (("informe.pdf", "pdf", "application"), ("resumen.html", "html", "text")):
        message.add_attachment((directory / filename).read_bytes(), maintype, subtype, filename=filename)
    return message


def send_reports(directory, run):
    host = os.environ.get("LUDISIST_QA_SMTP_HOST")
    if not host:
        raise ValueError("Configura el servidor SMTP antes de enviar.")
    username = os.environ.get("LUDISIST_QA_SMTP_USER")
    password = os.environ.get("LUDISIST_QA_SMTP_PASSWORD")
    if username and not password:
        raise ValueError("Falta la contraseña de aplicación de la cuenta remitente.")

    message = report_message(directory, run, os.environ.get("LUDISIST_QA_SMTP_FROM", "qa@ludisist.local"))

    mode = os.environ.get("LUDISIST_QA_SMTP_SECURITY", "starttls")
    if mode not in {"starttls", "ssl", "none"} or (mode == "none" and host not in {"127.0.0.1", "localhost", "::1"}):
        raise ValueError("Configuración de seguridad SMTP inválida.")
    port = int(os.environ.get("LUDISIST_QA_SMTP_PORT", "465" if mode == "ssl" else "587"))
    context = ssl.create_default_context()
    client = smtplib.SMTP_SSL(host, port, timeout=15, context=context) if mode == "ssl" else smtplib.SMTP(host, port, timeout=15)
    with client:
        if mode == "starttls":
            client.starttls(context=context)
        if username:
            client.login(username, password)
        client.send_message(message)
