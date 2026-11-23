import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "../../../frontend/src/styles/design-system.css";
import "./panel.css";

const date = new Intl.DateTimeFormat("es-BO", {
  dateStyle: "medium", timeStyle: "short", timeZone: "America/La_Paz",
});

async function request(path, body) {
  const response = await fetch(path, body === undefined ? { cache: "no-store" } : {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Ludisist-QA": "panel" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const result = await response.json().catch(() => ({}));
    throw new Error(typeof result.detail === "string" ? result.detail : "Revisa el correo y la selección de casos.");
  }
  return response.json();
}

function isActive(run) {
  return ["Pendiente", "En curso"].includes(run.estado) || run.correo_estado === "Enviando";
}

function Run({ run, onRetry, retrying }) {
  const cases = run.casos || (run.caso ? [run.caso] : []);
  const result = run.resultado || run.caso?.estado;
  return <li className="run" id={`corrida-${run.id}`}>
    <div className="run-header">
      <div><strong>{run.suite || "Smoke"}</strong><div className="muted">{date.format(new Date(run.inicio))}</div></div>
      <span className="badge" data-result={result}>{result || run.estado}</span>
    </div>
    <p>{run.estado}{run.fallo_controlado ? " · Fallo controlado" : ""}</p>
    {run.error && <p className="error-message">{run.error}</p>}
    {cases.length > 0 && <details>
      <summary>Resultados por caso ({cases.length})</summary>
      <ul className="case-results">{cases.map((item) => <li key={item.id}>
        <strong>{item.id}</strong> · {item.nombre} · <span data-result={item.estado}>{item.estado}</span>
        {item.observacion && <p>{item.observacion}</p>}
        {item.metricas && <dl>{Object.entries(item.metricas).map(([key, value]) =>
          <React.Fragment key={key}><dt>{key}</dt><dd>{value}</dd></React.Fragment>)}</dl>}
      </li>)}</ul>
    </details>}
    {run.reportes && <div className="run-links">
      <a href={`/api/corridas/${run.id}/reportes/informe.pdf`}>Descargar PDF</a>
      <a href={`/api/corridas/${run.id}/reportes/resumen.html`}>Descargar HTML</a>
    </div>}
    <p className="muted">Correo {run.correo_estado.toLowerCase()} · {run.correo}</p>
    {run.correo_error && <p className="error-message">{run.correo_error}</p>}
    {run.reportes && ["Fallido", "Sin confirmar"].includes(run.correo_estado) &&
      <button className="btn-secondary" disabled={retrying} onClick={() => onRetry(run.id)}>Reintentar envío</button>}
  </li>;
}

function App() {
  const [theme, setTheme] = useState(() => localStorage.getItem("ludisist:theme") === "light" ? "light" : "dark");
  const [catalog, setCatalog] = useState(null);
  const [runs, setRuns] = useState(null);
  const [email, setEmail] = useState("");
  const [kind, setKind] = useState("Funcional");
  const [suite, setSuite] = useState("Smoke");
  const [selection, setSelection] = useState("suite");
  const [checked, setChecked] = useState(null);
  const [controlled, setControlled] = useState(false);
  const [sending, setSending] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [actionError, setActionError] = useState("");
  const [refresh, setRefresh] = useState(0);
  const suites = (catalog || []).filter((entry) => entry.tipo === kind);
  const cases = suites.find((entry) => entry.suite === suite)?.casos || [];
  const selected = selection === "suite" || checked === null ? cases.map(({ id }) => id) : checked;

  function changeSuite(value) {
    setSuite(value);
    setChecked(null);
    setControlled(false);
  }

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("ludisist:theme", theme);
  }, [theme]);

  useEffect(() => {
    let alive = true;
    let timer;
    async function poll() {
      try {
        const [cases, history] = await Promise.all([request("/api/catalogo"), request("/api/corridas")]);
        if (!alive) return;
        setCatalog(cases);
        setRuns(history);
        setLoadError("");
      } catch {
        if (alive) setLoadError("No se pudo actualizar el historial de ejecuciones.");
      } finally {
        if (alive) timer = setTimeout(poll, 2000);
      }
    }
    poll();
    return () => { alive = false; clearTimeout(timer); };
  }, [refresh]);

  async function submit(event) {
    event.preventDefault();
    setSending(true);
    setActionError("");
    try {
      const run = await request("/api/corridas", {
        correo: email, suite, casos: selected, fallo_controlado: controlled,
      });
      setRuns((previous) => [run, ...(previous || []).filter(({ id }) => id !== run.id)]);
      setRefresh((version) => version + 1);
    } catch (error) {
      setActionError(error.message);
    } finally {
      setSending(false);
    }
  }

  async function retry(id) {
    setRetrying(true);
    setActionError("");
    try {
      const run = await request(`/api/corridas/${id}/correo`, {});
      setRuns((previous) => previous.map((item) => item.id === id ? run : item));
      setRefresh((version) => version + 1);
    } catch (error) {
      setActionError(error.message);
    } finally {
      setRetrying(false);
    }
  }

  const active = runs?.find(isActive);
  return <>
    <a className="skip-link" href="#contenido">Saltar al contenido</a>
    <header className="qa-header">
      <a className="brand" href="/"><span aria-hidden="true" className="brand-icon">✓</span>Ludisist QA</a>
      <button className="btn-secondary" onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>
        {theme === "dark" ? "Modo claro" : "Modo oscuro"}
      </button>
    </header>
    <main id="contenido" tabIndex="-1">
      <h1>Automatización de pruebas</h1>
      <p className="intro">Ejecuta pruebas sobre la instancia local de Ludisist y recibe los reportes por correo.</p>
      {loadError && <div className="ui-status error" role="alert">{loadError} <button className="btn-secondary" onClick={() => setRefresh((version) => version + 1)}>Reintentar</button></div>}
      {actionError && <p className="ui-status error" role="alert">{actionError}</p>}
      <div className="layout">
        <section className="card" aria-labelledby="new-run">
          <h2 id="new-run">Nueva ejecución</h2>
          {!catalog && !loadError && <p role="status">Cargando casos…</p>}
          {catalog?.length === 0 && <p className="muted">Todavía no hay casos disponibles.</p>}
          {!!catalog?.length && <form onSubmit={submit}>
            <div className="field-row">
              <div className="field"><label htmlFor="qa-kind">Tipo de prueba</label><select id="qa-kind" value={kind} onChange={(event) => {
                const value = event.target.value;
                setKind(value);
                changeSuite(catalog.find((entry) => entry.tipo === value).suite);
              }}>
                {[...new Set(catalog.map((entry) => entry.tipo))].map((value) => <option key={value}>{value}</option>)}
              </select></div>
              <div className="field"><label htmlFor="qa-suite">Suite</label><select id="qa-suite" value={suite} onChange={(event) => changeSuite(event.target.value)}>
                {suites.map((entry) => <option key={entry.suite}>{entry.suite}</option>)}
              </select></div>
            </div>
            <label>Selección<select value={selection} onChange={(event) => setSelection(event.target.value)}>
              <option value="suite">Suite completa</option><option value="case">Casos específicos</option>
            </select></label>
            <div className="case-list">{cases.map(({ id, nombre }) => <div className="case" key={id}>
              {selection === "case" ? <label className="check">
                <input type="checkbox" checked={selected.includes(id)} onChange={(event) =>
                  setChecked(event.target.checked ? [...selected, id] : selected.filter((value) => value !== id))} />
                {nombre}
              </label> : <strong>{nombre}</strong>}
              <small>{id}</small>
            </div>)}</div>
            <label>Correo destinatario<input type="email" required autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} /></label>
            {suite === "Smoke" && <label className="check"><input type="checkbox" checked={controlled} onChange={(event) => setControlled(event.target.checked)} />Demostrar un fallo controlado</label>}
            <button className="btn-primary" disabled={sending || !!active || !selected.length}>
              {sending ? "Iniciando…" : "Ejecutar prueba"}
            </button>
            <div role="status">{active ? `Ejecución ${active.estado.toLowerCase()} · correo ${active.correo_estado.toLowerCase()}` :
              runs?.[0] ? `Última ejecución ${runs[0].estado.toLowerCase()} · correo ${runs[0].correo_estado.toLowerCase()}` : ""}</div>
          </form>}
        </section>
        <section className="card" aria-labelledby="history">
          <h2 id="history">Historial</h2>
          {!runs && !loadError && <p role="status">Cargando historial…</p>}
          {runs?.length === 0 && <p className="muted">Todavía no hay ejecuciones.</p>}
          {!!runs?.length && <ul className="runs">{runs.map((run) => <Run key={run.id} run={run} onRetry={retry} retrying={retrying} />)}</ul>}
        </section>
      </div>
    </main>
  </>;
}

createRoot(document.getElementById("root")).render(<App />);
