import React, { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { LuEye as Eye, LuGlobe as Globe, LuPlay as Play, LuTrophy as Trophy } from "react-icons/lu";
import useAdminList from "./useAdminList";
import AdminPagination from "./AdminPagination";

export default function AdminSessions() {
  const [selectedSession, setSelectedSession] = useState(null);
  const detailDialog = useRef(null);
  useEffect(() => {
    if (selectedSession && !detailDialog.current.open) detailDialog.current.showModal();
  }, [selectedSession]);

  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("all");
  const [scope, setScope] = useState("all");
  const params = new URLSearchParams({ page: String(page), status, scope });
  const { data, loading, error, retry } = useAdminList(`/admin/sessions?${params}`);

  return (
    <div className="admin-module">
      <div className="module-heading"><div><h1>Partidas</h1><p>Resumen de todas las partidas registradas en el sistema</p></div></div>
      <div className="admin-toolbar admin-user-filters">
        <label>Alcance<select value={scope} onChange={(event) => { setScope(event.target.value); setPage(1); }}>
          <option value="all">Todas las partidas</option><option value="mine">Partidas que creé</option>
        </select></label>
        <label>Estado<select value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}>
          <option value="all">Todos los estados</option><option value="active">Activas</option>
          <option value="completed">Finalizadas</option><option value="live">En vivo</option>
        </select></label>
      </div>
      {loading && <p role="status">Cargando partidas…</p>}
      {error && <div className="admin-empty">
        <p role="alert">No se pudo actualizar el listado. {error}</p>
        <button type="button" className="admin-secondary" onClick={retry}>Reintentar carga</button>
      </div>}
      {data && <section className="admin-stats-row">
        <div className="admin-stat-card"><Play size={20} /><div><strong>{data.active}</strong><span>Activas</span></div></div>
        <div className="admin-stat-card"><Trophy size={20} /><div><strong>{data.completed}</strong><span>Finalizadas</span></div></div>
        <div className="admin-stat-card"><Globe size={20} /><div><strong>{data.public}</strong><span>En vivo</span></div></div>
        <div className="admin-stat-card"><Eye size={20} /><div><strong>{data.total}</strong><span>Coincidencias</span></div></div>
      </section>}
      {data && <div className="admin-panel table-panel"><table className="admin-table">
        <thead><tr><th>Juego</th><th>Creador</th><th>Visibilidad</th><th>Estado</th><th>Jugadores</th><th>Ronda</th><th>Actualizada</th><th>Detalle</th></tr></thead>
        <tbody>
          {!loading && !error && data.items.length === 0 && <tr><td colSpan={8}><div className="admin-empty">No hay partidas que coincidan con los filtros.</div></td></tr>}
          {data.items.map((session) => (
            <tr key={session.id}>
              <td><strong>{session.game_name}</strong></td>
              <td>{session.owner_name || "—"}</td>
              <td><span className={`admin-tag ${session.visibility === "public" ? "public" : ""}`}>{session.visibility === "public" ? "Pública" : "Privada"}</span></td>
              <td><span className={`admin-tag ${session.is_completed ? "completed" : "active"}`}>{session.is_completed ? "Finalizada" : session.status === "active" ? "Activa" : "Inactiva"}</span></td>
              <td>{session.player_count}</td>
              <td>{session.round_number}</td>
              <td>{session.updated_at ? new Date(session.updated_at).toLocaleString() : "—"}</td>
              <td><button type="button" className="admin-secondary" aria-haspopup="dialog" onClick={() => setSelectedSession(session)}>Ver detalle</button></td>
            </tr>
          ))}
        </tbody>
      </table></div>}
      <dialog className="admin-record-dialog" ref={detailDialog} onClick={(event) => {
          const dialog = event.currentTarget;
          const bounds = dialog.getBoundingClientRect();
          if (event.target === dialog && (event.clientX < bounds.left || event.clientX >= bounds.right ||
              event.clientY < bounds.top || event.clientY >= bounds.bottom)) dialog.close();
        }} aria-labelledby="session-detail-title" onClose={() => setSelectedSession(null)}>
        {selectedSession && <>
          <h2 id="session-detail-title">Detalle de la partida</h2>
          <p><strong>{selectedSession.game_name}</strong> · {selectedSession.owner_name || "Usuario desconocido"}</p>
          <dl>
            <dt>Modo</dt><dd>{selectedSession.scoring_mode === "teams" ? "Por equipos" : "Individual"}</dd>
            <dt>Tiempo registrado</dt><dd>{Math.floor((selectedSession.elapsed_seconds || 0) / 60)} min {(selectedSession.elapsed_seconds || 0) % 60} s</dd>
          </dl>
          <div className="admin-record-actions">
            <Link to={`/juegos/${selectedSession.game_id}`} onClick={() => detailDialog.current.close()}>Ver ficha del juego</Link>
            <form method="dialog"><button className="admin-secondary">Cerrar detalles</button></form>
          </div>
        </>}
      </dialog>
      {data && <AdminPagination page={data.page} pages={data.pages} total={data.total} onChange={setPage} />}
    </div>
  );
}
