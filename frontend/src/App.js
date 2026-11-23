import React, { useCallback, useEffect, useState } from "react";
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import Login from "./components/Login";
import Register from "./components/Register";
import ForgotPassword from "./components/ForgotPassword";
import VerifyEmail from "./components/VerifyEmail";
import GamePage from "./components/GamePage";
import GameList from "./components/GameList";
import UXInfrastructure from "./ui/UXInfrastructure";
import Navbar from "./components/Navbar";
import Sidebar from "./components/Sidebar";
import "./components/Sidebar.css";
import BannerInicio from "./components/BannerInicio";
import Reglas from "./components/Reglas";
import AdminPanel from "./components/AdminPanel";
import AccountSettings from "./components/AccountSettings";
import UserProfile from "./components/UserProfile";
import PublicProfile from "./components/PublicProfile";
import AIChat from "./components/AIChat";
import SessionExpiryMonitor from "./components/SessionExpiryMonitor";
import GameSessions from "./components/GameSessions";
import Matchmaking from "./components/Matchmaking";
import NotificationsPage from "./components/NotificationsPage";
import MessagesPage from "./components/MessagesPage";
import TournamentsPage from "./components/TournamentsPage";
import ContentReview from "./components/ContentReview";
import Leaderboard from "./components/Leaderboard";
import { getToken, logout, parseJwt } from "./services/auth";
import { ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import "./App.css";

export default function App() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => localStorage.getItem("ludisist:sidebar") === "collapsed");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [mobileLayout, setMobileLayout] = useState(() => window.matchMedia("(max-width: 900px)").matches);
  useEffect(() => { const media=window.matchMedia("(max-width: 900px)"); const changed=()=>setMobileLayout(media.matches);media.addEventListener("change",changed);return()=>media.removeEventListener("change",changed); }, []);
  const closeSidebar = useCallback(() => setSidebarOpen(false), []);
  const toggleSidebar = () => {
    if (window.matchMedia("(max-width: 900px)").matches) setSidebarOpen((open) => !open);
    else setSidebarCollapsed((collapsed) => { localStorage.setItem("ludisist:sidebar", collapsed ? "open" : "collapsed"); return !collapsed; });
  };
  const [loggedIn, setLoggedIn] = useState(!!getToken());

  const handleLogout = () => {
    logout();
    setLoggedIn(false);
  };

  const handleLogin = () => setLoggedIn(true);

  const user = loggedIn ? parseJwt(getToken()) : null;
  const userRole = user?.role || "";

  useEffect(() => {
    const shortMessage = (field) => {
      if (field.validity.valueMissing) return "Campo obligatorio.";
      if (field.validity.typeMismatch) return "Dato no válido.";
      if (field.validity.tooShort) return "Muy corto.";
      if (field.validity.tooLong) return "Muy largo.";
      if (field.validity.rangeUnderflow || field.validity.rangeOverflow) return "Fuera de rango.";
      return "Revisa este campo.";
    };
    const onInvalid = (event) => {
      const field = event.target;
      if (!(field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement || field instanceof HTMLSelectElement)) return;
      field.setCustomValidity(shortMessage(field));
      field.classList.add("field-invalid");
    };
    const onInput = (event) => {
      const field = event.target;
      if (!(field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement || field instanceof HTMLSelectElement)) return;
      field.setCustomValidity("");
      field.classList.remove("field-invalid");
    };
    const onSubmit = (event) => {
      if (event.target.noValidate) return;
      const requiredFields = [...event.target.querySelectorAll("input[required], textarea[required], select[required]")];
      const blank = requiredFields.find((field) => typeof field.value === "string" && !field.value.trim());
      const tooShort = requiredFields.find((field) => field.minLength > 0 && field.value.trim().length < field.minLength);
      const invalidField = blank || tooShort;
      if (!invalidField) return;
      event.preventDefault();
      invalidField.setCustomValidity(blank ? "Campo obligatorio." : `Mínimo ${invalidField.minLength} caracteres.`);
      invalidField.classList.add("field-invalid");
      invalidField.reportValidity();
    };
    document.addEventListener("invalid", onInvalid, true);
    document.addEventListener("input", onInput, true);
    document.addEventListener("submit", onSubmit, true);
    return () => {
      document.removeEventListener("invalid", onInvalid, true);
      document.removeEventListener("input", onInput, true);
      document.removeEventListener("submit", onSubmit, true);
    };
  }, []);

  return (
    <Router>
      <UXInfrastructure />
      <a href="#main-content" className="skip-link">Saltar al contenido</a>
      <ToastContainer position="bottom-right" autoClose={2600} />
      <SessionExpiryMonitor active={loggedIn} />
      <Navbar loggedIn={loggedIn} onLogout={handleLogout} user={user} onToggleMenu={toggleSidebar} menuOpen={mobileLayout ? sidebarOpen : !sidebarCollapsed} />
      <div className={`app-layout ${sidebarCollapsed ? "is-collapsed" : ""}`}>
      <Sidebar loggedIn={loggedIn} user={user} collapsed={sidebarCollapsed} mobileOpen={sidebarOpen} onClose={closeSidebar} onToggle={toggleSidebar} />
      <div className="app-main"><div className="container">
        <main id="main-content" tabIndex={-1}>
          <Routes>
            <Route path="/" element={<BannerInicio user={user} />} />
            <Route path="/login" element={
              !loggedIn ? <Login onLogin={handleLogin} /> : <Navigate to="/" />
            } />
            <Route path="/register" element={
              !loggedIn ? <Register /> : <Navigate to="/" />
            } />
            <Route path="/recuperar-contrasena" element={<ForgotPassword />} />
            <Route path="/restablecer-contrasena" element={<ForgotPassword />} />
            <Route path="/verificar-correo" element={<VerifyEmail />} />
            <Route path="/juegos" element={<GameList />} />
            <Route path="/juegos/:id" element={<GamePage />} />
            <Route path="/reglas" element={<Reglas />} />
            <Route path="/asistente" element={
              loggedIn ? <AIChat /> : <Navigate to="/login" />
            } />
            <Route path="/cuenta" element={loggedIn ? <AccountSettings /> : <Navigate to="/login" />} />
            <Route path="/perfil" element={
              loggedIn ? <UserProfile /> : <Navigate to="/login" />
            } />
            <Route path="/jugadores/:userId" element={
              loggedIn ? <PublicProfile /> : <Navigate to="/login" />
            } />
            <Route path="/partidas" element={
              loggedIn ? <GameSessions /> : <Navigate to="/login" />
            } />
            <Route path="/mesas" element={
              loggedIn ? <Matchmaking /> : <Navigate to="/login" />
            } />
            <Route path="/comunidad" element={
              loggedIn ? <Matchmaking /> : <Navigate to="/login" />
            } />
            <Route path="/notificaciones" element={
              loggedIn ? <><BannerInicio user={user} /><NotificationsPage /></> : <Navigate to="/login" />
            } />
            <Route path="/mensajes" element={
              loggedIn ? <MessagesPage /> : <Navigate to="/login" />
            } />
            <Route path="/torneos" element={<TournamentsPage />} />
            <Route path="/torneos/:id" element={<TournamentsPage />} />
            <Route path="/revision-contenido" element={["admin","facilitador"].includes(userRole) ? <ContentReview /> : <Navigate to="/login" />} />
            <Route path="/ranking" element={
              loggedIn ? <Leaderboard /> : <Navigate to="/login" />
            } />

            <Route path="/admin" element={
              ["admin", "facilitador"].includes(userRole) ? <AdminPanel /> : <Navigate to="/" />
            } />

            <Route path="*" element={<Navigate to="/" />} />
          </Routes>
        </main>
      </div></div>
      </div>
    </Router>
  );
}
