import React, { useEffect, useRef, useState } from "react";
import { LuDownload as Download } from "react-icons/lu";
import { getToken, logout } from "../services/auth";
import { API_URL } from "./admin/adminApi";
import AdminPagination from "./admin/AdminPagination";
import useAdminList from "./admin/useAdminList";
import "./AuditLog.css";

const actions = {
    CREATE: "Creación", UPDATE: "Actualización", DELETE: "Eliminación",
    LOGIN: "Inicio de sesión", LOGIN_FAILED: "Inicio de sesión fallido",
    CREATE_USER: "Creación de cuenta", UPDATE_USER: "Edición de cuenta", DELETE_USER: "Baja definitiva",
    REFRESH_SESSION: "Renovación de sesión", DEACTIVATE_ACCOUNT: "Desactivación de cuenta",
    REACTIVATE_ACCOUNT: "Reactivación de cuenta", REQUEST_REACTIVATION: "Solicitud de reactivación",
    UPLOAD: "Subida de archivo", DOWNLOAD: "Descarga de archivo",
    REPLACE_MANUAL_FILE: "Reemplazo de archivo",
    REVIEW_MANUAL: "Revisión de reglamento", RESTORE_CONTENT: "Restauración de contenido",
    REQUEST_BADGE: "Solicitud de insignia", APPROVE_BADGE: "Aprobación de insignia",
    REJECT_BADGE: "Rechazo de insignia", REVOKE_BADGE: "Revocación de insignia",
    BGG_IMPORT: "Importación desde BGG", BGG_SYNC: "Sincronización con BGG",
    BGG_SYNC_SELECTED: "Sincronización de varios juegos con BGG",
    REQUEST_JOIN: "Solicitud para unirse", APPROVE_JOIN: "Aprobación de participación",
    REJECT_JOIN: "Rechazo de participación",
};
const entities = {
    Game: "Juego", Rule: "Regla", User: "Usuario", Session: "Sesión",
    Badge: "Insignia", GameManual: "Reglamento", MatchTable: "Mesa", Tournament: "Torneo",
};

function eventLabel(labels, code) {
    return labels[code] || code || "—";
}

function AuditFilters({ filters, onChange }) {
    return <div className="admin-toolbar admin-user-filters">
        <label>Entidad<select value={filters.entity_type} onChange={(event) => onChange("entity_type", event.target.value)}>
            <option value="">Todas las entidades</option>
            {Object.entries(entities).map(([code, label]) => <option key={code} value={code}>{label}</option>)}
        </select></label>
        <label>Acción<select value={filters.action} onChange={(event) => onChange("action", event.target.value)}>
            <option value="">Todas las acciones</option>
            {Object.entries(actions).map(([code, label]) => <option key={code} value={code}>{label}</option>)}
        </select></label>
        <label>Periodo<select value={filters.days} onChange={(event) => onChange("days", event.target.value)}>
            <option value="1">Últimas 24 horas</option>
            <option value="7">Últimos 7 días</option>
            <option value="30">Últimos 30 días</option>
            <option value="90">Últimos 90 días</option>
        </select></label>
    </div>;
}

export default function AuditLog() {
    const [selectedLog, setSelectedLog] = useState(null);
    const detailDialog = useRef(null);

    useEffect(() => {
        if (selectedLog && !detailDialog.current.open) detailDialog.current.showModal();
    }, [selectedLog]);

    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState("20");
    const [filters, setFilters] = useState({ entity_type: "", action: "", days: "7" });
    const [exporting, setExporting] = useState(false);
    const [exportError, setExportError] = useState("");
    const [exportStatus, setExportStatus] = useState("");
    const exportPending = useRef(false);
    const filterParams = new URLSearchParams(Object.entries(filters).filter(([, value]) => value));
    const params = new URLSearchParams(filterParams);
    params.set("page", page);
    params.set("page_size", pageSize === "all" ? "20" : pageSize);
    params.set("all_items", pageSize === "all");
    const { data, loading, error, retry } = useAdminList(`/audit-logs?${params}`);
    const summary = useAdminList("/audit-logs/summary?days=1");

    const handleExport = async () => {
        if (exportPending.current) return;
        exportPending.current = true;
        setExporting(true);
        setExportError("");
        setExportStatus("");
        try {
            const response = await fetch(`${API_URL}/audit-logs/export-pdf?${filterParams}`, {
                headers: { Authorization: `Bearer ${getToken()}` },
            });
            if (response.status === 401) {
                logout();
                window.dispatchEvent(new CustomEvent("ludisist:admin-session-invalid"));
                throw new Error("Tu sesión terminó. Inicia sesión nuevamente.");
            }
            if (!response.ok) throw new Error("No se pudo generar el PDF. Vuelve a intentar la exportación.");
            const url = URL.createObjectURL(await response.blob());
            const link = document.createElement("a");
            link.href = url;
            link.download = `reporte_ludisist_${new Date().toISOString().slice(0, 10)}.pdf`;
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.setTimeout(() => URL.revokeObjectURL(url), 1000);
            setExportStatus("Descarga del PDF iniciada.");
        } catch (failure) {
            setExportError(failure.message);
        } finally {
            exportPending.current = false;
            setExporting(false);
        }
    };

    return <div className="admin-module audit-log-container">
        <div className="module-heading">
            <div><h1>Auditoría</h1><p>Historial de cambios y accesos del sistema</p></div>
            <button type="button" className="admin-primary" onClick={handleExport} disabled={exporting}>
                <Download /> {exporting ? "Generando PDF…" : "Exportar PDF con filtros"}
            </button>
        </div>
        <div role="status">{exporting ? "Preparando el reporte de auditoría…" : exportStatus}</div>
        {exportError && <p className="error-message" role="alert">{exportError}</p>}
        <AuditFilters filters={filters} onChange={(field, value) => {
            setFilters((current) => ({ ...current, [field]: value }));
            setPage(1);
        }} />
        {loading && <p role="status">Cargando historial…</p>}
        {error && <div className="admin-empty">
            <p role="alert">No se pudo actualizar el historial. {error}</p>
            <button type="button" className="admin-secondary" onClick={retry}>Reintentar carga</button>
        </div>}
        {data?.items.length > 0 && <section className="admin-panel table-panel">
            <table className="admin-table audit-records">
                <thead><tr><th>Fecha</th><th>Usuario</th><th>Acción</th><th>Registro afectado</th><th>Detalle</th></tr></thead>
                <tbody>{data.items.map((log) => <tr key={log.id}>
                    <td>{new Date(log.timestamp).toLocaleString("es-BO", { dateStyle: "short", timeStyle: "short" })}</td>
                    <td>{log.username}</td>
                    <td>{eventLabel(actions, log.action)}</td>
                    <td>{eventLabel(entities, log.entity_type)}{log.entity_name && <div>{log.entity_name}</div>}</td>
                    <td><button type="button" className="admin-secondary" aria-haspopup="dialog" onClick={() => setSelectedLog(log)}>Ver detalles</button></td>
                </tr>)}</tbody>
            </table>
        </section>}
        {data && !loading && !error && !data.items.length && <p className="admin-empty">No hay registros para estos filtros.</p>}
        {data && <AdminPagination page={data.page} pages={data.pages} total={data.total} onChange={setPage} pageSize={pageSize} onPageSizeChange={(value) => { setPageSize(value); setPage(1); }} />}
        <dialog className="admin-record-dialog" ref={detailDialog} onClick={(event) => {
          const dialog = event.currentTarget;
          const bounds = dialog.getBoundingClientRect();
          if (event.target === dialog && (event.clientX < bounds.left || event.clientX >= bounds.right ||
              event.clientY < bounds.top || event.clientY >= bounds.bottom)) dialog.close();
        }} aria-labelledby="audit-detail-title" onClose={() => setSelectedLog(null)}>
            {selectedLog && <>
                <h2 id="audit-detail-title">Detalle del registro</h2>
                <p>{eventLabel(actions, selectedLog.action)} · {selectedLog.username}</p>
                <dl>
                    <dt>Acción registrada</dt><dd>{selectedLog.action || "—"}</dd>
                    <dt>Tipo de entidad</dt><dd>{selectedLog.entity_type || "—"}</dd>
                    <dt>ID de entidad</dt><dd>{selectedLog.entity_id || "—"}</dd>
                    <dt>Dirección IP</dt><dd>{selectedLog.ip_address || "—"}</dd>
                </dl>
                {selectedLog.details && Object.keys(selectedLog.details).length > 0 && <pre>{JSON.stringify(selectedLog.details, null, 2)}</pre>}
                <form method="dialog"><button className="admin-secondary">Cerrar detalles</button></form>
            </>}
        </dialog>
        <details className="audit-summary">
            <summary>Actividad de las últimas 24 horas</summary>
            {summary.loading && <p role="status">Cargando actividad…</p>}
            {summary.error && <div><p role="alert">No se pudo cargar el resumen. {summary.error}</p><button type="button" className="admin-secondary" onClick={summary.retry}>Reintentar resumen</button></div>}
            {summary.data && (Object.keys(summary.data.actions).length ? <ul>
                {Object.entries(summary.data.actions).map(([code, count]) => <li key={code}>{eventLabel(actions, code)} ({count})</li>)}
            </ul> : <p>No hay actividad registrada en este periodo.</p>)}
        </details>
    </div>;
}
