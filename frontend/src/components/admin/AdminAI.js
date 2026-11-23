import React, { useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { LuPlay as Play, LuRefreshCw as Refresh } from "react-icons/lu";
import { parseJwt, getToken } from "../../services/auth";
import { adminRequest } from "./adminApi";
import useAdminList from "./useAdminList";

export default function AdminAI() {
  const [params] = useSearchParams();
  const canViewActivity = parseJwt(getToken())?.role === "admin";
  return canViewActivity && params.get("vista") === "actividad" ? <AIActivity /> : <AIDiagnostics canViewActivity={canViewActivity} />;
}

function AIActivity() {
  const { data, loading, error, retry } = useAdminList("/admin/ai-activity");
  return <div className="admin-module">
    <div className="module-heading">
      <div><h1>Actividad de IA</h1><p>Consultas registradas y tiempo de respuesta por modelo</p></div>
      <Link to="/admin?modulo=ai">Abrir diagnóstico de IA</Link>
    </div>
    {loading && <p role="status">Cargando actividad…</p>}
    {error && <div className="admin-empty"><p role="alert">{error}</p><button className="admin-secondary" onClick={retry}>Reintentar carga</button></div>}
    {data && <p>{data.total} consultas registradas</p>}
    {data?.items.length > 0 && <section className="admin-panel table-panel"><table className="admin-table">
      <thead><tr><th>Modelo</th><th>Consultas</th><th>Tiempo medio</th></tr></thead>
      <tbody>{data.items.map((row) => <tr key={row.model ?? ""}>
        <td>{row.model || "Sin identificar"}</td><td>{row.count}</td><td>{row.average_ms == null ? "—" : formatDuration(row.average_ms)}</td>
      </tr>)}</tbody>
    </table></section>}
    {data && !loading && !error && data.total === 0 && <p>No hay consultas registradas.</p>}
  </div>;
}

function AIDiagnostics({ canViewActivity }) {
  const { data: provider, loading, error, retry } = useAdminList("/ai/provider");
  const [prompt, setPrompt] = useState("Explica brevemente cómo elegir un juego para cuatro personas.");
  const [result, setResult] = useState(null);
  const [testing, setTesting] = useState(false);
  const [testError, setTestError] = useState("");
  const pending = useRef(false);
  const options = provider?.generation_options;

  const test = async (event) => {
    event.preventDefault();
    if (pending.current || !provider?.healthy || !prompt.trim()) return;
    pending.current = true;
    setTesting(true);
    setResult(null);
    setTestError("");
    const started = performance.now();
    try {
      const data = await adminRequest("/ai/query", { method: "POST", body: JSON.stringify({ query: prompt.trim() }) });
      setResult({ ...data, elapsed: performance.now() - started });
    } catch (failure) {
      setTestError(failure.message);
    } finally {
      pending.current = false;
      setTesting(false);
      retry();
    }
  };

  return <div className="admin-module">
    <div className="module-heading">
      <div><h1>Diagnóstico de IA</h1><p>Disponibilidad, modelo y prueba del asistente</p></div>
      <button type="button" className="admin-secondary" onClick={retry} disabled={loading}><Refresh /> Comprobar disponibilidad</button>
    </div>
    {canViewActivity && <>
      <p><Link to="/admin?modulo=system">Ver estado de Sistema</Link></p>
      <p><Link to="/admin?modulo=ai&vista=actividad">Ver actividad de IA</Link></p>
    </>}
    {loading && <p role="status">Comprobando disponibilidad…</p>}
    {error && <p role="alert" className="error-message">No se pudo comprobar el proveedor. {error}</p>}
    {provider && <section className="admin-panel admin-diagnostic-details">
      <h2>{provider.provider}</h2>
      {!loading && !error && <p>{provider.healthy ? "Disponible" : "No disponible"}</p>}
      {options && <details>
        <summary>Parámetros de generación</summary>
        <dl className="config-list">
          <div><dt>Contexto</dt><dd>{options.num_ctx} tokens</dd></div>
          <div><dt>Respuesta máxima</dt><dd>{options.num_predict} tokens</dd></div>
          <div><dt>Temperatura</dt><dd>{options.temperature}</dd></div>
        </dl>
      </details>}
    </section>}
    <form className="admin-panel ai-tester admin-diagnostic-details" onSubmit={test}>
      <h2>Prueba rápida</h2>
      <label htmlFor="admin-ai-prompt">Pregunta de prueba</label>
      <textarea id="admin-ai-prompt" value={prompt} disabled={testing} onChange={(event) => setPrompt(event.target.value)} />
      <button className="admin-primary" disabled={testing || loading || Boolean(error) || !provider?.healthy || !prompt.trim()}>
        <Play /> {testing ? "Generando respuesta…" : "Ejecutar prueba"}
      </button>
      {testing && <p role="status">Esperando una respuesta del modelo…</p>}
      {testError && <p role="alert" className="error-message">La prueba falló. {testError}</p>}
      {result && <div className="ai-result">
        <p>{formatDuration(result.response_time_ms ?? result.elapsed)} · {result.model}</p>
        <p>{result.response}</p>
      </div>}
    </form>
  </div>;
}

function formatDuration(milliseconds) {
  const seconds = Math.round(milliseconds / 1000);
  if (seconds === 0) return "Menos de 1 s";
  if (seconds < 60) return `${seconds} s`;
  return `${Math.floor(seconds / 60)} min ${seconds % 60} s`;
}
