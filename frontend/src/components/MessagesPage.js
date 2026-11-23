import React, { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { LuArrowLeft, LuSend, LuMessageCircle } from "react-icons/lu";
import { getConversations, getConversation, sendMessage, markMessageRead, getPublicProfile } from "../services/api";
import { getToken, parseJwt } from "../services/auth";
import { uxRequest } from "../services/uxApi";
import "./MessagesPage.css";

export function mergeMessages(current, incoming) {
  const unique = new Map(current.map((message) => [message.id, message]));
  incoming.forEach((message) => unique.set(message.id, message));
  return [...unique.values()].sort((a,b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
}
export default function MessagesPage() {
  const [params, setParams] = useSearchParams(); const active = params.get("user") || "";
  const [conversations, setConversations] = useState([]); const [messages,setMessages] = useState([]);
  const [person,setPerson] = useState(null); const [text,setText] = useState(""); const [query,setQuery] = useState("");
  const [people,setPeople] = useState([]); const [searching,setSearching] = useState(false);
  const [page,setPage] = useState(1); const [pages,setPages] = useState(1); const [loading,setLoading] = useState(false);
  const [error,setError] = useState(""); const [sending,setSending] = useState(false); const [newMessages,setNewMessages] = useState(false);
  const list = useRef(null); const activeRef = useRef(active); activeRef.current = active;
  const currentUser = parseJwt(getToken())?.user_id;
  const draftKey = `ludisist:message:${currentUser}:${active}`;
  const loadConversations = useCallback(() => getConversations().then((data) => setConversations(data.items || [])), []);
  const refresh = useCallback(async (id, initial = false) => {
    try {
      const data = await getConversation(id, 1); if (activeRef.current !== id) return;
      const nearBottom = !list.current || list.current.scrollHeight-list.current.scrollTop-list.current.clientHeight < 90;
      setMessages((current) => {if(!initial&&!nearBottom&&data.messages.some((m)=>!m.is_mine&&!current.some((old)=>old.id===m.id)))setNewMessages(true);return initial ? data.messages : mergeMessages(current,data.messages);}); setPages(data.pages); setError("");
      if (initial || nearBottom) requestAnimationFrame(() => { if (list.current) list.current.scrollTop=list.current.scrollHeight; });

      await Promise.all(data.messages.filter((m) => !m.is_mine && !m.is_read).map((m) => markMessageRead(m.id)));
    } catch (err) { if (activeRef.current === id) setError(err.message); }
  }, []);
  useEffect(() => { loadConversations().catch((err) => setError(err.message)); const timer=setInterval(() => { if(document.visibilityState === "visible") loadConversations().catch((err) => setError(err.message)); },5000); return () => clearInterval(timer); },[loadConversations]);
  useEffect(() => {
    setMessages([]); setPerson(null); setPage(1); setPages(1); setError(""); setNewMessages(false);
    setText(sessionStorage.getItem(draftKey) || "");
    if(!active) return undefined;
    let live=true; setLoading(true);
    refresh(active,true).finally(() => live && setLoading(false));
    getPublicProfile(active).then((data) => live && setPerson(data)).catch((err) => live && setError(err.message));
    const timer=setInterval(() => { if(document.visibilityState === "visible") refresh(active); },5000);
    return () => {live=false; clearInterval(timer);};
  },[active,draftKey,refresh]);
  useEffect(() => {
    if(!searching) return undefined;
    const abort=new AbortController(); const timer=setTimeout(() => {
      uxRequest(`/users/community?page=1&page_size=20&search=${encodeURIComponent(query)}`, {signal:abort.signal}).then((data) => setPeople(data.items.filter((p) => p.id !== currentUser))).catch((err) => {if(err.name!=="AbortError") setError(err.message);});
    },250); return () => {clearTimeout(timer); abort.abort();};
  },[query,searching,currentUser]);
  const older = async () => {
    if(loading) return; setLoading(true);
    const previousHeight=list.current?.scrollHeight || 0;
    try { const data=await getConversation(active,page+1); if(activeRef.current!==active) return; setMessages((current)=>mergeMessages(data.messages,current));setPage(data.page);requestAnimationFrame(()=>{if(list.current) list.current.scrollTop += list.current.scrollHeight-previousHeight;}); }
    catch(err){setError(err.message);} finally{setLoading(false);}
  };
  const send=async()=>{
    if(!text.trim() || sending) return; const recipient=active; const content=text.trim(); setSending(true);
    try {await sendMessage(recipient,content);sessionStorage.removeItem(draftKey);if(activeRef.current===recipient)setText("");await refresh(recipient);await loadConversations();}
    catch(err){setError(err.message);}finally{setSending(false);}
  };
  return <div className="messages-page">
    <aside className={`messages-sidebar ${active ? "mobile-hide" : ""}`}>
      <div className="messages-sidebar-header"><h1>Mensajes</h1><button onClick={()=>setSearching((value)=>!value)}>Nueva conversación</button></div>
      {searching && <label className="message-search">Buscar jugador<input value={query} onChange={(e)=>setQuery(e.target.value)} placeholder="Nombre o nickname" /></label>}
      <div className="messages-conv-list">
        {searching ? people.map((p)=><button className="messages-conv-row" key={p.id} onClick={()=>{setParams({user:p.id});setSearching(false);}}>{p.display_name}</button>) : conversations.map((c)=><button className={`messages-conv-row ${active===c.other_user.id?"active":""}`} key={c.other_user.id} onClick={()=>setParams({user:c.other_user.id})}><span className="messages-conv-info"><strong>{c.other_user.display_name}</strong><small>{c.last_message.content}</small></span>{c.unread_count>0 && <span className="messages-unread-count">{c.unread_count}</span>}</button>)}
        {!searching && !conversations.length && <p className="messages-empty">Aún no tienes conversaciones. Pulsa Nueva conversación para buscar un jugador.</p>}
      </div>
    </aside>
    <section className={`messages-main ${active?"mobile-show":""}`}>
      {!active ? <div className="messages-placeholder"><LuMessageCircle/><p>Elige una conversación o busca un jugador.</p></div> : <>
        <header className="messages-header"><button aria-label="Volver a conversaciones" onClick={()=>setParams({})}><LuArrowLeft/></button><strong>{person?.nickname || person?.username || "Conversación"}</strong></header>
        {error && <div role="alert" className="ui-status error">{error}<button onClick={()=>refresh(active)}>Reintentar</button></div>}
        <div ref={list} className="messages-list" aria-label="Historial de mensajes">
          {page<pages && <button onClick={older} disabled={loading}>Cargar mensajes anteriores</button>}
          {loading && <p role="status">Cargando mensajes…</p>}
          {messages.map((m)=><div key={m.id} className={`messages-bubble ${m.is_mine?"mine":"theirs"}`}><p>{m.content}</p><time>{new Date(m.created_at).toLocaleString("es-BO",{dateStyle:"short",timeStyle:"short"})}</time></div>)}
        </div>
        {newMessages && <button onClick={()=>{list.current.scrollTop=list.current.scrollHeight;setNewMessages(false);}}>Ir a mensajes recientes</button>}
        <footer className="messages-input-area"><textarea aria-label="Escribe un mensaje" maxLength={2000} value={text} onChange={(e)=>{setText(e.target.value);sessionStorage.setItem(draftKey,e.target.value);}} onKeyDown={(e)=>{if(e.key==="Enter"&&!e.shiftKey&&!e.nativeEvent.isComposing){e.preventDefault();send();}}} placeholder="Enter para enviar · Shift+Enter para otra línea"/><button aria-label="Enviar mensaje" disabled={!text.trim()||sending} onClick={send}><LuSend/>{sending?"Enviando…":"Enviar"}</button></footer>
      </>}
    </section>
    {!active && error && <div className="ui-status error" role="alert">{error}</div>}
  </div>;
}
