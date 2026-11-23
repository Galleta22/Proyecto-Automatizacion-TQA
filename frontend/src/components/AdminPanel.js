import React, { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { LuActivity as Activity, LuBot as Bot, LuBookOpen as BookOpen, LuCalendarDays as CalendarDays, LuChevronRight as ChevronRight, LuGamepad2 as Gamepad2, LuGauge as Gauge, LuLogIn as LogIn, LuSettings as Settings, LuShield as Shield, LuTrophy as Trophy, LuUsers as Users } from "react-icons/lu";
import { getToken, parseJwt, isTokenExpired, logout } from "../services/auth";
import AuditLog from "./AuditLog";
import AdminAI from "./admin/AdminAI";
import AdminBadges from "./admin/AdminBadges";
import AdminDashboard from "./admin/AdminDashboard";
import AdminGames from "./admin/AdminGames";
import AdminManuals from "./admin/AdminManuals";
import AdminRules from "./admin/AdminRules";
import AdminSessions from "./admin/AdminSessions";
import AdminSettings from "./admin/AdminSettings";
import AdminSystem from "./admin/AdminSystem";
import AdminTables from "./admin/AdminTables";
import AdminTournaments from "./admin/AdminTournaments";
import AdminUsers from "./admin/AdminUsers";
import "./AdminPanel.css";

const MODULES = [
  { id: "dashboard", label: "Dashboard", icon: Gauge, component: AdminDashboard, group: "Principal" },
  { id: "users", label: "Usuarios", icon: Users, component: AdminUsers, group: "Gestión" },
  { id: "tournaments", label: "Torneos", icon: Trophy, component: AdminTournaments, group: "Gestión" },
  { id: "tables", label: "Mesas", icon: CalendarDays, component: AdminTables, group: "Gestión" },
  { id: "games", label: "Juegos", icon: Gamepad2, component: AdminGames, group: "Gestión" },
  { id: "manuals", label: "Reglamentos", icon: BookOpen, component: AdminManuals, group: "Gestión" },
  { id: "badges", label: "Insignias", icon: Shield, component: AdminBadges, group: "Gestión" },
  { id: "audit", label: "Auditoría", icon: Activity, component: AuditLog, group: "Gestión" },
  { id: "sessions", label: "Partidas", icon: Gamepad2, component: AdminSessions, group: "Gestión" },
  { id: "rules", label: "Reglas", icon: BookOpen, component: AdminRules, group: "Herramientas" },
  { id: "ai", label: "Asistente IA", icon: Bot, component: AdminAI, group: "Herramientas" },
  { id: "system", label: "Sistema", icon: Shield, component: AdminSystem, group: "Sistema" },
  { id: "settings", label: "Configuración", icon: Settings, component: AdminSettings, group: "Sistema" },
];

export default function AdminPanel() {
  const [searchParams, setSearchParams] = useSearchParams();
  const role = parseJwt(getToken())?.role;
  const requested = searchParams.get("modulo") || (role === "admin" ? "dashboard" : "games");
  const activeModule = role === "facilitador" && !["games","rules","manuals","tournaments","ai"].includes(requested) ? "games" : requested;
  const [sessionInvalid, setSessionInvalid] = useState(() => isTokenExpired(getToken()));
  const selected = MODULES.find((item) => item.id === activeModule) || MODULES[0];
  const ActiveComponent = selected.component;
  const navigate = (id) => {
    if (!sessionInvalid && MODULES.some((item) => item.id === id)) setSearchParams({ modulo: id });
  };

  useEffect(() => {
    const invalidateSession = () => setSessionInvalid(true);
    window.addEventListener("ludisist:admin-session-invalid", invalidateSession);
    const timer = window.setInterval(() => {
      if (isTokenExpired(getToken())) {
        logout();
        setSessionInvalid(true);
      }
    }, 15000);
    return () => {
      window.removeEventListener("ludisist:admin-session-invalid", invalidateSession);
      window.clearInterval(timer);
    };
  }, []);

  if (sessionInvalid) {
    return (
      <div className="admin-session-blocked">
        <Shield />
        <h1>Sesión administrativa finalizada</h1>
        <p>Tus credenciales ya no son válidas. El panel quedó bloqueado para proteger la administración.</p>
        <button onClick={() => window.location.replace("/login")}><LogIn /> Iniciar sesión nuevamente</button>
      </div>
    );
  }

  return (
    <div className="admin-shell admin-shell-shared">
      <div className="admin-workspace">
        <header className="admin-topbar">
          <div className="admin-breadcrumb"><span>Administración</span><ChevronRight /><strong>{selected.label}</strong></div>
        </header>
        <section className="admin-content">
          <ActiveComponent navigate={navigate} />
        </section>
      </div>
    </div>
  );
}
