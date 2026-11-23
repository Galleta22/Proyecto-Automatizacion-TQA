import React, { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  LuCalendarDays as CalendarDays, LuClock as Clock, LuGraduationCap as GraduationCap,
  LuMapPin as MapPin, LuUsers as Users,
} from "react-icons/lu";
import useAdminList from "./useAdminList";
import AdminPagination from "./AdminPagination";

const STATUS_TABS = [
  { id: "active", label: "Activas" },
  { id: "finished", label: "Finalizadas" },
  { id: "cancelled", label: "Canceladas" },
  { id: "all", label: "Todas" },
];

export default function AdminTables() {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState("20");
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedStatus = searchParams.get("estado");
  const statusFilter = STATUS_TABS.some((tab) => tab.id === requestedStatus) ? requestedStatus : "active";
  const [host, setHost] = useState("");
  const [date, setDate] = useState("");
  const params = new URLSearchParams({
    page: String(page), page_size: pageSize === "all" ? "20" : pageSize,
    all_items: String(pageSize === "all"), status: statusFilter, host,
  });
  const localDate = new Date(`${date}T00:00:00`);
  if (!Number.isNaN(localDate.getTime())) params.set("scheduled_from", localDate.toISOString());
  const { data, loading, error, retry } = useAdminList(`/admin/tables?${params}`);
  const tables = data?.items || [];
  const stats = data?.stats || {};
  const report = data?.report;

  const statusLabel = (status) => {
    if (status === "open") return "Abierta";
    if (status === "full") return "Completa";
    if (status === "finished") return "Finalizada";
    if (status === "cancelled") return "Cancelada";
    return status;
  };

  return <div className="admin-module admin-tables-module">
    <div className="module-heading">
      <div><h1>Mesas</h1><p>Supervisión de convocatorias y participantes</p></div>
    </div>

    <div className="admin-toolbar admin-user-filters">
      <label>Estado<select value={statusFilter} onChange={(event) => { const value = event.target.value;
        setSearchParams((current) => {
          const next = new URLSearchParams(current);
          next.set("estado", value);
          return next;
        });
        setPage(1); }}>
        {STATUS_TABS.map((tab) => <option key={tab.id} value={tab.id}>{tab.label}{stats[tab.id] !== undefined ? ` (${stats[tab.id]})` : ""}</option>)}
      </select></label>
      <label>Anfitrión<input value={host} maxLength={100} onChange={(event) => { setHost(event.target.value); setPage(1); }} /></label>
      <label>Programadas desde<input type="date" value={date} onChange={(event) => { setDate(event.target.value); setPage(1); }} /></label>
    </div>
    {loading && <p role="status">Cargando mesas…</p>}
    {error && <div className="admin-empty">
      <p role="alert">No se pudo actualizar el listado. {error}</p>
      <button type="button" className="admin-secondary" onClick={retry}>Reintentar carga</button>
    </div>}

    <section className="admin-table-card-grid">
      {tables.map((table) => <article className="admin-match-table" key={table.id}>
        <header>
          <div className="admin-match-game-image">{table.game_image_url ? <img src={table.game_image_url} alt="" /> : <Users />}</div>
          <div><small>{table.game_name}</small><h2>{table.title}</h2><span>Organiza {table.host_name}</span></div>
          <span className={`admin-badge ${table.status === "full" ? "badge-warn" : table.status === "finished" ? "badge-ok" : table.status === "cancelled" ? "badge-danger" : "badge-info"}`}>{statusLabel(table.status)}</span>
        </header>
        <div className="admin-match-details">
          {table.scheduled_at && <span><CalendarDays /> {formatDate(table.scheduled_at)}</span>}
          <span><MapPin /> {table.location}</span>
          <span><Users /> {table.occupied_spots}/{table.capacity} jugadores</span>
          <span><GraduationCap /> {tutorModeLabel(table.tutor_mode)}</span>
        </div>
        {table.notes && <p>{table.notes}</p>}
        {table.participants?.length > 0 && <section>
          <strong>Participantes confirmados</strong>
          <div className="admin-table-participants">
            {table.participants.map((participant) => <Link key={participant.user_id} to={`/jugadores/${participant.user_id}`}>
              {participant.user_name}<small>{roleLabel(participant.role)}</small>
            </Link>)}
          </div>
          {table.tutor_explainers?.map((tutor) => <Link className="admin-table-explainer" key={tutor.user_id} to={`/jugadores/${tutor.user_id}`}><GraduationCap /> {tutor.user_name} explicará el juego</Link>)}
        </section>}
        {table.status === "open" && <footer>{table.pending_requests} solicitudes pendientes</footer>}
      </article>)}
      {!loading && !error && !tables.length && <div className="admin-empty">No hay mesas que coincidan con los filtros.</div>}
    </section>

    {data && <AdminPagination page={data.page} pages={data.pages} total={data.total} onChange={setPage} pageSize={pageSize} onPageSizeChange={(value) => { setPageSize(value); setPage(1); }} />}
    {report && (report.favorite_genres.length > 0 || report.avg_duration_minutes > 0) && <details><summary>Resumen de las mesas de esta página</summary><section className="admin-tables-report">
      <div className="report-metric">
        <Clock size={18} />
        <div><strong>{report.avg_duration_minutes > 0 ? `${report.avg_duration_minutes} min` : "—"}</strong><span>Tiempo promedio entre creación y última actualización</span></div>
      </div>
      <div className="report-metric report-genres">
        <div><strong>Géneros de los juegos</strong></div>
        <div className="report-genre-tags">
          {report.favorite_genres.slice(0, 5).map((g) => <span key={g.name}>{g.name}<small>{g.count}</small></span>)}
        </div>
      </div>
    </section></details>}

  </div>;
}

function tutorModeLabel(mode) {
  if (mode === "play") return "Tutor juega y enseña";
  if (mode === "explain") return "Tutor solo explica";
  return "Partida normal";
}

function roleLabel(role) {
  if (role === "host") return "Anfitrión";
  if (role === "tutor_play") return "Tutor jugador";
  return "Jugador";
}

function formatDate(value) {
  return new Intl.DateTimeFormat("es-BO", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}
