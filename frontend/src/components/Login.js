import React, { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { LuEye, LuEyeOff } from "react-icons/lu";
import { login } from "../services/auth";
import { uxRequest } from "../services/uxApi";
import AccountEntryHeader from "./AccountEntryHeader";
import "./Login.css";
export function safeNext(value) { return value?.startsWith("/") && !value.startsWith("//") && !value.includes("\\") ? value : "/"; }
export default function Login({onLogin}) {
 const [username,setUsername]=useState("");const [password,setPassword]=useState("");const [visible,setVisible]=useState(false);const [busy,setBusy]=useState(false);const [error,setError]=useState("");
 const [notice,setNotice]=useState("");
 const reactivate=async()=>{if(!username||!password){setError("Escribe tu usuario y contraseña para solicitar la reactivación");return;}setBusy(true);try{const result=await uxRequest("/account/request-reactivation",{method:"POST",body:JSON.stringify({username,password})});setNotice(result.detail);setError("");}catch(err){setError(err.message);}finally{setBusy(false);}};
 const navigate=useNavigate();const [params]=useSearchParams();const next=safeNext(params.get("next") || sessionStorage.getItem("ludisist:returnTo"));
 const submit=async(e)=>{e.preventDefault();if(busy)return;setBusy(true);setError("");try{await login(username.trim(),password);sessionStorage.removeItem("ludisist:returnTo");onLogin();navigate(next,{replace:true});}catch(err){setError(err.message);}finally{setBusy(false);}};
 return (
  <section className="login-container">
   <div className="login-box account-entry-box">
    <AccountEntryHeader title="Inicia sesión">Aprende, encuentra una mesa y conserva tus partidas.</AccountEntryHeader>
    {error && <div role="alert" className="ui-status error">{error}</div>}
    {notice && <p role="status" className="ui-status">{notice}</p>}
    <form onSubmit={submit} className="login-form">
     <div className="form-group">
      <label htmlFor="login-username">Usuario</label>
      <input id="login-username" name="username" autoComplete="username" required
       value={username} onChange={event => setUsername(event.target.value)} />
     </div>
     <div className="form-group">
      <label htmlFor="login-password">Contraseña</label>
      <div className="password-field">
       <input id="login-password" name="password" autoComplete="current-password" required
        type={visible ? "text" : "password"} value={password}
        onChange={event => setPassword(event.target.value)} />
       <button type="button" aria-label="Mostrar contraseña" aria-controls="login-password"
        aria-pressed={visible} onClick={() => setVisible(previous => !previous)}>
        {visible ? <LuEyeOff aria-hidden="true" /> : <LuEye aria-hidden="true" />}
       </button>
      </div>
      <Link className="account-password-help" to="/recuperar-contrasena">Olvidé mi contraseña</Link>
     </div>
     <button className="btn btn-primary" disabled={busy}>{busy ? "Ingresando…" : "Iniciar sesión"}</button>
    </form>
    <details className="account-entry-help">
     <summary>Ayuda con mi cuenta</summary>
     <p><Link to="/verificar-correo">Verificar correo o reenviar enlace</Link></p>
     <p>Si tu cuenta está desactivada, escribe tu usuario y contraseña arriba para solicitar una revisión.</p>
     <button type="button" className="btn-secondary" disabled={busy} onClick={reactivate}>Solicitar reactivación</button>
    </details>
    <p className="account-entry-footer">¿Primera visita? <Link to={`/register?next=${encodeURIComponent(next)}`}>Crear cuenta</Link></p>
   </div>
  </section>
 );
}
