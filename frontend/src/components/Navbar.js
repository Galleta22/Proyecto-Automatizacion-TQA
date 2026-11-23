import React from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { LuBell as Bell, LuMenu as Menu, LuSun as Sun, LuMoon as Moon, LuUserRound as UserRound, LuShieldCheck as ShieldCheck, LuLogOut as LogOut, LuChevronDown as ChevronDown } from "react-icons/lu";
import { getMyProfile, getNotifications } from "../services/api";
import useTheme, { toggleTheme } from "../ui/useTheme";
import "./Navbar.css";
import NotificationsPage from "./NotificationsPage";

export default function Navbar({ onLogout, user, loggedIn, onToggleMenu, menuOpen }) {
  const navigate = useNavigate();
  const location = useLocation();
  const profileMenu = React.useRef(null);
  const theme = useTheme();
  React.useEffect(() => {
    const close = (event) => { if (event.key === "Escape" || (event.type === "pointerdown" && !profileMenu.current?.contains(event.target))) setShowDropdown(false); };
    document.addEventListener("pointerdown", close); document.addEventListener("keydown", close);
    return () => { document.removeEventListener("pointerdown", close); document.removeEventListener("keydown", close); };
  }, []);
  const [showDropdown, setShowDropdown] = React.useState(false);
  const [profile, setProfile] = React.useState(null);
  const [notifications, setNotifications] = React.useState({ unread: 0, items: [] });
  const [showNotifications, setShowNotifications] = React.useState(false);

  React.useEffect(() => {
    if (!loggedIn) {
      setProfile(null);
      return undefined;
    }
    getMyProfile().then(setProfile).catch(() => setProfile(null));
    const handleProfileUpdate = (event) => setProfile(event.detail);
    window.addEventListener("ludisist:profile-updated", handleProfileUpdate);
    return () => window.removeEventListener("ludisist:profile-updated", handleProfileUpdate);
  }, [loggedIn]);

  React.useEffect(() => {
    if (!loggedIn) {
      setNotifications({ unread: 0, items: [] });
      return undefined;
    }
    const load = () => getNotifications().then(setNotifications).catch(() => undefined);
    load();
    const interval = window.setInterval(load, 5000);
    const onVisible = () => { if (document.visibilityState === "visible") load(); };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("ludisist:notification", load);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("ludisist:notification", load);
    };
  }, [loggedIn]);

  React.useEffect(() => {
    setShowDropdown(false);
    setShowNotifications(false);
  }, [location.pathname]);

  // Toggle function for better React handling than direct DOM manipulation
  const toggleDropdown = () => setShowDropdown(!showDropdown);


  const handleLogout = () => {
    onLogout();
    navigate("/");
  };

  const toggleNotifications = async () => {
    setShowNotifications((current) => !current);
    if (!showNotifications) {
      const data = await getNotifications().catch(() => null);
      if (data) setNotifications(data);
    }
  };


  return (
    <header className="site-header">
      <div className="container navbar-content">
        <div className="logo-container">
          <button type="button" className="shell-menu-toggle" aria-label="Abrir o contraer menú lateral" aria-controls="app-sidebar" aria-expanded={menuOpen} onClick={onToggleMenu}><Menu /></button>
          <Link to="/" className="logo">
            Ludisist <span className="logo-dot">.</span>
          </Link>
        </div>

        <div className="nav-actions">
          <button className="theme-toggle" aria-label={theme === "dark" ? "Activar modo claro" : "Activar modo oscuro"} onClick={toggleTheme}>{theme === "dark" ? <Sun /> : <Moon />}</button>
          {loggedIn && user ? (
            <>
            <div className="notification-container">
              <button type="button" className="notification-button" aria-label={`${notifications.unread} notificaciones sin leer`} aria-haspopup="dialog" aria-expanded={showNotifications} onClick={toggleNotifications}>
                <Bell />
                {notifications.unread > 0 && <span>{notifications.unread > 9 ? "9+" : notifications.unread}</span>}
              </button>
              {showNotifications && <NotificationsPage onClose={() => setShowNotifications(false)} />}
            </div>
            <div className="user-menu-container" ref={profileMenu}>
              <button
                className="user-menu-btn"
                onClick={toggleDropdown}
                aria-expanded={showDropdown}
                aria-label="Abrir menú de perfil"
              >
                <div className="user-avatar-small">
                  {profile?.avatar_url ? <img src={profile.avatar_url} alt="" /> : <UserRound aria-hidden="true" size={16} />}
                </div>
                <span>{profile?.nickname || user.sub}</span>
                <ChevronDown size={16} aria-hidden="true" />
              </button>

              {showDropdown && (
                <div className="dropdown-menu">
                  <Link to="/perfil" className="dropdown-item">
                    <UserRound aria-hidden="true" /> Ver y editar perfil
                  </Link>
                  <Link to="/cuenta" className="dropdown-item"><ShieldCheck aria-hidden="true" /> Cuenta y privacidad</Link>
                  <div className="dropdown-divider"></div>
                  <button onClick={handleLogout} className="dropdown-item">
                    <LogOut aria-hidden="true" /> Cerrar sesión
                  </button>
                </div>
              )}
            </div>
            </>
          ) : (
            location.pathname !== "/login" && (
              <Link to="/login" className="btn btn-primary btn-sm">
                Iniciar Sesión
              </Link>
            )
          )}
        </div>
      </div>
    </header>
  );
}
