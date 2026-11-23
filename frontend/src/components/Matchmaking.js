import { confirmAction } from "../ui/confirmAction";
import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  LuCalendarDays as CalendarDays, LuCheck as Check, LuGraduationCap as GraduationCap,
  LuMapPin as MapPin, LuPlus as Plus, LuSearch as Search, LuSend as Send,
  LuShieldCheck as ShieldCheck, LuTrash2 as Trash2, LuTrophy as Trophy,
  LuUsers as Users, LuX as X,
} from "react-icons/lu";
import { toast } from "react-toastify";
import {
  cancelMatchTable, createMatchTable, finishMatchTable, getGames, getMatchTables,
  requestMatchTable, reviewMatchRequest,
} from "../services/api";
import UserMiniProfile from "./UserMiniProfile";
import "./Matchmaking.css";

const emptyForm = { game_id: "", title: "", scheduled_at: "", location: "", capacity: 4, notes: "", tutor_mode: "none" };

export default function Matchmaking() {
  const [busy,setBusy]=useState(false);const [error,setError]=useState("");const [loading,setLoading]=useState(true);
  const [tables, setTables] = useState([]);
  const [games, setGames] = useState([]);
  const [query, setQuery] = useState("");
  const [gameId, setGameId] = useState("");
  const [genre, setGenre] = useState("");
  const [tutorMode, setTutorMode] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [joinTable, setJoinTable] = useState(null);
  const [message, setMessage] = useState("");
  const [formErrors, setFormErrors] = useState({});
  const [miniProfileUserId, setMiniProfileUserId] = useState(null);

  const load = () => Promise.all([getMatchTables(), getGames()])
    .then(([tableData, gameData]) => { setTables(tableData); setGames(gameData);setError(""); })
    .catch((error) => setError(error.message)).finally(()=>setLoading(false));

  useEffect(() => { load(); }, []);

  useEffect(() => {
    const timer = window.setInterval(load, 15000);
    return () => window.clearInterval(timer);
  }, []);

  const genres = useMemo(() => [...new Set(tables.flatMap((table) => table.game_genres || []))]
    .sort((left, right) => left.localeCompare(right)), [tables]);

  const filtered = useMemo(() => tables.filter((table) => {
    const text = `${table.title} ${table.game_name} ${table.host_name} ${table.location} ${(table.game_genres || []).join(" ")}`.toLowerCase();
    return text.includes(query.toLowerCase())
      && (!gameId || table.game_id === gameId)
      && (!genre || (table.game_genres || []).includes(genre))
      && (!tutorMode || table.tutor_mode === tutorMode);
  }), [tables, query, gameId, genre, tutorMode]);

  const create = async (event) => {
    event.preventDefault();
    const errors = {};
    if (!form.game_id) errors.game_id = "Selecciona un juego.";
    if (form.title.trim().length < 3) errors.title = "Mínimo 3 caracteres.";
    if (!form.scheduled_at || new Date(form.scheduled_at) <= new Date()) errors.scheduled_at = "Elige una fecha futura.";
    if (Number(form.capacity) < 2 || Number(form.capacity) > 20) errors.capacity = "Entre 2 y 20.";
    if (form.location.trim().length < 3) errors.location = "Mínimo 3 caracteres.";
    setFormErrors(errors);
    if (Object.keys(errors).length || busy) return;
    setBusy(true);try {
      await createMatchTable({ ...form, scheduled_at: new Date(form.scheduled_at).toISOString(), capacity: Number(form.capacity) });
      setShowCreate(false);
      setForm(emptyForm);
      toast.success("Mesa publicada");
      load();
    } catch (error) { setError(error.message);toast.error(error.message); } finally {setBusy(false);}
  };

  const updateForm = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
    setFormErrors((current) => ({ ...current, [field]: "" }));
  };

  const join = async () => {
    if(busy)return;setBusy(true);try {
      await requestMatchTable(joinTable.id, message);
      setJoinTable(null);
      setMessage("");
      toast.success("Solicitud enviada");
      window.dispatchEvent(new CustomEvent("ludisist:notification"));
      load();
    } catch (error) { setError(error.message);toast.error(error.message); } finally {setBusy(false);}
  };

  const review = async (id, status) => {
    if(busy)return;setBusy(true);try {
      await reviewMatchRequest(id, status);
      toast.success(status === "approved" ? "Jugador aceptado" : "Solicitud rechazada");
      load();
    } catch (error) { setError(error.message);toast.error(error.message); } finally {setBusy(false);}
  };

  const cancel = async (table) => {
    if (!(await confirmAction(`¿Cancelar la mesa "${table.title}"?`))) return;
    try { await cancelMatchTable(table.id); toast.success("Mesa cancelada"); load(); }
    catch (error) { toast.error(error.message); }
  };

  const finish = async (table) => {
    if (!(await confirmAction(`¿Finalizar la mesa "${table.title}"?`))) return;
    try { await finishMatchTable(table.id); toast.success("Mesa finalizada"); load(); }
    catch (error) { toast.error(error.message); }
  };

  return <div className="matchmaking-page">
    <header className="matchmaking-heading">
      <div><span>Comunidad</span><h1>Encuentra una mesa</h1><p>Coordina una partida por juego, fecha y lugar.</p></div>
      <button className="btn-primary" onClick={() => { setFormErrors({}); setShowCreate(true); }}><Plus /> Publicar mesa</button>
    </header>

    <div className="matchmaking-filters">
      <label><Search /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar juego, anfitrión o lugar" /></label>
      <select value={gameId} onChange={(event) => setGameId(event.target.value)}><option value="">Todos los juegos</option>{games.map((game) => <option key={game.id} value={game.id}>{game.name}</option>)}</select>
      <select value={genre} onChange={(event) => setGenre(event.target.value)}><option value="">Todos los géneros</option>{genres.map((item) => <option key={item} value={item}>{item}</option>)}</select>
      <select value={tutorMode} onChange={(event) => setTutorMode(event.target.value)}><option value="">Cualquier modalidad</option><option value="none">Partida normal</option><option value="explain">Tutor explica</option><option value="play">Tutor juega y enseña</option></select>
    </div>

    {loading&&<p role="status">Cargando mesas…</p>}{error&&<p role="alert" className="ui-status error">{error}<button onClick={load}>Reintentar</button></p>}<div className="match-table-grid" aria-busy={busy}>
      {filtered.map((table) => <article className="match-table-card" key={table.id}>
        <div className="match-table-cover">{table.game_image_url ? <img src={table.game_image_url} alt="" /> : <Users />}<span>{table.status === "full" ? "Completa" : `${table.available_spots} cupos`}</span></div>
        <div className="match-table-body">
          <small>{table.game_name}</small><h2>{table.title}</h2>
          {Boolean(table.game_genres?.length) && <div className="match-genres">{table.game_genres.slice(0, 3).map((item) => <span key={item}>{item}</span>)}</div>}
          <div className="match-table-meta"><span><CalendarDays /> {formatDate(table.scheduled_at)}</span><span><MapPin /> {table.location}</span><span><Users /> {table.approved_count + 1}/{table.capacity} jugadores</span></div>
          <TutorStatus table={table} />
          <p>{table.notes || <>Mesa organizada por <Link className="match-player-link" to={`/jugadores/${table.host_id}`}>{table.host_name}</Link>.</>}</p>
          <ParticipantList table={table} showProfile={setMiniProfileUserId} />
          {table.is_owner ? <OwnerActions table={table} review={review} cancel={cancel} finish={finish} showProfile={setMiniProfileUserId} /> : <button className="match-join" disabled={Boolean(table.my_request) || !table.can_request} onClick={() => setJoinTable(table)}><Send /> {requestLabel(table)}</button>}
        </div>
      </article>)}
      {!loading&&!error&&!filtered.length && <div className="matchmaking-empty"><Users /><h2>No hay mesas que coincidan</h2><p>Publica la primera para ese juego o cambia los filtros.</p></div>}
    </div>

    {showCreate && <div className="match-modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setShowCreate(false)}>
      <form className="match-modal" onSubmit={create} noValidate>
        <header><div><small>Nueva convocatoria</small><h2>Publicar mesa</h2></div><button aria-label="Cerrar ventana" type="button" onClick={() => setShowCreate(false)}><X /></button></header>
        <div className="match-form">
          <label>Juego<select className={formErrors.game_id ? "field-invalid" : ""} required value={form.game_id} onChange={(event) => updateForm("game_id", event.target.value)}><option value="">Seleccionar juego</option>{games.map((game) => <option key={game.id} value={game.id}>{game.name}</option>)}</select>{formErrors.game_id && <small className="field-error">{formErrors.game_id}</small>}</label>
          <label>Título<input className={formErrors.title ? "field-invalid" : ""} required minLength="3" maxLength="150" value={form.title} onChange={(event) => updateForm("title", event.target.value)} placeholder="Ej. Noche de estrategia" />{formErrors.title && <small className="field-error">{formErrors.title}</small>}</label>
          <label>Fecha y hora<input className={formErrors.scheduled_at ? "field-invalid" : ""} required type="datetime-local" value={form.scheduled_at} onChange={(event) => updateForm("scheduled_at", event.target.value)} />{formErrors.scheduled_at && <small className="field-error">{formErrors.scheduled_at}</small>}</label>
          <label>Cupos totales<input className={formErrors.capacity ? "field-invalid" : ""} required type="number" min="2" max="20" value={form.capacity} onChange={(event) => updateForm("capacity", event.target.value)} />{formErrors.capacity && <small className="field-error">{formErrors.capacity}</small>}</label>
          <label className="wide">Lugar<input className={formErrors.location ? "field-invalid" : ""} required minLength="3" maxLength="180" value={form.location} onChange={(event) => updateForm("location", event.target.value)} placeholder="Café, tienda o dirección acordada" />{formErrors.location && <small className="field-error">{formErrors.location}</small>}</label>
          <label className="wide">Modalidad<select value={form.tutor_mode} onChange={(event) => setForm({ ...form, tutor_mode: event.target.value })}><option value="none">Partida normal</option><option value="explain">Busco tutor para explicar</option><option value="play">Busco tutor que juegue y enseñe</option></select></label>
          <label className="wide">Notas<textarea maxLength="1500" value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} placeholder="Nivel de experiencia, qué llevar o detalles de la mesa" /></label>
        </div>
        <footer><button type="button" onClick={() => setShowCreate(false)}>Cancelar</button><button className="primary"><Plus /> Publicar</button></footer>
      </form>
    </div>}

    {joinTable && <div className="match-modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setJoinTable(null)}>
      <div className="match-modal join-modal"><header><div><small>{joinTable.request_kind === "tutor_explain" ? "Solicitud como tutor" : "Solicitud para unirse"}</small><h2>{joinTable.title}</h2></div><button onClick={() => setJoinTable(null)}><X /></button></header><div className="join-copy"><p>{joinHelp(joinTable)}</p><textarea maxLength="300" value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Preséntate brevemente o comenta tu experiencia (opcional)" /></div><footer><button onClick={() => setJoinTable(null)}>Cancelar</button><button className="primary" disabled={busy} onClick={join}><Send /> Enviar solicitud</button></footer></div>
    </div>}
    {miniProfileUserId && <UserMiniProfile userId={miniProfileUserId} onClose={() => setMiniProfileUserId(null)} />}
  </div>;
}

function OwnerActions({ table, review, cancel, finish, showProfile }) {
  const pending = table.requests.filter((request) => request.status === "pending");
  return <div className="match-owner">
    {pending.map((request) => <div key={request.id}><span><strong><button className="match-player-link" onClick={() => showProfile(request.user_id)}>{request.user_name}</button>{request.is_tutor && <ShieldCheck />}</strong><small>{participationLabel(request.participation_type)} · {request.message || "Sin mensaje"}</small></span><button aria-label="Aprobar solicitud" className="approve" onClick={() => review(request.id, "approved")}><Check /></button><button aria-label="Rechazar solicitud" className="reject" onClick={() => review(request.id, "rejected")}><X /></button></div>)}
    {!pending.length && <small>Sin solicitudes pendientes</small>}
    <div className="match-owner-actions">
      <button className="match-finish" onClick={() => finish(table)}><Trophy /> Finalizar mesa</button>
      <button className="match-cancel" onClick={() => cancel(table)}><Trash2 /> Cancelar mesa</button>
    </div>
  </div>;
}

function requestLabel(table) {
  if (table.my_request === "pending") return "Solicitud pendiente";
  if (table.my_request === "approved") return table.my_participation_type === "tutor_explain" ? "Confirmado para explicar" : "Cupo confirmado";
  if (table.my_request === "rejected") return "Solicitud rechazada";
  if (!table.can_request) return table.status === "full" ? "Mesa completa" : "Cupo reservado para tutor";
  if (table.request_kind === "tutor_explain") return "Solicitar explicar";
  if (table.request_kind === "tutor_play") return "Solicitar cupo como tutor";
  return "Solicitar unirme";
}

function TutorStatus({ table }) {
  let text = "";
  if (table.tutor_will_play) text = "Un tutor participará como jugador";
  else if (table.tutor_will_explain) text = "Tutor confirmado para explicar (no ocupa cupo)";
  else if (table.tutor_mode === "explain") text = "Se busca tutor para explicar";
  else if (table.tutor_mode === "play") text = "Se busca tutor que juegue y enseñe";
  return text ? <div className="match-tutor"><GraduationCap /> {text}</div> : null;
}

function ParticipantList({ table, showProfile }) {
  if (!table.participants?.length) return null;
  return <div className="match-participants">
    <strong><Users /> Participantes confirmados</strong>
    <div>{table.participants.map((participant) => <button key={participant.user_id} className="match-participant-btn" onClick={() => showProfile(participant.user_id)}>
      {participant.user_name}
      {participant.is_host && <small>Anfitrión</small>}
      {participant.is_tutor && <small className="tutor"><ShieldCheck /> Tutor</small>}
    </button>)}</div>
    {table.tutor_explainers?.map((tutor) => <button className="match-explainer" key={tutor.user_id} onClick={() => showProfile(tutor.user_id)}><GraduationCap /> {tutor.user_name} explicará el juego</button>)}
  </div>;
}

function participationLabel(type) {
  if (type === "tutor_explain") return "Tutor: solo explicará";
  if (type === "tutor_play") return "Tutor: jugará y enseñará";
  return "Solicita jugar";
}

function joinHelp(table) {
  if (table.request_kind === "tutor_explain") return "Solicitarás explicar el juego sin ocupar un cupo de jugador.";
  if (table.request_kind === "tutor_play") return "Solicitarás el cupo reservado para jugar y enseñar como tutor.";
  return "El anfitrión revisará tu solicitud antes de confirmar el cupo.";
}

function formatDate(value) {
  return new Intl.DateTimeFormat("es-BO", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}
