import React, { useEffect, useState } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import { resendVerification, verifyEmail } from "../services/auth";
import { LuArrowLeft } from "react-icons/lu";
import AccountEntryHeader from "./AccountEntryHeader";
import "./Login.css";

export default function VerifyEmail() {
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const token = searchParams.get("token");
  const [email, setEmail] = useState(location.state?.email || "");
  const [status, setStatus] = useState(token ? "Verificando correo..." : "Revisa tu bandeja de entrada.");
  const [verified, setVerified] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!token) return;
    verifyEmail(token).then((result) => { setStatus(result.detail); setVerified(true); }).catch((requestError) => {setStatus("No se pudo verificar el enlace. Puedes solicitar uno nuevo.");setError(requestError.message);});
  }, [token]);

  const resend = async (event) => {
    event.preventDefault(); if(sending)return; setSending(true); setError("");
    try {
      const result = await resendVerification(email);
      if (result.debug_token) window.location.assign(`/verificar-correo?token=${encodeURIComponent(result.debug_token)}`);
      else setStatus(result.detail);
    } catch (requestError) { setError(requestError.message); } finally {setSending(false);}
  };

  return (
    <section className="login-container">
      <div className="login-box account-entry-box">
        <AccountEntryHeader title="Verificar correo"><span role="status">{status}</span></AccountEntryHeader>
        {error && <p className="ui-status error" role="alert">{error}</p>}
        {!verified && (!token || error) && (
          <form className="login-form" onSubmit={resend}>
            <div className="form-group">
              <label htmlFor="verify-email">Correo electrónico</label>
              <input id="verify-email" autoComplete="email" type="email" required
                value={email} onChange={(event) => setEmail(event.target.value)} />
            </div>
            <button className="btn btn-primary btn-block" disabled={sending}>
              {sending ? "Enviando…" : "Reenviar verificación"}
            </button>
          </form>
        )}
        <p className="account-entry-footer">
          <Link to="/login"><LuArrowLeft size={16} aria-hidden="true" /> Volver a iniciar sesión</Link>
        </p>
      </div>
    </section>
  );
}
