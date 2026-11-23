import { confirmAction } from "../ui/confirmAction";
import React, { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  LuCamera as Camera, LuCheck as Check, LuChevronDown as ChevronDown, LuDice5 as Dice5,
  LuCirclePlus as Plus, LuGamepad2 as Gamepad2, LuGripVertical as GripVertical,
  LuEye as Eye, LuGlobe as Globe, LuLockKeyhole as Lock,
  LuMinus as Minus, LuPause as Pause, LuPencil as Pencil, LuPlay as Play,
  LuLink as LinkIcon, LuRotateCcw as RotateCcw, LuSave as Save, LuSkipForward as SkipForward, LuTimer as Timer,
  LuHash as Hash, LuMedal as Medal, LuMonitor as Monitor,
  LuTrash2 as Trash2, LuTrophy as Trophy, LuUndo2 as Undo2, LuUsers as Users, LuX as X,
} from "react-icons/lu";
import { toast } from "react-toastify";
import {
  completeGameSession, createGameSession, deleteGameSession, getCommunityUsers,
  getGames, getMySessions, getPublicSessions, getSessionById,
  followSession, unfollowSession,
  updateGameSession, uploadSessionSnapshot,
} from "../services/api";
import { getToken, parseJwt } from "../services/auth";
import ImmersiveRoom from "./ImmersiveRoom";
import HostImmersive from "./HostImmersive";
import "./GameSessions.css";

const COLORS = ["#3c8dbc", "#dd4b39", "#00a65a", "#f39c12", "#8b5cf6", "#ec4899", "#111827", "#f8fafc"];
const playerId = () => window.crypto?.randomUUID?.() || `player-${Date.now()}-${Math.random()}`;
const emptyPlayer = (color = COLORS[0]) => ({ id: playerId(), user_id: null, name: "", score: 0, color, team_id: null });
const emptyTeam = (index = 0) => ({ id: playerId(), name: `Equipo ${index + 1}`, score: 0, color: COLORS[index % COLORS.length] });
const emptyForm = () => ({
  game_id: "",
  players: [emptyPlayer(COLORS[0]), emptyPlayer(COLORS[1])],
  notes: "",
  snapshots: [],
  turn_order: [],
  turn_order_enabled: false,
  round_number: 1,
  active_player_id: null,
  elapsed_seconds: 0,
  turn_times: {},
  score_history: [],
  custom_counters: [],
  dice_history: [],
  scoring_mode: "individual",
  teams: [],
  visibility: "private",
});

export default function GameSessions() {
  const [sessions, setSessions] = useState([]);
  const [games, setGames] = useState([]);
  const [communityUsers, setCommunityUsers] = useState([]);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [draggedPlayerId, setDraggedPlayerId] = useState(null);
  const [timerRunning, setTimerRunning] = useState(false);
  const [scoreStep, setScoreStep] = useState(1);
  const [summarySession, setSummarySession] = useState(null);
  const [autosaveStatus, setAutosaveStatus] = useState("");
  const [sessionErrors, setSessionErrors] = useState({});
  const [activeTab, setActiveTab] = useState("mysessions");
  const [publicSessions, setPublicSessions] = useState([]);
  const [liveViewSession, setLiveViewSession] = useState(null);
  const [immersiveMode, setImmersiveMode] = useState(false);
  const [hostImmersiveMode, setHostImmersiveMode] = useState(false);

  const formRef = useRef(form);
  const autosaveBusy = useRef(false);

  useEffect(() => {
    getPublicSessions().then(setPublicSessions).catch((error) => window.dispatchEvent(new CustomEvent("ludisist:request-error", {detail:error.message})));
  }, []);

  useEffect(() => {
    if (activeTab !== "live") return undefined;
    const interval = window.setInterval(() => {
      getPublicSessions().then(setPublicSessions).catch((error) => window.dispatchEvent(new CustomEvent("ludisist:request-error", {detail:error.message})));
    }, 15000);
    return () => window.clearInterval(interval);
  }, [activeTab]);

  useEffect(() => {
    if (!liveViewSession) return undefined;
    const load = () => { getSessionById(liveViewSession.id).then(setLiveViewSession).catch(() => setLiveViewSession(null)); };
    load();
    const interval = window.setInterval(load, 10000);
    return () => window.clearInterval(interval);
  }, [liveViewSession?.id]);

  useEffect(() => {
    Promise.all([getMySessions(), getGames(), getCommunityUsers()])
      .then(([sessionData, gameData, userData]) => { setSessions(sessionData); setGames(gameData); setCommunityUsers(userData); })
      .catch((error) => toast.error(error.message));
  }, []);

  useEffect(() => {
    if (!timerRunning || !editing) return undefined;
    const timer = window.setInterval(() => {
      setForm((current) => ({
        ...current,
        elapsed_seconds: current.elapsed_seconds + 1,
        turn_times: current.turn_order_enabled && current.active_player_id
          ? { ...current.turn_times, [current.active_player_id]: (current.turn_times[current.active_player_id] || 0) + 1 }
          : current.turn_times,
      }));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [timerRunning, editing]);

  useEffect(() => { formRef.current = form; }, [form]);

  useEffect(() => {
    if (!editing || editing === "new") return undefined;
    const autosave = window.setInterval(async () => {
      if (autosaveBusy.current) return;
      autosaveBusy.current = true;
      setAutosaveStatus("Guardando...");
      try {
        const sent = JSON.stringify(sessionPayload(formRef.current));
        const saved = await updateGameSession(editing, JSON.parse(sent));
        setSessions((current) => current.map((session) => session.id === saved.id ? saved : session));
        if (sent === JSON.stringify(sessionPayload(formRef.current))) {
          setAutosaveStatus("Guardado automáticamente");
          requestAnimationFrame(() => document.dispatchEvent(new Event("ludisist:form-saved")));
        } else setAutosaveStatus("Cambios pendientes");
      } catch {
        setAutosaveStatus("Error al guardar");
      } finally {
        autosaveBusy.current = false;
      }
    }, 5000);
    return () => window.clearInterval(autosave);
  }, [editing]);

  const localDraftKey = `ludisist:session-draft:${parseJwt(getToken())?.user_id}`;
  useEffect(() => { if(editing === "new") sessionStorage.setItem(localDraftKey,JSON.stringify(form)); }, [editing,form,localDraftKey]);
  const openNew = async () => {
    let recovered = null;
    try {const saved = JSON.parse(sessionStorage.getItem(localDraftKey)); if(saved && (saved.game_id || saved.notes) && await confirmAction("Hay una partida nueva sin guardar. ¿Quieres recuperar su borrador?", {confirmLabel:"Recuperar borrador"})) recovered=saved;} catch {}
    setEditing("new");
    setForm(recovered || emptyForm());
    setDetailsOpen(false);
    setTimerRunning(false);
    setScoreStep(1);
    setAutosaveStatus("Primer guardado manual");
    setSessionErrors({});
  };

  const openSession = (session) => {
    const players = session.players.map((player, index) => ({
      ...player,
      id: player.id || playerId(),
      user_id: player.user_id || null,
      color: player.color || COLORS[index % COLORS.length],
      team_id: player.team_id || null,
    }));
    setEditing(session.id);
    setForm({
      game_id: session.game_id,
      players,
      notes: session.notes,
      snapshots: [...session.snapshots],
      turn_order: session.turn_order?.length ? session.turn_order : players.map((player) => player.id),
      turn_order_enabled: Boolean(session.turn_order_enabled),
      round_number: session.round_number || 1,
      active_player_id: session.active_player_id || null,
      elapsed_seconds: session.elapsed_seconds || 0,
      turn_times: session.turn_times || {},
      score_history: session.score_history || [],
      custom_counters: session.custom_counters || [],
      dice_history: session.dice_history || [],
      scoring_mode: session.scoring_mode || "individual",
      teams: session.teams || [],
      visibility: session.visibility || "private",
    });
    setDetailsOpen(Boolean(session.notes || session.snapshots.length));
    setTimerRunning(false);
    setScoreStep(1);
    setAutosaveStatus("Guardado");
    setSessionErrors({});
  };

  const updatePlayer = (index, field, value) => {
    const changedPlayer = form.players[index];
    if (field === "name" && changedPlayer) setSessionErrors((current) => ({ ...current, [`player_${changedPlayer.id}`]: "" }));
    setForm((current) => ({
      ...current,
      players: current.players.map((player, position) => position === index
        ? { ...player, [field]: field === "score" ? Number(value) : value }
        : player),
    }));
  };

  const linkPlayer = (index, userId) => {
    const linkedUser = communityUsers.find((user) => user.id === userId);
    setForm((current) => ({
      ...current,
      players: current.players.map((player, position) => position === index
        ? { ...player, user_id: linkedUser?.id || null, name: linkedUser?.display_name || player.name }
        : player),
    }));
  };

  const setScoringMode = (mode) => {
    setForm((current) => {
      if (mode === "individual") {
        return { ...current, scoring_mode: mode, players: current.players.map((player) => ({ ...player, team_id: null })) };
      }
      const teams = current.teams.length >= 2 ? current.teams : [emptyTeam(0), emptyTeam(1)];
      return {
        ...current,
        scoring_mode: mode,
        teams,
        players: current.players.map((player, index) => ({ ...player, team_id: player.team_id || teams[index % teams.length].id })),
      };
    });
  };

  const addTeam = () => {
    setForm((current) => current.teams.length >= 10 ? current : ({
      ...current,
      teams: [...current.teams, emptyTeam(current.teams.length)],
    }));
  };

  const updateTeam = (id, field, value) => {
    setSessionErrors((current) => ({ ...current, [`team_${id}`]: "" }));
    setForm((current) => ({
      ...current,
      teams: current.teams.map((team) => team.id === id
        ? { ...team, [field]: field === "score" ? Number(value) : value }
        : team),
    }));
  };

  const removeTeam = (id) => {
    setForm((current) => {
      if (current.teams.length <= 2) return current;
      const teams = current.teams.filter((team) => team.id !== id);
      return {
        ...current,
        teams,
        players: current.players.map((player) => player.team_id === id ? { ...player, team_id: teams[0].id } : player),
      };
    });
  };

  const adjustTeamScore = (id, delta) => {
    setForm((current) => {
      const team = current.teams.find((item) => item.id === id);
      if (!team) return current;
      const nextScore = Number(team.score) + delta;
      return {
        ...current,
        teams: current.teams.map((item) => item.id === id ? { ...item, score: nextScore } : item),
        score_history: [...current.score_history, {
          id: playerId(),
          target_type: "team",
          team_id: team.id,
          team_name: team.name,
          delta,
          score: nextScore,
          round: current.round_number,
          timestamp: new Date().toISOString(),
        }].slice(-100),
      };
    });
  };

  const addPlayer = () => {
    const player = {
      ...emptyPlayer(COLORS[form.players.length % COLORS.length]),
      team_id: form.scoring_mode === "teams" && form.teams.length ? form.teams[form.players.length % form.teams.length].id : null,
    };
    setForm((current) => ({
      ...current,
      players: [...current.players, player],
      turn_order: [...current.turn_order, player.id],
    }));
  };

  const removePlayer = (id) => {
    setForm((current) => ({
      ...current,
      players: current.players.filter((player) => player.id !== id),
      turn_order: current.turn_order.filter((playerIdValue) => playerIdValue !== id),
      turn_times: Object.fromEntries(Object.entries(current.turn_times).filter(([playerIdValue]) => playerIdValue !== id)),
      active_player_id: current.active_player_id === id
        ? current.turn_order.find((playerIdValue) => playerIdValue !== id) || null
        : current.active_player_id,
    }));
  };

  const adjustScore = (index, delta) => {
    setForm((current) => {
      const player = current.players[index];
      if (!player) return current;
      const nextScore = Number(player.score) + delta;
      return {
        ...current,
        players: current.players.map((item, position) => position === index ? { ...item, score: nextScore } : item),
        score_history: [...current.score_history, {
          id: playerId(),
          player_id: player.id,
          player_name: player.name || `Jugador ${index + 1}`,
          delta,
          score: nextScore,
          round: current.round_number,
          timestamp: new Date().toISOString(),
        }].slice(-100),
      };
    });
  };

  const undoScore = () => {
    setForm((current) => {
      const last = current.score_history[current.score_history.length - 1];
      if (!last) return current;
      if (last.target_type === "team") {
        return {
          ...current,
          teams: current.teams.map((team) => team.id === last.team_id
            ? { ...team, score: Number(team.score) - Number(last.delta) }
            : team),
          score_history: current.score_history.slice(0, -1),
        };
      }
      return {
        ...current,
        players: current.players.map((player) => player.id === last.player_id
          ? { ...player, score: Number(player.score) - Number(last.delta) }
          : player),
        score_history: current.score_history.slice(0, -1),
      };
    });
  };

  const nextTurn = () => {
    setForm((current) => {
      const order = current.turn_order.filter((id) => current.players.some((player) => player.id === id));
      if (!order.length) return current;
      const currentIndex = order.indexOf(current.active_player_id);
      const nextIndex = currentIndex < 0 ? 0 : (currentIndex + 1) % order.length;
      return {
        ...current,
        active_player_id: order[nextIndex],
        round_number: currentIndex === order.length - 1 ? current.round_number + 1 : current.round_number,
      };
    });
  };

  const resetActiveTurnTime = () => {
    setForm((current) => current.active_player_id ? ({
      ...current,
      turn_times: { ...current.turn_times, [current.active_player_id]: 0 },
    }) : current);
  };

  const addCounter = () => {
    setForm((current) => ({
      ...current,
      custom_counters: [...current.custom_counters, {
        id: playerId(),
        name: `Contador ${current.custom_counters.length + 1}`,
        value: 0,
        step: 1,
        color: COLORS[current.custom_counters.length % COLORS.length],
      }],
    }));
  };

  const updateCounter = (id, field, value) => {
    setSessionErrors((current) => ({ ...current, [`counter_${id}`]: "" }));
    setForm((current) => ({
      ...current,
      custom_counters: current.custom_counters.map((counter) => counter.id === id
        ? { ...counter, [field]: ["value", "step"].includes(field) ? Number(value) : value }
        : counter),
    }));
  };

  const adjustCounter = (id, direction) => {
    setForm((current) => ({
      ...current,
      custom_counters: current.custom_counters.map((counter) => counter.id === id
        ? { ...counter, value: Number(counter.value) + Number(counter.step) * direction }
        : counter),
    }));
  };

  const rollDice = (sides) => {
    const random = new Uint32Array(1);
    window.crypto.getRandomValues(random);
    const result = (random[0] % sides) + 1;
    setForm((current) => ({
      ...current,
      dice_history: [...current.dice_history, { id: playerId(), sides, result, timestamp: new Date().toISOString() }].slice(-50),
    }));
  };

  const toggleTurnOrder = (enabled) => {
    setForm((current) => ({
      ...current,
      turn_order_enabled: enabled,
      turn_order: enabled
        ? [
            ...current.turn_order.filter((id) => current.players.some((player) => player.id === id)),
            ...current.players.filter((player) => !current.turn_order.includes(player.id)).map((player) => player.id),
          ]
        : current.turn_order,
      active_player_id: enabled
        ? current.active_player_id || current.turn_order[0] || current.players[0]?.id || null
        : null,
    }));
  };

  const dropTurnPlayer = (targetId) => {
    if (!draggedPlayerId || draggedPlayerId === targetId) return;
    setForm((current) => {
      const order = [...current.turn_order];
      const from = order.indexOf(draggedPlayerId);
      const to = order.indexOf(targetId);
      order.splice(from, 1);
      order.splice(to, 0, draggedPlayerId);
      return { ...current, turn_order: order };
    });
    setDraggedPlayerId(null);
  };

  const save = async () => {
    const errors = {};
    if (!form.game_id) errors.game_id = "Selecciona un juego.";
    form.players.forEach((player) => { if (!player.name.trim()) errors[`player_${player.id}`] = "Escribe el nombre del jugador."; });
    if (form.scoring_mode === "teams") {
      if (form.teams.length < 2) errors.teams = "Agrega al menos dos equipos.";
      form.teams.forEach((team) => { if (team.name.trim().length < 2) errors[`team_${team.id}`] = "Mínimo 2 caracteres."; });
      if (form.players.some((player) => !player.team_id)) errors.teams = "Asigna todos los jugadores a un equipo.";
    }
    form.custom_counters.forEach((counter) => { if (!counter.name.trim() || Number(counter.step) <= 0) errors[`counter_${counter.id}`] = "Revisa nombre y salto."; });
    setSessionErrors(errors);
    if (Object.keys(errors).length) return;
    setSaving(true);
    try {
      const payload = sessionPayload(form);
      const saved = editing === "new"
        ? await createGameSession(payload)
        : await updateGameSession(editing, payload);
      setSessions((current) => editing === "new"
        ? [saved, ...current]
        : current.map((session) => session.id === saved.id ? saved : session));
      setEditing(null);
      setTimerRunning(false);
      toast.success("Partida guardada");
    } catch (error) {
      toast.error(error.message);
    } finally {
      setSaving(false);
    }
  };

  const publishSession = async () => {
    const errors = {};
    if (!form.game_id) errors.game_id = "Selecciona un juego.";
    form.players.forEach((player) => { if (!player.name.trim()) errors[`player_${player.id}`] = "Escribe el nombre del jugador."; });
    if (form.scoring_mode === "teams") {
      if (form.teams.length < 2) errors.teams = "Agrega al menos dos equipos.";
      form.teams.forEach((team) => { if (team.name.trim().length < 2) errors[`team_${team.id}`] = "Mínimo 2 caracteres."; });
      if (form.players.some((player) => !player.team_id)) errors.teams = "Asigna todos los jugadores a un equipo.";
    }
    form.custom_counters.forEach((counter) => { if (!counter.name.trim() || Number(counter.step) <= 0) errors[`counter_${counter.id}`] = "Revisa nombre y salto."; });
    setSessionErrors(errors);
    if (Object.keys(errors).length) return;
    setSaving(true);
    try {
      const payload = sessionPayload({ ...form, visibility: "public" });
      const saved = editing === "new"
        ? await createGameSession(payload)
        : await updateGameSession(editing, payload);
      setSessions((current) => editing === "new"
        ? [saved, ...current]
        : current.map((session) => session.id === saved.id ? saved : session));
      setLiveViewSession((current) => current ? { ...current, visibility: "public" } : null);
      if (editing === "new") {
        setEditing(saved.id);
        setForm((current) => ({ ...current, visibility: "public" }));
      } else {
        setForm((current) => ({ ...current, visibility: "public" }));
      }
      toast.success("Partida publicada en vivo");
    } catch (error) {
      toast.error(error.message);
    } finally {
      setSaving(false);
    }
  };

  const unpublishSession = async () => {
    const errors = {};
    if (!form.game_id) errors.game_id = "Selecciona un juego.";
    form.players.forEach((player) => { if (!player.name.trim()) errors[`player_${player.id}`] = "Escribe el nombre del jugador."; });
    if (form.scoring_mode === "teams") {
      if (form.teams.length < 2) errors.teams = "Agrega al menos dos equipos.";
      form.teams.forEach((team) => { if (team.name.trim().length < 2) errors[`team_${team.id}`] = "Mínimo 2 caracteres."; });
      if (form.players.some((player) => !player.team_id)) errors.teams = "Asigna todos los jugadores a un equipo.";
    }
    form.custom_counters.forEach((counter) => { if (!counter.name.trim() || Number(counter.step) <= 0) errors[`counter_${counter.id}`] = "Revisa nombre y salto."; });
    setSessionErrors(errors);
    if (Object.keys(errors).length) return;
    setSaving(true);
    try {
      const payload = sessionPayload({ ...form, visibility: "private" });
      const saved = await updateGameSession(editing, payload);
      setSessions((current) => current.map((session) => session.id === saved.id ? saved : session));
      setLiveViewSession((current) => current ? { ...current, visibility: "private" } : null);
      setForm((current) => ({ ...current, visibility: "private" }));
      toast.success("Partida marcada como privada");
    } catch (error) {
      toast.error(error.message);
    } finally {
      setSaving(false);
    }
  };

  const addSnapshot = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const uploaded = await uploadSessionSnapshot(file);
      setForm((current) => ({ ...current, snapshots: [...current.snapshots, uploaded.url].slice(0, 12) }));
    } catch (error) {
      toast.error(error.message);
    }
  };

  const finish = async (session) => {
    if (!(await confirmAction(`¿Finalizar la partida de ${session.game_name}?`))) return;
    try {
      const completed = await completeGameSession(session.id);
      setSessions((current) => current.map((item) => item.id === completed.id ? completed : item));
      setSummarySession(completed);
      toast.success("Partida finalizada");
    } catch (error) {
      toast.error(error.message);
    }
  };

  const remove = async (session) => {
    if (!(await confirmAction("¿Eliminar esta partida y sus datos?"))) return;
    try {
      await deleteGameSession(session.id);
      setSessions((current) => current.filter((item) => item.id !== session.id));
    } catch (error) {
      toast.error(error.message);
    }
  };

  const enterHostImmersive = () => {
    if (!liveViewSession) return;
    if (editing !== liveViewSession.id) openSession(liveViewSession);
    setHostImmersiveMode(true);
  };

  const renderLiveContent = () => {
    const s = liveViewSession;
    return (
      <div className="live-content-inner">
        <section className="scoring-mode-selector">
          <div><small>Marcador</small><h3>{s.scoring_mode === "teams" ? "Por equipos" : "Individual"}</h3></div>
        </section>
        <section className="session-command-bar">
          <div className="session-round-control"><small>Ronda</small><strong>{s.round_number || 1}</strong></div>
          <div className="session-timer"><small>Tiempo de mesa</small><strong>{formatDuration(s.elapsed_seconds || 0)}</strong></div>
        </section>
        {s.scoring_mode === "teams" && <section className="teams-editor">
          <div className="scoreboard-heading"><div><small>Equipos</small><h3>Equipos y puntuación</h3></div></div>
          <div className="team-columns">{(s.teams || []).map((team) => (
            <article key={team.id} style={{ "--team-color": team.color, "--player-color": team.color }}>
              <div className="team-color-strip" />
              <h4 className="team-name-input" style={{ textAlign: "center", margin: "0.5rem 0" }}>{team.name}</h4>
              <span className="score-label">Puntuación</span>
              <div className="score-control"><strong style={{ fontSize: "1.4rem", padding: "0.5rem" }}>{team.score}</strong></div>
            </article>
          ))}</div>
        </section>}
        <section className="players-editor">
          <div className="scoreboard-heading"><div><small>Jugadores</small><h3>Jugadores y puntuación</h3></div></div>
          <div className="player-columns">{(s.players || []).map((player) => (
            <article className={`player-column ${s.active_player_id === player.id ? "active-turn" : ""}`} key={player.id} style={{ "--player-color": player.color }}>
              <div className="player-color-strip" />
              <h4 style={{ textAlign: "center", margin: "0.5rem 0", color: "#f8fafc" }}>{player.name}</h4>
              {s.scoring_mode !== "teams" && <><span className="score-label">Puntuación</span>
              <div className="score-control"><strong style={{ fontSize: "1.4rem", padding: "0.5rem" }}>{player.score}</strong></div></>}
              <div className="player-turn-time"><Timer /><span>Tiempo en turno</span><strong>{formatDuration((s.turn_times || {})[player.id] || 0)}</strong></div>
            </article>
          ))}</div>
        </section>
        {s.turn_order_enabled && <section className="turn-order-section">
          <label className="turn-order-toggle"><input type="checkbox" checked readOnly /><span /><strong>Orden de turnos</strong></label>
          <div className="turn-live-controls"><span>Turno: <strong>{(s.players || []).find((p) => p.id === s.active_player_id)?.name || "Sin iniciar"}</strong></span></div>
          <div className="turn-order-list">{(s.turn_order || []).map((id, index) => {
            const player = (s.players || []).find((item) => item.id === id);
            return player ? <div key={id} className={s.active_player_id === id ? "active" : ""}><span>{index + 1}</span><i style={{ background: player.color }} /><strong>{player.name}</strong></div> : null;
          })}</div>
        </section>}
        {(s.score_history || []).length > 0 && <section className="score-history">
          <div><small>Actividad reciente</small><strong>{s.score_history.length} movimientos</strong></div>
          <div>{(s.score_history || []).slice(-6).reverse().map((entry) => <span key={entry.id}><i className={entry.delta >= 0 ? "positive" : "negative"}>{entry.delta >= 0 ? `+${entry.delta}` : entry.delta}</i><strong>{entry.team_name || entry.player_name}</strong><small>Ronda {entry.round}</small></span>)}</div>
        </section>}
        {(s.notes || s.snapshots?.length > 0) && <section className="session-details open">
          <button className="session-details-toggle" onClick={() => {}}><span><Camera /> Notas y capturas</span></button>
          <div className="session-details-content">
            {s.notes && <label>Notas<div style={{ color: "#cbd5e1", whiteSpace: "pre-wrap", padding: "0.5rem", background: "rgba(0,0,0,0.2)", borderRadius: "8px" }}>{s.notes}</div></label>}
            {(s.snapshots || []).length > 0 && <section className="snapshot-editor"><div>{(s.snapshots || []).map((url, index) => <img key={url} src={url} alt={`Captura ${index + 1}`} style={{ width: 120, height: 80, objectFit: "cover", borderRadius: 6, margin: "0.25rem" }} />)}</div></section>}
          </div>
        </section>}
      </div>
    );
  };

  return (
    <div className="sessions-page">
      <header className="sessions-heading">
        <div><span>Tu mesa</span><h1>Partidas guardadas</h1><p>Lleva puntuaciones y conserva el estado de una partida física.</p></div>
        <button onClick={openNew}><Plus /> Nueva partida</button>
      </header>

      <div className="sessions-tabs">
        <button className={activeTab === "mysessions" ? "active" : ""} onClick={() => setActiveTab("mysessions")}>Mis partidas</button>
        <button className={activeTab === "live" ? "active" : ""} onClick={() => setActiveTab("live")}>Partidas en vivo {publicSessions.length > 0 && <span className="live-badge">{publicSessions.length}</span>}</button>
        {activeTab === "live" && (
          <button className="refresh-btn" onClick={() => { getPublicSessions().then(setPublicSessions); }} title="Actualizar partidas en vivo">
            <RotateCcw />
          </button>
        )}
      </div>

      {activeTab === "mysessions" ? (
      <div className="sessions-grid">
        {sessions.map((session) => (
          <article className="session-card" key={session.id}>
            <div className="session-cover">
              {session.game_image_url ? <img src={session.game_image_url} alt="" /> : <Gamepad2 />}
              <span className={session.is_completed ? "completed" : "active"}>{session.is_completed ? "Finalizada" : "En curso"}</span>
              {session.visibility === "public" && !session.is_completed && <span className="session-public-badge"><Globe /> Pública</span>}
            </div>
            <div className="session-card-body">
              <h2>{session.game_name}</h2>
              <small><Users /> {session.players.length} jugadores{session.scoring_mode === "teams" ? ` · ${session.teams.length} equipos` : ""} · Ronda {session.round_number || 1} · {formatDuration(session.elapsed_seconds || 0)}</small>
              <div className="session-score-preview">
                {session.scoring_mode === "teams"
                  ? session.teams.map((team) => <span key={team.id}><i style={{ background: team.color }} />{team.name}<strong>{team.score}</strong></span>)
                  : session.players.map((player) => <span key={player.id || player.name}><i style={{ background: player.color }} />{player.user_id ? <Link to={`/jugadores/${player.user_id}`}>{player.name}</Link> : player.name}<strong>{player.score}</strong></span>)}
              </div>
              <div className="session-card-actions">
                {!session.is_completed && <button onClick={() => openSession(session)} title="Editar"><Pencil /></button>}
                {!session.is_completed && session.visibility === "public" && <button onClick={async () => { try { const s = await getSessionById(session.id); setLiveViewSession(s); openSession(s); setHostImmersiveMode(true); } catch { toast.error("No se pudo abrir el modo inmersivo"); } }} title="Modo inmersivo"><Monitor /></button>}
                {!session.is_completed && <button onClick={() => finish(session)} title="Finalizar"><Check /></button>}
                {session.is_completed && <button onClick={() => setSummarySession(session)} title="Ver resumen"><Trophy /></button>}
                <button className="danger" onClick={() => remove(session)} title="Eliminar"><Trash2 /></button>
              </div>
            </div>
          </article>
        ))}
        {!sessions.length && <div className="sessions-empty"><Gamepad2 /><h2>No tienes partidas guardadas</h2><p>Inicia una para llevar puntuaciones y notas.</p></div>}
      </div>
      ) : (
      <div className="sessions-grid">
        {publicSessions.map((session) => {
          const isFollowing = session.viewer_role === "viewer";
          return (
          <article className="session-card live-card" key={session.id}>
            <div className="session-cover">
              {session.game_image_url ? <img src={session.game_image_url} alt="" /> : <Gamepad2 />}
              <span className="active">En vivo</span>
            </div>
            <div className="session-card-body">
              <h2>{session.game_name}</h2>
              <small><Users /> {session.players.length} jugadores · {session.owner_name} · Ronda {session.round_number || 1} · {formatDuration(session.elapsed_seconds || 0)}</small>
              <div className="session-score-preview">
                {session.scoring_mode === "teams"
                  ? session.teams.map((team) => <span key={team.id}><i style={{ background: team.color }} />{team.name}<strong>{team.score}</strong></span>)
                  : session.players.map((player) => <span key={player.id || player.name}><i style={{ background: player.color }} />{player.name}<strong>{player.score}</strong></span>)}
              </div>
              <div className="session-card-actions">
                <button onClick={() => setLiveViewSession(session)} title="Ver en vivo"><Eye /></button>
                {isFollowing
                  ? <button onClick={async () => { try { await unfollowSession(session.id); toast.success("Dejaste de seguir la partida"); window.dispatchEvent(new CustomEvent("ludisist:notification")); } catch (e) { toast.error(e.message); } }} title="Dejar de seguir"><X /></button>
                  : <button onClick={async () => { try { await followSession(session.id); toast.success("Siguiendo la partida"); window.dispatchEvent(new CustomEvent("ludisist:notification")); } catch (e) { toast.error(e.message); } }} title="Seguir"><Plus /></button>}
              </div>
            </div>
          </article>
          );
        })}
        {!publicSessions.length && <div className="sessions-empty"><Eye /><h2>No hay partidas públicas activas</h2><p>Las partidas públicas de otros usuarios aparecerán aquí en vivo.</p></div>}
      </div>
      )}

      {editing && (
        <div className="session-modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setEditing(null)}>
          <div className="session-modal scoreboard-modal">
            <header>
              <div>
                <small>{editing === "new" ? "Nueva partida" : "Partida en curso"}</small>
                <h2>Registro de partida</h2>
                <span className={`autosave-status ${autosaveStatus === "Error al guardar" ? "error" : ""}`}>{autosaveStatus}</span>
              </div>
              <div className="header-actions">
                <div className="hi-status-toggle">
                  {form.visibility === "public" ? (
                    <>
                      <span className="hi-status-badge live"><span className="hi-status-dot" /> En vivo</span>
                      {editing !== "new" && (
                        <button className="publish-btn unpublish" onClick={unpublishSession} title="Pasar a privado" disabled={saving}>
                          <Lock /> Privada
                        </button>
                      )}
                    </>
                  ) : (
                    <>
                      <span className="hi-status-badge private"><Lock /> Privada</span>
                      <button className="publish-btn" onClick={publishSession} title="Publicar esta partida en vivo" disabled={saving}>
                        <Globe /> Publicar
                      </button>
                    </>
                  )}
                </div>
                {editing !== "new" && (
                  <button onClick={async () => {
                    try {
                      const session = await getSessionById(editing);
                      setLiveViewSession(session);
                      setHostImmersiveMode(true);
                    } catch (e) {
                      toast.error("No se pudo abrir la vista inmersiva");
                    }
                  }} title="Modo inmersivo"><Monitor /></button>
                )}
                <button aria-label="Cerrar ventana" onClick={() => setEditing(null)}><X /></button>
              </div>
            </header>
            <div className="session-form">
              <label>Juego<select className={sessionErrors.game_id ? "field-invalid" : ""} disabled={editing !== "new"} value={form.game_id} onChange={(event) => { setForm({ ...form, game_id: event.target.value }); setSessionErrors((current) => ({ ...current, game_id: "" })); }}><option value="">Seleccionar juego</option>{games.map((game) => <option key={game.id} value={game.id}>{game.name}</option>)}</select>{sessionErrors.game_id && <small className="field-error">{sessionErrors.game_id}</small>}</label>

              <section className="scoring-mode-selector">
                <div><small>Tipo de marcador</small><h3>¿Cómo se juega esta partida?</h3></div>
                <div><button className={form.scoring_mode === "individual" ? "active" : ""} onClick={() => setScoringMode("individual")}>Individual</button><button className={form.scoring_mode === "teams" ? "active" : ""} onClick={() => setScoringMode("teams")}><Users /> Por equipos</button></div>
              </section>

              <section className="session-command-bar">
                <div className="session-round-control"><small>Ronda</small><button onClick={() => setForm({ ...form, round_number: Math.max(1, form.round_number - 1) })}><Minus /></button><strong>{form.round_number}</strong><button onClick={() => setForm({ ...form, round_number: form.round_number + 1 })}><Plus /></button></div>
                <div className="session-timer"><small>Tiempo de mesa</small><strong>{formatDuration(form.elapsed_seconds)}</strong><button onClick={() => setTimerRunning((value) => !value)}>{timerRunning ? <Pause /> : <Play />}</button><button onClick={() => { setTimerRunning(false); setForm({ ...form, elapsed_seconds: 0 }); }} title="Reiniciar cronómetro" aria-label="Reiniciar cronómetro"><RotateCcw aria-hidden="true" /></button></div>
                <div className="score-step"><small>Salto de puntos</small>{[1, 5, 10].map((step) => <button className={scoreStep === step ? "active" : ""} key={step} onClick={() => setScoreStep(step)}>{step}</button>)}</div>
                <button className="undo-score" disabled={!form.score_history.length} onClick={undoScore}><Undo2 /> Deshacer</button>
              </section>

              {form.scoring_mode === "teams" && <section className="teams-editor">
                <div className="scoreboard-heading"><div><small>Marcador principal</small><h3>Equipos y puntuación</h3></div><button disabled={form.teams.length >= 10} onClick={addTeam}><Plus /> Equipo</button></div>
                {sessionErrors.teams && <small className="field-error">{sessionErrors.teams}</small>}
                <div className="team-columns">
                  {form.teams.map((team) => <article key={team.id} style={{ "--team-color": team.color, "--player-color": team.color }}>
                    {form.teams.length > 2 && <button className="remove-team" onClick={() => removeTeam(team.id)} title="Quitar equipo"><Trash2 /></button>}
                    <div className="team-color-strip" />
                    <div className="color-picker">{COLORS.map((color) => <button key={color} className={team.color === color ? "selected" : ""} style={{ background: color }} onClick={() => updateTeam(team.id, "color", color)} aria-label={`Color ${color}`} />)}</div>
                    <input className={`team-name-input ${sessionErrors[`team_${team.id}`] ? "field-invalid" : ""}`} maxLength="40" value={team.name} onChange={(event) => updateTeam(team.id, "name", event.target.value)} />
                    {sessionErrors[`team_${team.id}`] && <small className="field-error">{sessionErrors[`team_${team.id}`]}</small>}
                    <span className="score-label">Puntuación del equipo</span>
                    <div className="score-control"><button onClick={() => adjustTeamScore(team.id, -scoreStep)}><Minus /></button><input type="number" value={team.score} onChange={(event) => updateTeam(team.id, "score", event.target.value)} /><button onClick={() => adjustTeamScore(team.id, scoreStep)}><Plus /></button></div>
                    <small className="team-member-count">{form.players.filter((player) => player.team_id === team.id).length} integrantes</small>
                  </article>)}
                </div>
              </section>}

              <section className="players-editor">
                <div className="scoreboard-heading"><div><small>{form.scoring_mode === "teams" ? "Integrantes" : "Marcador"}</small><h3>{form.scoring_mode === "teams" ? "Jugadores y equipos" : "Jugadores y puntuación"}</h3></div><button onClick={addPlayer}><Plus /> Jugador</button></div>
                <div className="player-columns">
                  {form.players.map((player, index) => (
                    <article className={`player-column ${form.active_player_id === player.id ? "active-turn" : ""}`} key={player.id} style={{ "--player-color": player.color }}>
                      {form.players.length > 1 && <button className="remove-player" onClick={() => removePlayer(player.id)} title="Quitar jugador"><Trash2 /></button>}
                      <div className="player-color-strip" />
                      <div className="color-picker">{COLORS.map((color) => <button key={color} className={player.color === color ? "selected" : ""} style={{ background: color }} onClick={() => updatePlayer(index, "color", color)} aria-label={`Color ${color}`} />)}</div>
                      <label className="player-account-link"><LinkIcon /> Cuenta<select value={player.user_id || ""} onChange={(event) => linkPlayer(index, event.target.value)}>
                        <option value="">Invitado sin cuenta</option>
                        {communityUsers.map((user) => <option key={user.id} value={user.id} disabled={form.players.some((item, position) => position !== index && item.user_id === user.id)}>{user.display_name} (@{user.username})</option>)}
                      </select></label>
                      <input className={`player-name-input ${sessionErrors[`player_${player.id}`] ? "field-invalid" : ""}`} disabled={Boolean(player.user_id)} value={player.name} onChange={(event) => updatePlayer(index, "name", event.target.value)} placeholder={`Jugador ${index + 1}`} />
                      {sessionErrors[`player_${player.id}`] && <small className="field-error">{sessionErrors[`player_${player.id}`]}</small>}
                      {form.scoring_mode === "teams" && <label className="player-team-select"><Users /> Equipo<select value={player.team_id || ""} onChange={(event) => updatePlayer(index, "team_id", event.target.value)}><option value="">Sin equipo</option>{form.teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}</select></label>}
                      {form.scoring_mode === "individual" && <><span className="score-label">Puntuación individual</span>
                      <div className="score-control">
                        <button onClick={() => adjustScore(index, -scoreStep)} aria-label={`Restar ${scoreStep} puntos`}><Minus /></button>
                        <input type="number" value={player.score} onChange={(event) => updatePlayer(index, "score", event.target.value)} aria-label={`Puntuación de ${player.name || `jugador ${index + 1}`}`} />
                        <button onClick={() => adjustScore(index, scoreStep)} aria-label={`Sumar ${scoreStep} puntos`}><Plus /></button>
                      </div></>}
                      <div className="player-turn-time"><Timer /><span>Tiempo en turno</span><strong>{formatDuration(form.turn_times[player.id] || 0)}</strong></div>
                    </article>
                  ))}
                </div>
              </section>

              <section className="session-tools-grid">
                <div className="counter-tool">
                  <div className="tool-heading"><span><Hash /><strong>Contadores personalizados</strong></span><button disabled={form.custom_counters.length >= 20} onClick={addCounter}><Plus /> Añadir</button></div>
                  <div className="counter-list">
                    {form.custom_counters.map((counter) => <article key={counter.id} style={{ "--counter-color": counter.color }}>
                      <input className={`counter-name ${sessionErrors[`counter_${counter.id}`] ? "field-invalid" : ""}`} maxLength="40" value={counter.name} onChange={(event) => updateCounter(counter.id, "name", event.target.value)} />
                      <div><button onClick={() => adjustCounter(counter.id, -1)}><Minus /></button><input type="number" value={counter.value} onChange={(event) => updateCounter(counter.id, "value", event.target.value)} /><button onClick={() => adjustCounter(counter.id, 1)}><Plus /></button></div>
                      <label>Salto <input type="number" min="0.01" max="1000000" step="any" value={counter.step} onChange={(event) => updateCounter(counter.id, "step", Math.max(Number(event.target.value), 0.01))} /></label>
                      <button className="counter-remove" onClick={() => setForm((current) => ({ ...current, custom_counters: current.custom_counters.filter((item) => item.id !== counter.id) }))}><Trash2 /></button>
                      {sessionErrors[`counter_${counter.id}`] && <small className="field-error">{sessionErrors[`counter_${counter.id}`]}</small>}
                    </article>)}
                    {!form.custom_counters.length && <p>Agrega contadores para recursos, vidas, monedas o cualquier valor de la partida.</p>}
                  </div>
                </div>
                <div className="dice-tool">
                  <div className="tool-heading"><span><Dice5 /><strong>Lanzador de dados</strong></span></div>
                  <div className="dice-buttons">{[4, 6, 8, 10, 12, 20].map((sides) => <button key={sides} onClick={() => rollDice(sides)}>d{sides}</button>)}</div>
                  {form.dice_history.length ? <><div className="dice-result"><small>Última tirada</small><strong>{form.dice_history.at(-1).result}</strong><span>d{form.dice_history.at(-1).sides}</span></div><div className="dice-history">{form.dice_history.slice(-8).reverse().map((roll) => <span key={roll.id}>d{roll.sides}<strong>{roll.result}</strong></span>)}</div></> : <p>Selecciona un dado para lanzar.</p>}
                </div>
              </section>

              <section className="turn-order-section">
                <label className="turn-order-toggle">
                  <input type="checkbox" checked={form.turn_order_enabled} onChange={(event) => toggleTurnOrder(event.target.checked)} />
                  <span />
                  <strong>Usar orden de turnos</strong>
                </label>
                {form.turn_order_enabled && (
                  <>
                  <div className="turn-live-controls">
                    <span>Turno: <strong>{form.players.find((player) => player.id === form.active_player_id)?.name || "Sin iniciar"}</strong> · {formatDuration(form.turn_times[form.active_player_id] || 0)}</span>
                    <div><button onClick={resetActiveTurnTime} title="Reiniciar tiempo del jugador activo"><RotateCcw /> Reiniciar</button><button onClick={nextTurn}><SkipForward /> Siguiente turno</button></div>
                  </div>
                  <div className="turn-order-list">
                    {form.turn_order.map((id, index) => {
                      const player = form.players.find((item) => item.id === id);
                      if (!player) return null;
                      return (
                        <div key={id} draggable onClick={() => setForm({ ...form, active_player_id: id })} onDragStart={() => setDraggedPlayerId(id)} onDragOver={(event) => event.preventDefault()} onDrop={() => dropTurnPlayer(id)} onDragEnd={() => setDraggedPlayerId(null)} className={`${draggedPlayerId === id ? "dragging" : ""} ${form.active_player_id === id ? "active" : ""}`}>
                          <GripVertical /><span>{index + 1}</span><i style={{ background: player.color }} /><strong>{player.name || `Jugador ${form.players.indexOf(player) + 1}`}</strong><time>{formatDuration(form.turn_times[id] || 0)}</time>
                        </div>
                      );
                    })}
                  </div>
                  </>
                )}
              </section>

              {form.score_history.length > 0 && <section className="score-history">
                <div><small>Actividad reciente</small><strong>{form.score_history.length} movimientos</strong></div>
                <div>{form.score_history.slice(-6).reverse().map((entry) => <span key={entry.id}><i className={entry.delta >= 0 ? "positive" : "negative"}>{entry.delta >= 0 ? `+${entry.delta}` : entry.delta}</i><strong>{entry.team_name || entry.player_name}</strong><small>Ronda {entry.round}</small></span>)}</div>
              </section>}

              <section className={`session-details ${detailsOpen ? "open" : ""}`}>
                <button className="session-details-toggle" onClick={() => setDetailsOpen((value) => !value)}>
                  <span><Camera /> Notas y capturas <small>Opcional</small></span><ChevronDown />
                </button>
                {detailsOpen && (
                  <div className="session-details-content">
                    <label>Notas de la partida<textarea maxLength="5000" value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} placeholder="Turno actual, recursos, objetivos pendientes..." /></label>
                    <section className="snapshot-editor">
                      <div>{form.snapshots.map((url, index) => <button key={url} onClick={() => setForm({ ...form, snapshots: form.snapshots.filter((_, position) => position !== index) })}><img src={url} alt={`Captura ${index + 1}`} /><X /></button>)}</div>
                      <label><Camera /> Añadir captura<input type="file" accept="image/jpeg,image/png,image/webp" onChange={addSnapshot} /></label>
                    </section>
                  </div>
                )}
              </section>
            </div>
            <footer><button onClick={() => setEditing(null)}>Cancelar</button><button className="save-session" onClick={save} disabled={saving}><Save /> {saving ? "Guardando..." : "Guardar partida"}</button>{editing !== "new" && <button className="finish-session" onClick={() => { const session = sessions.find((item) => item.id === editing); if (session) finish(session); }} title="Finalizar partida"><Check /> Finalizar</button>}</footer>
          </div>
        </div>
      )}
      {summarySession?.summary && <SessionSummary session={summarySession} onClose={() => { setSummarySession(null); setHostImmersiveMode(false); setImmersiveMode(false); setLiveViewSession(null); }} />}

      {liveViewSession && !liveViewSession.is_completed && (
        hostImmersiveMode ? (
          <HostImmersive
            sessionName={liveViewSession.game_name}
            onExit={() => { setHostImmersiveMode(false); setImmersiveMode(false); setLiveViewSession(null); }}
            editor={{
              form, setForm, sessionErrors, setSessionErrors,
              scoreStep, setScoreStep,
              timerRunning, setTimerRunning,
              draggedPlayerId, setDraggedPlayerId,
              detailsOpen, setDetailsOpen,
              editing,
              updatePlayer, linkPlayer, setScoringMode,
              addTeam, updateTeam, removeTeam, adjustTeamScore,
              addPlayer, removePlayer, adjustScore, undoScore,
              nextTurn, resetActiveTurnTime,
              addCounter, updateCounter, adjustCounter, rollDice,
              toggleTurnOrder, dropTurnPlayer, addSnapshot,
            }}
            games={games}
            communityUsers={communityUsers}
            formatDuration={formatDuration}
            sessions={sessions}
            onFinishSession={finish}
            onSave={save}
            onPublish={publishSession}
            onUnpublish={unpublishSession}
          />
        ) : immersiveMode ? (
          <ImmersiveRoom sessionName={liveViewSession.game_name} onExit={() => setImmersiveMode(false)}>
            <div className="session-form">{renderLiveContent()}</div>
          </ImmersiveRoom>
        ) : (
        <div className="session-modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setLiveViewSession(null)}>
          <div className="session-modal scoreboard-modal live-view-modal">
            <header>
              <div>
                <small><Eye /> En vivo · {liveViewSession.owner_name}</small>
                <h2>{liveViewSession.game_name}</h2>
              </div>
              <div className="session-visibility-toggle">
                <span className="live-dot" />
                <span className="live-label">EN VIVO</span>
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                {parseJwt(getToken())?.user_id === liveViewSession.owner_id && (
                  <button onClick={enterHostImmersive} title="Modo inmersivo anfitrión"><Monitor /></button>
                )}
                <button onClick={() => setImmersiveMode(true)} title="Modo inmersivo espectador"><Eye /></button>
                <button onClick={() => setLiveViewSession(null)}><X /></button>
              </div>
            </header>
            <div className="session-form">{renderLiveContent()}</div>
            <footer>
              <button onClick={async () => { try { await unfollowSession(liveViewSession.id); toast.success("Dejaste de seguir"); window.dispatchEvent(new CustomEvent("ludisist:notification")); setLiveViewSession(null); } catch (e) { toast.error(e.message); } }}>Dejar de seguir</button>
              <button onClick={() => setLiveViewSession(null)}>Cerrar</button>
            </footer>
          </div>
        </div>
      ))}

      {liveViewSession?.is_completed && liveViewSession.summary && (
        <SessionSummary session={liveViewSession} onClose={() => setLiveViewSession(null)} />
      )}
    </div>
  );
}

function formatDuration(seconds = 0) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;
  return [hours, minutes, remainingSeconds].map((value) => String(value).padStart(2, "0")).join(":");
}

function sessionPayload(form) {
  return {
    ...form,
    turn_order: form.turn_order_enabled ? form.turn_order : form.players.map((player) => player.id),
  };
}

function SessionSummary({ session, onClose }) {
  const { summary } = session;
  const teamMode = summary.scoring_mode === "teams";
  const standings = teamMode ? summary.team_standings : summary.standings;
  const winners = standings.filter((item) => item.position === 1);
  return <div className="session-modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <div className="session-summary-modal">
      <header><div><small>Partida finalizada</small><h2>{session.game_name}</h2></div><button onClick={onClose}><X /></button></header>
      <section className="summary-hero"><Trophy /><span><small>{summary.is_tie ? "Empate en primer lugar" : teamMode ? "Equipo ganador" : "Ganador"}</small><strong>{winners.map((item) => item.name).join(" · ")}</strong></span></section>
      <div className="summary-metrics"><div><strong>{summary.rounds}</strong><span>Rondas</span></div><div><strong>{formatDuration(summary.elapsed_seconds)}</strong><span>Duración</span></div><div><strong>{standings.length}</strong><span>{teamMode ? "Equipos" : "Jugadores"}</span></div></div>
      <section className="summary-standings">
        <div className="summary-title"><Medal /><span><small>Clasificación</small><h3>{teamMode ? "Podio por equipos" : "Podio y resultados"}</h3></span></div>
        {standings.map((item, index) => <article className={`summary-position position-${item.position}`} key={item.id || `${item.name}-${index}`}>
          <strong className="position-number">{item.position}</strong><i style={{ background: item.color }} />
          <span>{!teamMode && item.user_id ? <Link to={`/jugadores/${item.user_id}`}>{item.name}</Link> : <strong>{item.name}</strong>}<small>{teamMode ? item.members.map((member) => member.name).join(" · ") || "Sin integrantes" : `Tiempo en turno: ${formatDuration(item.turn_seconds)}`}</small></span>
          <b>{item.score} pts</b>
        </article>)}
      </section>
      <footer><button onClick={onClose}>Cerrar resumen</button></footer>
    </div>
  </div>;
}
