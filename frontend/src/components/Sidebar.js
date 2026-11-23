import React, { useEffect, useRef, useState } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { LuHouse, LuGamepad2, LuBookOpen, LuBot, LuMessagesSquare, LuTrophy, LuCalendarDays, LuUsers, LuShield, LuActivity, LuSettings, LuGauge, LuChevronDown, LuChevronLeft, LuChevronRight, LuX, LuEye } from "react-icons/lu";

const USER_LINKS = [
  { to: "/", label: "Inicio", icon: LuHouse, public: true },
  { to: "/juegos", label: "Catálogo", icon: LuGamepad2, public: true },
  { to: "/reglas", label: "Reglas y manuales", icon: LuBookOpen, public: true },
  { to: "/asistente", label: "Asistente IA", icon: LuBot },
  { to: "/partidas", label: "Mis partidas", icon: LuGamepad2 },
  { to: "/mensajes", label: "Mensajes", icon: LuMessagesSquare },
  { to: "/ranking", label: "Ranking", icon: LuTrophy },
  { to: "/mesas", label: "Encontrar mesa", icon: LuCalendarDays },
  { to: "/torneos", label: "Torneos", icon: LuTrophy, public: true },
];
const ADMIN_GROUPS = [
  { label: "Principal", items: [["dashboard", "Resumen", LuGauge]] },
  { label: "Personas", items: [["users", "Usuarios", LuUsers], ["badges", "Insignias y solicitudes", LuShield]] },
  { label: "Contenido", items: [["games", "Gestionar juegos", LuGamepad2], ["rules", "Gestionar reglas", LuBookOpen], ["manuals", "Gestionar manuales", LuBookOpen]] },
  { label: "Actividad", items: [["tables", "Convocatorias", LuCalendarDays], ["sessions", "Partidas registradas", LuGamepad2], ["tournaments", "Gestionar torneos", LuTrophy]] },
  { label: "Sistema", items: [["system", "Estado del sistema", LuSettings], ["ai", "Diagnóstico IA", LuBot], ["audit", "Auditoría", LuActivity]] },
];

export default function Sidebar({ loggedIn, user, collapsed, mobileOpen, onClose, onToggle }) {
  const location = useLocation();
  const sidebarRef = useRef(null);
  const isAdmin = loggedIn && user?.role === "admin";
  const module = new URLSearchParams(location.search).get("modulo") || "dashboard";
  const [userViewOpen, setUserViewOpen] = useState(() => location.pathname !== "/admin");
  const [closedGroups, setClosedGroups] = useState(new Set());
  const compact = collapsed && !mobileOpen;
  useEffect(() => { onClose(); }, [location.pathname, location.search, onClose]);
  useEffect(() => {
    if (location.pathname !== "/admin") setUserViewOpen(true);
  }, [location.pathname]);
  useEffect(() => {
    if (!mobileOpen) return undefined;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const previousFocus = document.activeElement;
    const sidebar = sidebarRef.current;
    const main = document.querySelector(".app-main"); if (main) main.inert = true;
    const items = () => [...sidebar.querySelectorAll("button, a[href]")].filter((e) => e.getClientRects().length && !e.disabled);
    sidebar.querySelector(".shell-sidebar-nav").scrollTop = 0;
    items()[0]?.focus();
    const escape = (event) => {
      if (event.key === "Escape") onClose();
      if (event.key === "Tab") { const buttons=items(); const index=buttons.indexOf(document.activeElement); if ((event.shiftKey && index<=0) || (!event.shiftKey && index===buttons.length-1)) {event.preventDefault();buttons[event.shiftKey?buttons.length-1:0]?.focus();} }
    };
    document.addEventListener("keydown", escape);
    return () => { document.body.style.overflow = previous; if(main)main.inert=false; previousFocus?.focus(); document.removeEventListener("keydown", escape); };
  }, [mobileOpen, onClose]);
  const toggleGroup = (label) => setClosedGroups((current) => {
    const next = new Set(current);
    if (next.has(label)) next.delete(label); else next.add(label);
    return next;
  });
  const userLinks = USER_LINKS.filter((item) => loggedIn || item.public).map(({ to, label, icon: Icon }) => (
    <NavLink key={to} to={to} end={to === "/"} title={compact ? label : undefined} className={({ isActive }) => `shell-nav-link ${isActive || (to === "/mesas" && location.pathname === "/comunidad") ? "active" : ""}`}>
      <Icon /><span>{label}</span>
    </NavLink>
  ));
  return <>
    {mobileOpen && <button className="shell-sidebar-scrim" aria-label="Cerrar menú lateral" onClick={onClose} />}
    <aside ref={sidebarRef} id="app-sidebar" className={`shell-sidebar ${mobileOpen ? "mobile-open" : ""} ${compact ? "compact" : ""}`}>
      <div className="shell-sidebar-heading"><span className="shell-brand-mark">L</span><div><strong>Ludisist</strong><small>{isAdmin ? "Administración" : loggedIn ? "Tu espacio de juego" : "Explora y juega"}</small></div><button className="shell-mobile-close" aria-label="Cerrar menú lateral" onClick={onClose}><LuX /></button></div>
      <nav aria-label="Navegación principal" className="shell-sidebar-nav">
        {isAdmin ? <>
          <section className="shell-nav-group">
            <button className="shell-group-button user-view-toggle" aria-expanded={compact || userViewOpen} onClick={() => setUserViewOpen((value) => !value)} title={compact ? "Vista de usuario" : undefined}><LuEye /><span>Vista de usuario</span><LuChevronDown className={userViewOpen ? "expanded" : ""} /></button>
            {(compact || userViewOpen) && <div className="shell-user-links">{userLinks}</div>}
          </section>
          {ADMIN_GROUPS.map(({ label, items }) => <section key={label} className="shell-nav-group">
            {!compact && <button className="shell-group-button" aria-expanded={!closedGroups.has(label)} onClick={() => toggleGroup(label)}><span>{label}</span><LuChevronDown className={!closedGroups.has(label) ? "expanded" : ""} /></button>}
            {(compact || !closedGroups.has(label)) && items.map(([id, text, Icon]) => <Link key={id} to={`/admin?modulo=${id}`} aria-current={location.pathname === "/admin" && module === id ? "page" : undefined} title={compact ? `Administración: ${text}` : undefined} className={`shell-nav-link ${location.pathname === "/admin" && module === id ? "active" : ""}`}><Icon /><span>{text}</span></Link>)}
          </section>)}
        </> : <section className="shell-nav-group"><div className="shell-section-label">Principal</div>{userLinks}</section>}
        {loggedIn && ["admin","facilitador"].includes(user?.role) && <section className="shell-nav-group"><Link to="/revision-contenido" className={`shell-nav-link ${location.pathname === "/revision-contenido" ? "active" : ""}`} title="Revisar contenido"><LuShield/><span>Revisar contenido</span></Link>{user?.role === "facilitador" && <><Link to="/admin?modulo=games" className="shell-nav-link"><LuGamepad2/><span>Gestionar juegos</span></Link><Link to="/admin?modulo=rules" className="shell-nav-link"><LuBookOpen/><span>Gestionar reglas</span></Link><Link to="/admin?modulo=manuals" className="shell-nav-link"><LuBookOpen/><span>Gestionar manuales</span></Link><Link to="/admin?modulo=tournaments" className="shell-nav-link"><LuTrophy/><span>Gestionar torneos</span></Link></> }</section>}
      </nav>
      <button className="shell-sidebar-collapse" onClick={onToggle} title={compact ? "Ampliar menú" : "Contraer menú"}>{compact ? <LuChevronRight /> : <LuChevronLeft />}<span>Contraer menú</span></button>
    </aside>
  </>;
}
