import React, { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { LuEye, LuEyeOff } from "react-icons/lu";
import { uxRequest } from "../services/uxApi";
import { safeNext } from "./Login";
import AccountEntryHeader from "./AccountEntryHeader";
import "./Login.css";
export default function Register() {
 const [form,setForm]=useState({username:"",email:"",password:"",confirmPassword:"",experience_level:"beginner"});const [errors,setErrors]=useState({});const [busy,setBusy]=useState(false);const [error,setError]=useState("");const [visible,setVisible]=useState({});
 const navigate=useNavigate();const [params]=useSearchParams();
 const change=(e)=>{setForm({...form,[e.target.name]:e.target.value});setErrors({...errors,[e.target.name]:""});};
 const submit=async(e)=>{e.preventDefault();if(busy)return;const issues={};if(form.username.trim().length<3)issues.username="Usa al menos 3 caracteres.";if(!/^\S+@\S+\.\S+$/.test(form.email))issues.email="Escribe un correo válido.";if(form.password.length<8)issues.password="Usa al menos 8 caracteres.";if(new TextEncoder().encode(form.password).length>72)issues.password="La contraseña es demasiado larga; usa hasta 72 bytes.";if(form.password!==form.confirmPassword)issues.confirmPassword="Las contraseñas no coinciden.";setErrors(issues);if(Object.keys(issues).length)return;setBusy(true);setError("");try{const data=await uxRequest("/users/register",{method:"POST",body:JSON.stringify({username:form.username.trim(),email:form.email.trim(),password:form.password,experience_level:form.experience_level})});sessionStorage.setItem("ludisist:returnTo",safeNext(params.get("next")));navigate(`/verificar-correo${data.debug_token?`?token=${encodeURIComponent(data.debug_token)}`:""}`,{state:{email:form.email}});}catch(err){setError(err.message);}finally{setBusy(false);}};
 return (
  <section className="login-container">
   <div className="login-box account-entry-box">
    <AccountEntryHeader title="Crea tu cuenta">No necesitas experiencia para empezar.</AccountEntryHeader>
    {error && <p role="alert" className="ui-status error">{error}</p>}
    <form onSubmit={submit} className="login-form" noValidate>
     {[
      ["username", "Usuario", "text", "username"],
      ["email", "Correo electrónico", "email", "email"],
      ["password", "Contraseña", "password", "new-password"],
      ["confirmPassword", "Repite la contraseña", "password", "new-password"],
     ].map(([name, label, type, autoComplete]) => {
      const isPassword = type === "password";
      const fieldId = `register-${name}`;
      const errorId = `${fieldId}-error`;
      const describedBy = [errors[name] && errorId, name === "password" && "register-password-help"].filter(Boolean).join(" ");
      const input = (
       <input id={fieldId} name={name} type={visible[name] ? "text" : type}
        autoComplete={autoComplete} required maxLength={isPassword ? 72 : 100}
        value={form[name]} onChange={change} aria-invalid={Boolean(errors[name])}
        aria-describedby={describedBy || undefined} />
      );
      return <div className="form-group" key={name}>
       <label htmlFor={fieldId}>{label}</label>
       {isPassword ? (
        <div className="password-field">
         {input}
         <button type="button" aria-controls={fieldId}
          aria-label={name === "password" ? "Mostrar contraseña" : "Mostrar confirmación de contraseña"}
          aria-pressed={Boolean(visible[name])}
          onClick={() => setVisible(previous => ({ ...previous, [name]: !previous[name] }))}>
          {visible[name] ? <LuEyeOff aria-hidden="true" /> : <LuEye aria-hidden="true" />}
         </button>
        </div>
       ) : input}
       {errors[name] && <small id={errorId} className="field-error">{errors[name]}</small>}
       {name === "password" && <small id="register-password-help">Usa al menos 8 caracteres. Puedes pegar una contraseña de tu gestor.</small>}
      </div>;
     })}
     <div className="form-group">
      <label htmlFor="register-experience">Experiencia con juegos de mesa (opcional)</label>
      <select id="register-experience" name="experience_level" value={form.experience_level}
       onChange={change} aria-describedby="register-experience-help">
       <option value="beginner">Estoy empezando o prefiero decidirlo después</option>
       <option value="intermediate">He jugado y conozco algunas mecánicas</option>
       <option value="advanced">Juego con frecuencia</option>
       <option value="expert">Tengo experiencia competitiva</option>
      </select>
      <small id="register-experience-help">Puedes cambiarla en tu perfil.</small>
     </div>
     <button className="btn btn-primary" disabled={busy}>{busy ? "Creando cuenta…" : "Crear cuenta y verificar correo"}</button>
    </form>
    <p className="account-entry-footer">¿Ya tienes cuenta? <Link to={`/login?next=${encodeURIComponent(safeNext(params.get("next")))}`}>Iniciar sesión</Link></p>
   </div>
  </section>
 );
}
