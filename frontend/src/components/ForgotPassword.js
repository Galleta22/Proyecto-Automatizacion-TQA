import React, { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { forgotPassword, resetPassword } from "../services/auth";
import "./Login.css";

export default function ForgotPassword() {
  const [searchParams] = useSearchParams();
  const [email, setEmail] = useState("");
  const [token, setToken] = useState(searchParams.get("token") || "");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const requestReset = async (event) => {
    event.preventDefault(); setLoading(true); setError("");
    try { const result = await forgotPassword(email); setMessage(result.detail); if (result.debug_token) setToken(result.debug_token); }
    catch (requestError) { setError(requestError.message); }
    finally { setLoading(false); }
  };

  const submitReset = async (event) => {
    event.preventDefault(); setError("");
    if (password !== confirmPassword) { setError("Las contraseñas no coinciden"); return; }
    setLoading(true);
    try { await resetPassword(token, password); navigate("/login", { replace: true }); }
    catch (requestError) { setError(requestError.message); }
    finally { setLoading(false); }
  };

  return <div className="login-container"><div className="login-box card">
    <div className="login-header"><h1>Recuperar contraseña</h1><p>{token ? "Crea una contraseña nueva" : "Te enviaremos instrucciones"}</p></div>
    {error && <div className="error-message">{error}</div>}{message && <div className="success-message">{message}</div>}
    {!token ? <form className="login-form" onSubmit={requestReset}><div className="form-group"><label>Correo</label><input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} /></div><button className="btn btn-primary btn-block" disabled={loading}>{loading ? "Enviando..." : "Continuar"}</button></form>
      : <form className="login-form" onSubmit={submitReset}><div className="form-group"><label>Nueva contraseña</label><input type="password" minLength="8" maxLength="72" required value={password} onChange={(event) => setPassword(event.target.value)} /></div><div className="form-group"><label>Confirmar contraseña</label><input type="password" required value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} /></div><button className="btn btn-primary btn-block" disabled={loading}>{loading ? "Guardando..." : "Cambiar contraseña"}</button></form>}
    <div className="login-secondary-link"><Link to="/login">Volver al inicio de sesión</Link></div>
  </div></div>;
}
