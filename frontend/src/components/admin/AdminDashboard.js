import React from "react";
import { Link } from "react-router-dom";
import {
  LuActivity as Activity, LuBot as Bot, LuBookOpen as BookOpen,
  LuCalendarDays as CalendarDays,
  LuGamepad2 as Gamepad2, LuImageOff as ImageOff,
  LuShieldCheck as ShieldCheck, LuUsers as Users,
} from "react-icons/lu";
import useAdminList from "./useAdminList";

export default function AdminDashboard() {
  const { data, error, loading, retry } = useAdminList("/admin/overview");

  if (!data) return <div className="admin-module">
    <div className="module-heading"><h1>Resumen</h1></div>
    {loading && <p role="status">Cargando resumen…</p>}
    {error && <div className="admin-empty">
      <p className="error-message" role="alert">No se pudo cargar el resumen. {error}</p>
      <button type="button" className="admin-secondary" onClick={retry}>Reintentar carga</button>
    </div>}
  </div>;

  const metrics = [
    { label: "Usuarios", value: data.users.total, detail: `${data.users.active} activos`, icon: Users, target: "/admin?modulo=users" },
    { label: "Juegos", value: data.games.total, detail: `${data.games.without_rules} sin reglas rápidas`, icon: Gamepad2, target: "/admin?modulo=games" },
    { label: "Reglas publicadas", value: data.rules.total, detail: "Ver reglas del catálogo", icon: BookOpen, target: "/admin?modulo=rules&visibilidad=global" },
    { label: "Mesas activas", value: data.tables.active, detail: `${data.tables.participating_users} usuarios confirmados`, icon: CalendarDays, target: "/admin?modulo=tables&estado=active" },
    { label: "Consultas IA", value: data.ai.interactions, detail: "Ver actividad por modelo", icon: Bot, target: "/admin?modulo=ai&vista=actividad" },
  ];

  const maxUsers = Math.max(...(data.charts?.users_by_month?.map((u) => u.count) || [1]), 1);
  const maxSessions = Math.max(...(data.charts?.sessions_by_day?.map((s) => s.count) || [1]), 1);
  const maxGenre = Math.max(...(data.charts?.games_by_genre?.map((g) => g.count) || [1]), 1);

  return (
    <div className="admin-module dashboard-module">
      <div className="module-heading">
        <div><h1>Resumen</h1><p>Resumen operativo de Ludisist</p></div>
      </div>

      <div className="metric-grid">
        {metrics.map(({ icon: Icon, ...metric }) => (
          <Link className="metric-box" key={metric.label} to={metric.target}>
            <div><span>{metric.label}</span><strong>{metric.value}</strong><small>{metric.detail}</small></div>
            <Icon aria-hidden="true" />
          </Link>
        ))}
      </div>

      <div className="dashboard-priorities">
        <section className="admin-panel">
          <div className="panel-heading"><h2>Atención requerida</h2></div>
          <div className="attention-list">
            <Link to="/admin?modulo=users&estado=inactive"><ShieldCheck /><span><strong>{data.users.inactive}</strong> cuentas inactivas</span></Link>
            <Link to="/admin?modulo=games&cobertura=without_images"><ImageOff /><span><strong>{data.games.without_images}</strong> juegos sin imagen</span></Link>
            <Link to="/admin?modulo=games&cobertura=without_rules"><BookOpen /><span><strong>{data.games.without_rules}</strong> juegos sin reglas rápidas publicadas</span></Link>
          </div>
        </section>

      <details className="admin-panel admin-diagnostic-details">
      <summary>Ver tendencias de actividad</summary>
      <div className="admin-grid three">
        <section className="admin-panel chart-panel">
          <div className="panel-heading"><h2>Usuarios por mes</h2></div>
          <div className="chart-bars">
            {(data.charts?.users_by_month || []).map((u) => (
              <div key={u.month} className="chart-bar" style={{ "--h": `${(u.count / maxUsers) * 100}%` }}>
                <span>{u.count}</span>
                <div /><small>{u.month?.slice(5)}</small>
              </div>
            ))}
          </div>
        </section>
        <section className="admin-panel chart-panel">
          <div className="panel-heading"><h2>Juegos por género</h2></div>
          <div className="chart-bars">
            {(data.charts?.games_by_genre || []).map((g) => (
              <div key={g.genre} className="chart-bar" style={{ "--h": `${(g.count / maxGenre) * 100}%` }}>
                <span>{g.count}</span>
                <div /><small>{g.genre}</small>
              </div>
            ))}
          </div>
        </section>
        <section className="admin-panel chart-panel">
          <div className="panel-heading"><h2>Partidas (últ. 30 días)</h2></div>
          <div className="chart-bars">
            {(data.charts?.sessions_by_day || []).map((s) => (
              <div key={s.date} className="chart-bar" style={{ "--h": `${(s.count / maxSessions) * 100}%` }}>
                <span>{s.count}</span>
                <div /><small>{s.date?.slice(8)}</small>
              </div>
            ))}
          </div>
        </section>
      </div>
      </details>

        <section className="admin-panel">
          <div className="panel-heading"><h2>Actividad reciente</h2><Activity /></div>
          <div className="activity-list">
            {data.recent_activity.map((item) => (
              <div key={item.id}>
                <span className={`activity-dot action-${item.action?.toLowerCase()}`} />
                <div><strong>{item.username}</strong><p>{item.action} · {item.entity_type} · {item.entity_name || "Sin nombre"}</p></div>
                <time>{new Date(item.timestamp).toLocaleDateString("es-BO")}</time>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
