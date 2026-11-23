import React from "react";
import { Link } from "react-router-dom";
import {
  LuBot as Bot, LuFileCode2 as Code2, LuDatabase as Database,
  LuHardDrive as HardDrive, LuImages as Images, LuRefreshCw as RefreshCw, LuServer as Server,
} from "react-icons/lu";
import useAdminList from "./useAdminList";

export default function AdminSystem() {
  const { data, error, loading, retry } = useAdminList("/admin/system");
  return <div className="admin-module">
    <div className="module-heading">
      <div><h1>Sistema</h1><p>Estado de servicios y espacio utilizado por Ludisist</p></div>
      <button type="button" className="admin-secondary" onClick={retry} disabled={loading}><RefreshCw /> Actualizar diagnóstico</button>
    </div>
    <p><Link to="/admin?modulo=ai">Abrir diagnóstico de IA</Link></p>
    {loading && <p role="status">Comprobando servicios…</p>}
    {error && <p role="alert" className="error-message">No se pudo actualizar el diagnóstico. {error}</p>}
    {data && <>
      {data.checked_at && <p>Última comprobación <time dateTime={data.checked_at}>{new Date(data.checked_at).toLocaleString("es-BO")}</time></p>}
      <div className="service-grid">
        <Service icon={Server} name="Backend" healthy={data.backend.healthy} detail="FastAPI operativo" />
        <Service icon={Database} name="PostgreSQL" healthy={data.database.healthy} detail={data.database.healthy ? `${data.database.latency_ms} ms` : data.database.error} />
        <Service icon={Bot} name="Ollama" healthy={data.ollama.healthy} detail={data.ollama.healthy ? data.ollama.active_model : data.ollama.error} />
      </div>
      <section className="admin-panel component-storage-panel">
        <div className="panel-heading"><h2>Espacio utilizado por Ludisist</h2><strong>{data.storage.total_bytes == null ? "Total no disponible" : `${formatBytes(data.storage.total_bytes)} en total`}</strong></div>
        <div className="component-storage-grid">
          <StorageItem icon={Code2} label="Frontend" bytes={data.storage.frontend_bytes} />
          <StorageItem icon={Server} label="Backend" bytes={data.storage.backend_bytes} />
          <StorageItem icon={Database} label="Base de datos" bytes={data.storage.database_bytes} />
          <StorageItem icon={Images} label="Archivos subidos" bytes={data.storage.uploads_bytes} detail={`${formatBytes(data.storage.uploaded_images_bytes)} en imágenes · ${formatBytes(data.storage.manuals_bytes)} en reglamentos`} />
        </div>
        {data.storage.error && <p className="error-message">{data.storage.error}</p>}
        <p className="storage-scope"><HardDrive /> No se cuentan dependencias, entornos virtuales, cachés ni archivos de registro.</p>
      </section>
      <details className="admin-panel admin-diagnostic-details">
        <summary>Información de instalación</summary>
        <p>BGG · {data.configuration.bgg_configured ? "Configurado" : "Sin configurar"}</p>
        <p>Duración de la sesión · {data.configuration.token_expiry_minutes} min</p>
        <h2>Modelos de Ollama</h2>
        {data.ollama.healthy && data.ollama.installed_models.length > 0
          ? <ul>{data.ollama.installed_models.map((model) => <li key={model}>{model}</li>)}</ul>
          : <p>{data.ollama.healthy ? "No hay modelos instalados." : "No se pudo consultar la lista de modelos."}</p>}
      </details>
    </>}
  </div>;
}
function Service({ icon: Icon, name, healthy, detail }) { return <section className="service-card"><Icon /><div><h2>{name}</h2><p>{detail}</p></div><span className={healthy ? "service-online" : "service-offline"}>{healthy ? "En línea" : "Sin conexión"}</span></section>; }
function StorageItem({ icon: Icon, label, bytes, detail }) {
  return <article className="component-storage-item">
    <div className="component-storage-heading"><Icon /><span>{label}<strong>{formatBytes(bytes)}</strong></span></div>
    {detail && <small className="component-storage-detail">{detail}</small>}
  </article>;
}
function formatBytes(bytes) {
  if (bytes == null) return "No disponible";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}
