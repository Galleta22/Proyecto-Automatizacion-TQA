import React, { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { getToken, parseJwt } from "../services/auth";
import { uxRequest } from "../services/uxApi";
import MarkdownRenderer from "./MarkdownRenderer";
import "./AIChat.css";

export default function AIChat() {
  const userId = parseJwt(getToken())?.user_id;
  const key = `ludisist:ai:${userId}`;
  const [messages,setMessages] = useState(() => { try { return JSON.parse(sessionStorage.getItem(key)) || []; } catch {return [];} });
  const [input,setInput] = useState(""); const [loading,setLoading] = useState(false); const [available,setAvailable] = useState(null);
  const [error,setError] = useState(""); const [elapsed,setElapsed] = useState(0); const [lastQuestion,setLastQuestion] = useState("");
  const request = useRef(null); const messagesBox = useRef(null);
  const check = () => {setAvailable(null);return uxRequest("/ai/provider").then((data)=>setAvailable(data.healthy)).catch(()=>setAvailable(false));};
  useEffect(()=>{check();return ()=>request.current?.abort();},[]);
  useEffect(()=>{sessionStorage.setItem(key,JSON.stringify(messages));if(messagesBox.current)messagesBox.current.scrollTop=messagesBox.current.scrollHeight;},[messages,key]);
  useEffect(()=>{if(!loading)return undefined;setElapsed(0);const timer=setInterval(()=>setElapsed((value)=>value+1),1000);return()=>clearInterval(timer);},[loading]);
  const send=async(question=input)=>{
    const text=question.trim();if(!text||loading||!available)return;
    setMessages((items)=>[...items,{role:"user",text}]);setLastQuestion(text);setInput("");setError("");setLoading(true);
    const controller=new AbortController();request.current=controller;
    try {const data=await uxRequest("/ai/query",{method:"POST",body:JSON.stringify({query:text}),signal:controller.signal});setMessages((items)=>[...items,{role:"ai",text:data.response}]);}
    catch(err){setError(err.name==="AbortError"?"Espera cancelada. El servicio local puede terminar de procesar la consulta en segundo plano.":err.message);}
    finally{if(request.current===controller){setLoading(false);request.current=null;}}
  };
  return (
    <section className="ai-chat-container" aria-labelledby="assistant-heading">
      <header className="chat-header">
        <div>
          <h1 id="assistant-heading">Asistente de juegos</h1>
          <p>Pregunta cómo jugar o cómo elegir un juego.</p>
        </div>
        <Link className="btn btn-secondary" to="/reglas?section=manuals">Consultar manuales</Link>
      </header>

      {available !== true && (
        <div className="chat-notice">
          <p role="status">{available === null ? "Comprobando disponibilidad…" : "El asistente no está disponible por el momento."}</p>
          {available === false && <button type="button" className="btn btn-secondary" onClick={check}>Comprobar de nuevo</button>}
        </div>
      )}

      <div className="chat-messages" ref={messagesBox} role="log" aria-label="Conversación con el asistente" tabIndex={0}>
        {!messages.length && (
          <div className="chat-starters">
            <p>Elige una pregunta para empezar</p>
            <div className="chat-actions">
              {["¿Cómo aprender un juego nuevo?", "¿Qué juego elegir para cuatro personas?"].map((question) => (
                <button key={question} type="button" className="btn btn-secondary" onClick={() => setInput(question)}>{question}</button>
              ))}
            </div>
          </div>
        )}
        {messages.map((message, index) => (
          <article className={`message-bubble ${message.role === "ai" ? "ai-bubble" : "user-bubble"}`} key={index}>
            <small>{message.role === "ai" ? "Asistente" : "Tú"}</small>
            {message.role === "ai" ? <MarkdownRenderer content={message.text} /> : <p>{message.text}</p>}
          </article>
        ))}
        {loading && (
          <div className="chat-notice">
            <p role="status">Preparando respuesta · {elapsed} s. En este equipo puede tardar varios minutos.</p>
            <button type="button" className="btn btn-secondary" onClick={() => request.current?.abort()}>Cancelar espera</button>
          </div>
        )}
        {error && (
          <div className="chat-notice chat-notice-error">
            <p role="alert">{error}</p>
            <div className="chat-actions">
              <button type="button" className="btn btn-secondary" disabled={loading || !available} onClick={() => send(lastQuestion)}>Reintentar consulta</button>
              <button type="button" className="btn btn-secondary" onClick={() => setInput(lastQuestion)}>Recuperar pregunta</button>
            </div>
          </div>
        )}
      </div>

      <form className="chat-input-bar" onSubmit={(event) => { event.preventDefault(); send(); }}>
        <p className="chat-help" id="assistant-help">Contrasta las respuestas con el manual de la edición que estás jugando.</p>
        <div className="chat-composer">
          <textarea aria-label="Pregunta sobre juegos de mesa" aria-describedby="assistant-help" value={input} onChange={(event) => setInput(event.target.value)} maxLength={4000} placeholder="Escribe tu pregunta…" />
          <button className="btn btn-primary chat-send-btn" disabled={loading || !input.trim() || !available}>Enviar</button>
        </div>
      </form>
    </section>
  );
}
