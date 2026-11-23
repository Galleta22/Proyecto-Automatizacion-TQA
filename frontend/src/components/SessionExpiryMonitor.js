import React, { useEffect, useRef, useState } from "react";
import { getToken, logout, parseJwt, refreshSession } from "../services/auth";
export default function SessionExpiryMonitor({active}) {
  const [remaining,setRemaining]=useState(null);const [busy,setBusy]=useState(false);const [error,setError]=useState("");const expired=useRef(false);
  useEffect(()=>{if(!active)return undefined;const check=()=>{const exp=parseJwt(getToken())?.exp;if(!exp)return;const value=exp*1000-Date.now();setRemaining(value);if(value<=0&&!expired.current){expired.current=true;logout();window.location.replace("/login");}};check();const timer=setInterval(check,1000);return()=>clearInterval(timer);},[active]);
  if(!active||remaining===null||remaining>300000)return null;
  const renew=async()=>{setBusy(true);setError("");try{await refreshSession();setRemaining(parseJwt(getToken()).exp*1000-Date.now());}catch(err){setError(err.message);}finally{setBusy(false);}};
  return (
    <aside className="session-warning" aria-label="Vencimiento de sesión">
      <span role="status">Tu sesión vence en {Math.max(0, Math.ceil(remaining / 60000))} min. Guarda tu trabajo o renueva el acceso.</span>
      <button type="button" className="btn-primary" disabled={busy} onClick={renew}>
        {busy ? "Renovando…" : "Renovar sesión"}
      </button>
      {error && <span className="session-warning-error" role="alert">{error}</span>}
    </aside>
  );
}
