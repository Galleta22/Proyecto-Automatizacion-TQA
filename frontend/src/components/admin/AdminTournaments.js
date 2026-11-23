import { confirmAction } from "../../ui/confirmAction";
import { useSearchParams } from "react-router-dom";
import { ShareTournament } from "../TournamentsPage";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  LuTrophy as Trophy,
  LuUsers as Users,
  LuPlus as Plus,
  LuSearch as Search,
  LuTrash2 as Trash2,
  LuX as X,
  LuCalendarDays as CalendarDays,
  LuArrowLeft as ArrowLeft,
  LuCheck as Check,
  LuPlay as Play,
  LuFastForward as FastForward,
  LuUserPlus as UserPlus,
  LuShield as Shield,
  LuGamepad2 as Gamepad2,
} from "react-icons/lu";
import { toast } from "react-toastify";
import {getToken,parseJwt} from "../../services/auth";
import { adminRequest } from "./adminApi";
import AdminPagination from "./AdminPagination";
import "./AdminTournaments.css";

const STATUS_TABS = [
  { id: "all", label: "Todos", countKey: null },
  { id: "draft", label: "Borradores", countKey: "draft" },
  { id: "active", label: "En Curso", countKey: "active" },
  { id: "completed", label: "Finalizados", countKey: "completed" },
  { id: "cancelled", label: "Cancelados", countKey: "cancelled" },
];

const SKILL_LEVELS = [
  { id: "principiante", label: "Principiante", color: "#34d399", dotClass: "principiante" },
  { id: "intermedio", label: "Intermedio", color: "#60a5fa", dotClass: "intermedio" },
  { id: "avanzado", label: "Avanzado", color: "#fbbf24", dotClass: "avanzado" },
  { id: "experto", label: "Experto", color: "#f87171", dotClass: "experto" },
];

const emptyCreateForm = {
  name: "",
  game_id: "",
  description: "",
  max_participants: 16,
  competition_format: "individual",
  elimination: false,
  advance_per_table: 2,
  table_size: 4,
  team_size: 2,
  location: "",
  scheduled_at: "",
};

const emptyParticipantForm = {
  type: "system", // "system" | "external"
  user_id: "",
  external_name: "",
  team_members: [],
  skill_level: "intermedio",
};

const emptyJudgeForm = {
  user_id: "",
  is_head_judge: false,
};

export default function AdminTournaments() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [tournaments, setTournaments] = useState([]);
  const [stats, setStats] = useState({ draft: 0, active: 0, completed: 0, cancelled: 0 });
  const [statusFilter, setStatusFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState("20");
  const [pagination, setPagination] = useState({ pages: 1, total: 0 });
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState("");
  const [submitting, setSubmitting] = useState("");
  const [formErrors, setFormErrors] = useState({});
  const pending = useRef(false);

  const setFormError = (form, message) => setFormErrors((current) => ({ ...current, [form]: message }));

  const submitForm = async (form, request) => {
    if (pending.current) return;
    pending.current = true;
    setSubmitting(form);
    setFormError(form, "");
    try {
      await request();
    } catch (error) {
      setFormError(form, error.message || "No se pudo guardar. Vuelve a intentarlo.");
    } finally {
      pending.current = false;
      setSubmitting("");
    }
  };

  // Selected tournament view (null = list view)
  const [selectedTournament, setSelectedTournament] = useState(null);
  const [detailTab, setDetailTabState] = useState(searchParams.get("tab") || "matches");
  const setDetailTab = (tab) => { setDetailTabState(tab); setSearchParams((current) => { current.set("tab",tab); return current; }, {replace:true}); }; // matches | participants | judges | standings

  // External reference data
  const [games, setGames] = useState([]);
  const [users, setUsers] = useState([]);

  // Modals & forms
  const [modal, setModal] = useState(null); // "create" | "result"
  const closeModal = () => {
    if (!pending.current) setModal(null);
  };
  const [createForm, setCreateForm] = useState(emptyCreateForm);
  const [participantForm, setParticipantForm] = useState(emptyParticipantForm);
  const [judgeForm, setJudgeForm] = useState(emptyJudgeForm);
  const [resultForm, setResultForm] = useState({
    match: null,
    winner_id: null,
    is_draw: false,
    score_p1: 0,
    score_p2: 0,
    notes: "",
  });

  const tournamentId = searchParams.get("torneo");
  const requestedTab = searchParams.get("tab") || "matches";
  const [detailError, setDetailError] = useState("");
  const [detailAttempt, setDetailAttempt] = useState(0);

  useEffect(() => {
    setDetailTabState(requestedTab);
  }, [requestedTab]);

  useEffect(() => {
    const controller = new AbortController();
    setDetailError("");
    if (!tournamentId) {
      setSelectedTournament(null);
      return () => controller.abort();
    }
    adminRequest(`/tournaments/${tournamentId}`, { signal: controller.signal })
      .then((data) => { if (!controller.signal.aborted) setSelectedTournament(data); })
      .catch((error) => { if (!controller.signal.aborted) setDetailError(error.message); });
    return () => controller.abort();
  }, [tournamentId, detailAttempt]);
  // Load reference games and users on mount
  useEffect(() => {
    adminRequest("/games/?all_items=true")
      .then((res) => {
        const items = res.items || (Array.isArray(res) ? res : []);
        setGames(items);
        if (items.length > 0 && !createForm.game_id) {
          setCreateForm((f) => ({ ...f, game_id: items[0].id }));
        }
      })
      .catch((error) => window.dispatchEvent(new CustomEvent("ludisist:request-error", {detail:error.message})));

    // Load users from badges/admin or users endpoint
    adminRequest(parseJwt(getToken())?.role==="facilitador"?"/users/community?page_size=100":"/badges/admin")
      .then((res) => {
        if(res?.items)res.users=res.items.map((u)=>({...u,username:u.display_name}));
        if (res && res.users) {
          setUsers(res.users);
          if (res.users.length > 0) {
            setParticipantForm((f) => ({ ...f, user_id: res.users[0].id }));
            setJudgeForm((f) => ({ ...f, user_id: res.users[0].id }));
          }
        }
      })
      .catch(() => {
        // Fallback to /users
        adminRequest("/users")
          .then((res) => {
            const list = Array.isArray(res) ? res : (res.items || []);
            setUsers(list);
            if (list.length > 0) {
              setParticipantForm((f) => ({ ...f, user_id: list[0].id }));
              setJudgeForm((f) => ({ ...f, user_id: list[0].id }));
            }
          })
          .catch((error) => window.dispatchEvent(new CustomEvent("ludisist:request-error", {detail:error.message})));
      });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Load tournaments list
  const loadTournaments = () => {
    setListError("");
    setLoading(true);
    const params = new URLSearchParams({
      page: String(page),
      page_size: pageSize === "all" ? "20" : pageSize,
      all_items: String(pageSize === "all"),
      status: statusFilter === "all" ? "" : statusFilter,
    });
    adminRequest(`/tournaments/?${params}`)
      .then((data) => {
        setTournaments(data.items || []);
        setPagination({ pages: data.pages || 1, total: data.total || 0 });
        if (data.stats) setStats(data.stats);
      })
      .catch((err) => setListError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadTournaments();
  }, [page, pageSize, statusFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reload single tournament detail
  const refreshTournament = async (id) => {
    try {
      const data = await adminRequest(`/tournaments/${id}`);
      setSelectedTournament(data);
      loadTournaments();
    } catch (err) {
      setFormError("action", `No se pudo actualizar el detalle del torneo. ${err.message}`);
    }
  };

  // Open tournament details
  const handleOpenTournament = (tournament) => {
    const tab = tournament.status === "draft" ? "participants" : "matches";
    setSearchParams({ modulo: "tournaments", torneo: tournament.id, tab });
  };

  // Create Tournament
  const handleCreateTournament = async (e) => {
    e.preventDefault();
    if (pending.current) return;
    if (!createForm.name.trim()) {
      setFormError("create", "Ingresa un nombre para el torneo");
      return;
    }
    if (!createForm.game_id) {
      setFormError("create", "Selecciona un juego");
      return;
    }
    const publish = e.nativeEvent.submitter?.value === "publish";
    await submitForm("create", async () => {
      const created = await adminRequest("/tournaments/", {
        method: "POST",
        body: JSON.stringify({...createForm, is_public: publish, scheduled_at:createForm.scheduled_at ? new Date(createForm.scheduled_at).toISOString() : null}),
      });
      toast.success(`Torneo "${created.name}" creado con éxito`);
      setModal(null);
      setCreateForm(emptyCreateForm);
      loadTournaments();
      handleOpenTournament(created);
    });
  };

  // Start Tournament (Draft -> Active, generates Round 1)
  const handleStartTournament = async (id) => {
    await submitForm("action", async () => {
      if (!(await confirmAction("¿Estás seguro de iniciar el torneo? Se generarán automáticamente los cruces o las mesas de la primera ronda."))) {
        return;
      }
      const updated = await adminRequest(`/tournaments/${id}/start`, { method: "POST" });
      setSelectedTournament(updated);
      setDetailTab("matches");
      toast.success("¡Torneo iniciado! Emparejamientos de Ronda 1 generados.");
      loadTournaments();
    });
  };

  // Generate Next Round
  const handleNextRound = async (id) => {
    await submitForm("action", async () => {
      if (!(await confirmAction("¿Generar la siguiente ronda? Recuerda que todas las partidas actuales deben tener resultado registrado."))) {
        return;
      }
      const updated = await adminRequest(`/tournaments/${id}/next-round`, { method: "POST" });
      setSelectedTournament(updated);
      toast.success(`¡Ronda ${updated.current_round} generada exitosamente con el Sistema Experto!`);
      loadTournaments();
    });
  };

  // Complete Tournament
  const handleCompleteTournament = async (id) => {
    await submitForm("action", async () => {
      if (!(await confirmAction("¿Finalizar el torneo y declarar al campeón? Esta acción cerrará todas las partidas."))) {
        return;
      }
      const updated = await adminRequest(`/tournaments/${id}/complete`, { method: "POST" });
      setSelectedTournament(updated);
      setDetailTab("standings");
      toast.success("¡Torneo completado con éxito!");
      loadTournaments();
    });
  };

  // Cancel Tournament
  const handleCancelTournament = async (id) => {
    await submitForm("action", async () => {
      if (!(await confirmAction("¿Estás seguro de cancelar este torneo?"))) return;
      await adminRequest(`/tournaments/${id}/cancel`, { method: "POST" });
      toast.info("Torneo cancelado");
      await refreshTournament(id);
    });
  };

  // Delete Tournament (draft)
  const handleDeleteTournament = async (id) => {
    await submitForm("action", async () => {
      if (!(await confirmAction("¿Eliminar este torneo definitivamente? Esta acción no se puede deshacer."))) return;
      await adminRequest(`/tournaments/${id}`, { method: "DELETE" });
      toast.success("Torneo eliminado");
      setSelectedTournament(null);
      setSearchParams({ modulo: "tournaments" });
      loadTournaments();
    });
  };

  // Add Participant
  const handleAddParticipant = async (e) => {
    e.preventDefault();
    if (pending.current) return;
    if (!selectedTournament) return;
    const isTeam = selectedTournament.competition_format === "teams";
    const isExt = isTeam || participantForm.type === "external";
    if (isExt && !participantForm.external_name.trim()) {
      setFormError("participant", isTeam ? "Ingresa el nombre del equipo." : "Ingresa el nombre del participante externo.");
      return;
    }
    if (!isExt && !participantForm.user_id) {
      setFormError("participant", "Selecciona un usuario del sistema");
      return;
    }

    await submitForm("participant", async () => {
      const payload = {
        skill_level: participantForm.skill_level,
        user_id: isExt ? null : participantForm.user_id,
        external_name: isExt ? participantForm.external_name.trim() : null,
        team_members: isTeam ? participantForm.team_members : [],
      };
      await adminRequest(`/tournaments/${selectedTournament.id}/participants`, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      toast.success("Participante inscrito correctamente");
      setParticipantForm((f) => ({ ...f, external_name: "", team_members: [] }));
      await refreshTournament(selectedTournament.id);
    });
  };

  // Remove Participant
  const handleRemoveParticipant = async (participantId) => {
    if (!selectedTournament) return;
    await submitForm("action", async () => {
      if (!(await confirmAction("¿Remover a este participante del torneo?"))) return;
      await adminRequest(`/tournaments/${selectedTournament.id}/participants/${participantId}`, {
        method: "DELETE",
      });
      toast.success("Participante retirado");
      await refreshTournament(selectedTournament.id);
    });
  };

  // Add Judge
  const handleAddJudge = async (e) => {
    e.preventDefault();
    if (pending.current) return;
    if (!selectedTournament) return;
    if (!judgeForm.user_id) {
      setFormError("judge", "Selecciona a la persona que actuará como juez.");
      return;
    }
    await submitForm("judge", async () => {
      await adminRequest(`/tournaments/${selectedTournament.id}/judges`, {
        method: "POST",
        body: JSON.stringify(judgeForm),
      });
      toast.success("Juez asignado correctamente");
      setJudgeForm(emptyJudgeForm);
      await refreshTournament(selectedTournament.id);
    });
  };

  // Remove Judge
  const handleRemoveJudge = async (judgeId) => {
    if (!selectedTournament) return;
    await submitForm("action", async () => {
      if (!(await confirmAction("¿Remover a este juez del torneo?"))) return;
      await adminRequest(`/tournaments/${selectedTournament.id}/judges/${judgeId}`, {
        method: "DELETE",
      });
      toast.success("Juez retirado");
      await refreshTournament(selectedTournament.id);
    });
  };

  // Open Record Result Modal
  const handleOpenResultModal = (match) => {
    setFormError("result", "");
    setResultForm({
      match,
      placements: match.table_entries?.map((entry) => entry.id) || [],
      winner_id: match.winner_id || (selectedTournament.elimination ? null : match.participant1_id),
      is_draw: match.status === "completed" && !match.winner_id,
      score_p1: match.score_p1 || 0,
      score_p2: match.score_p2 || 0,
      notes: match.notes || "",
    });
    setModal("result");
  };

  // Submit Result
  const handleSubmitResult = async (e) => {
    e.preventDefault();
    if (pending.current) return;
    if (!resultForm.match) return;
    if (selectedTournament.elimination && !resultForm.placements.length && !resultForm.winner_id) {
      setFormError("result", "Selecciona quién ganó el cruce.");
      return;
    }
    await submitForm("result", async () => {
      const payload = {
        winner_id: resultForm.placements.length || resultForm.is_draw ? null : resultForm.winner_id,
        placements: resultForm.placements.length ? resultForm.placements : null,
        score_p1: Number(resultForm.score_p1),
        score_p2: Number(resultForm.score_p2),
        notes: resultForm.notes,
      };
      const updated = await adminRequest(`/tournaments/matches/${resultForm.match.id}/result`, {
        method: "PUT",
        body: JSON.stringify(payload),
      });
      toast.success("Resultado de la partida registrado");
      setModal(null);
      setSelectedTournament(updated);
      loadTournaments();
    });
  };

  // Filtered tournament list
  const filteredTournaments = useMemo(() => {
    if (!query.trim()) return tournaments;
    const q = query.toLowerCase();
    return tournaments.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        (t.game_name && t.game_name.toLowerCase().includes(q))
    );
  }, [tournaments, query]);

  // Skill badge label helper
  const getSkillLabel = (skill) => {
    const found = SKILL_LEVELS.find((s) => s.id === skill);
    return found ? found.label : skill;
  };

  // Status badge label helper
  const getStatusBadge = (status) => {
    if (status === "draft") return <span className="tournament-card-status draft">Borrador</span>;
    if (status === "active") return <span className="tournament-card-status active">En Curso</span>;
    if (status === "completed") return <span className="tournament-card-status completed">Finalizado</span>;
    if (status === "cancelled") return <span className="tournament-card-status cancelled">Cancelado</span>;
    return <span className="tournament-card-status">{status}</span>;
  };

  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // RENDER: TOURNAMENT DETAIL VIEW
  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  if (tournamentId && selectedTournament?.id !== tournamentId) return <div className="admin-module">
    <div className="module-heading"><h1>Torneos</h1></div>
    {detailError ? <>
      <p className="error-message" role="alert">No se pudo cargar el torneo. {detailError}</p>
      <button type="button" className="admin-secondary" onClick={() => setDetailAttempt((current) => current + 1)}>Reintentar carga</button>
      <button type="button" className="admin-secondary" onClick={() => setSearchParams({ modulo: "tournaments" })}>Volver al listado</button>
    </> : <p role="status">Cargando torneo…</p>}
  </div>;

  if (tournamentId && selectedTournament) {
    const t = selectedTournament;
    const isDraft = t.status === "draft";
    const isTeam = t.competition_format === "teams";
    const isMultiplayer = t.competition_format === "multiplayer";
    const minimumEntrants = t.minimum_entrants ?? (isTeam ? 2 : 4);
    const isActive = t.status === "active";
    const isCompleted = t.status === "completed";
    const activeParticipants = (t.participants || []).filter((p) => p.is_active);
    const canStart = isDraft && activeParticipants.length >= minimumEntrants;

    // Check if current round has incomplete matches
    const currentRound = (t.rounds || []).find((r) => r.round_number === t.current_round);
    const isFinalRound = Boolean(currentRound?.decision?.final);
    const hasIncompleteMatches = currentRound
      ? currentRound.matches.some((m) => m.status !== "completed")
      : false;

    return (
      <div className="admin-module admin-tournaments-module">
        {/* Top actions bar */}
        <div className="tournament-actions-bar">
          <button className="btn-back" onClick={() => {setSelectedTournament(null);setSearchParams({modulo:"tournaments"});}}>
            <ArrowLeft /> Volver al listado
          </button>

          {isDraft && (
            <>
              <button
                className="btn-start"
                disabled={!canStart || Boolean(submitting)}
                onClick={() => handleStartTournament(t.id)}
                title={!canStart ? `Se necesitan al menos ${minimumEntrants} inscripciones activas para iniciar` : "Generar la primera ronda"}
              >
                <Play /> Iniciar torneo ({activeParticipants.length}/{minimumEntrants} mín.)
              </button>
              <button className="btn-cancel-tournament" disabled={Boolean(submitting)} onClick={() => handleDeleteTournament(t.id)}>
                <Trash2 /> Eliminar Borrador
              </button>
            </>
          )}

          {isActive && (
            <>
              {!isFinalRound && <button
                className="btn-next-round"
                disabled={hasIncompleteMatches || Boolean(submitting)}
                onClick={() => handleNextRound(t.id)}
                title={hasIncompleteMatches ? "Registra todos los resultados de la ronda actual primero" : "Generar la siguiente ronda"}
              >
                <FastForward /> Siguiente Ronda ({t.current_round + 1})
              </button>}
              {(!t.elimination || isFinalRound) && <button
                className="btn-complete"
                disabled={hasIncompleteMatches || Boolean(submitting)}
                onClick={() => handleCompleteTournament(t.id)}
                title={hasIncompleteMatches ? "Todas las partidas deben completarse antes de finalizar" : "Finalizar torneo y coronar campeón"}
              >
                <Trophy /> Finalizar Torneo
              </button>}
              <button className="btn-cancel-tournament" disabled={Boolean(submitting)} onClick={() => handleCancelTournament(t.id)}>
                <X /> Cancelar Torneo
              </button>
            </>
          )}

          {isCompleted && (
            <div style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "6px 14px", borderRadius: 6, background: "rgba(251,191,36,.12)", color: "#fbbf24", fontWeight: 700 }}>
              <Trophy /> Torneo Finalizado
            </div>
          )}
        </div>

        {/* Tournament header banner */}
        <div className="module-heading" style={{ marginBottom: 16 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
              <h1 style={{ margin: 0 }}>{t.name}</h1>
              {getStatusBadge(t.status)}
            </div>
            <p style={{ margin: 0, color: "var(--text-muted)" }}>
              Juego: <strong style={{ color: "var(--text-main)" }}>{t.game_name}</strong> · Ronda actual: <strong style={{ color: "var(--text-main)" }}>{t.current_round}</strong> · Creado por: {t.created_by_name || "Admin"}
              {t.description && ` · ${t.description}`}
            </p>
          </div>
        </div>

        {/* Subtabs navigation */}
        <div className="tournament-status-tabs" style={{ marginBottom: 20 }}>
          <button
            aria-pressed={detailTab === "matches"} className={detailTab === "matches" ? "active" : ""}
            onClick={() => setDetailTab("matches")}
          >
            <Gamepad2 /> Mesas y Partidas
            <span className="tab-count">{(t.rounds || []).length}</span>
          </button>
          <button
            aria-pressed={detailTab === "participants"} className={detailTab === "participants" ? "active" : ""}
            onClick={() => setDetailTab("participants")}
          >
            <Users /> Participantes
            <span className="tab-count">{(t.participants || []).length}</span>
          </button>
          <button
            aria-pressed={detailTab === "judges"} className={detailTab === "judges" ? "active" : ""}
            onClick={() => setDetailTab("judges")}
          >
            <Shield /> Jueces
            <span className="tab-count">{(t.judges || []).length}</span>
          </button>
          <button
            aria-pressed={detailTab === "standings"} className={detailTab === "standings" ? "active" : ""}
            onClick={() => setDetailTab("standings")}
          >
            <Trophy /> Clasificación
          </button>
        </div>

        <div className="tournament-publication">
          <p>Visibilidad · <strong>{t.is_public ? "Público" : "Privado"}</strong> · {t.format}</p>
          {isDraft && <button type="button" className="admin-secondary" disabled={Boolean(submitting)}
            onClick={() => submitForm("action", async () => {
              await adminRequest(`/tournaments/${t.id}`, { method: "PUT", body: JSON.stringify({ is_public: !t.is_public }) });
              await refreshTournament(t.id);
            })}>{t.is_public ? "Retirar publicación" : isTeam ? "Publicar torneo" : "Publicar y abrir inscripciones"}</button>}
          {t.elimination && <p>{t.scoring}</p>}
          {t.champion && <p><strong>Campeón: {t.champion}</strong></p>}
          {isDraft && <details>
            <summary>Configurar eliminación</summary>
            <form className="add-inline-form" key={`${t.id}-${t.elimination}-${t.table_size}-${t.advance_per_table}`}
              onSubmit={(event) => {
                event.preventDefault();
                const fields = new FormData(event.currentTarget);
                const settings = { elimination: fields.get("elimination") === "true" };
                if (isMultiplayer) {
                  settings.table_size = Number(fields.get("table_size"));
                  settings.advance_per_table = Number(fields.get("advance_per_table"));
                }
                submitForm("action", async () => {
                  await adminRequest(`/tournaments/${t.id}`, { method: "PUT", body: JSON.stringify(settings) });
                  await refreshTournament(t.id);
                });
              }}>
              <label>Sistema de avance
                <select name="elimination" defaultValue={String(Boolean(t.elimination))}>
                  <option value="false">Sin eliminación</option>
                  <option value="true">Eliminación directa</option>
                </select>
              </label>
              {isMultiplayer && <>
                <label>Tamaño máximo de mesa
                  <input name="table_size" type="number" min={3} max={10} required defaultValue={t.table_size} />
                </label>
                <label>Máximo de clasificados por mesa preliminar
                  <input name="advance_per_table" type="number" min={1} max={9} required defaultValue={t.advance_per_table ?? 2} />
                </label>
              </>}
              <button className="admin-secondary" disabled={Boolean(submitting)}>Guardar configuración</button>
            </form>
          </details>}
          {t.is_public && <ShareTournament tournament={t} />}
        </div>
        {submitting === "action" && <p role="status">Actualizando torneo…</p>}
        {formErrors.action && <p className="error-message" role="alert">{formErrors.action}</p>}
        {/* Subtab: MATCHES / MESAS */}
        {detailTab === "matches" && (
          <div className="rounds-container">
            {(!t.rounds || t.rounds.length === 0) ? (
              <div className="tournament-empty">
                <Gamepad2 />
                <h3>No hay rondas generadas aún</h3>
                <p>
                  {isDraft
                    ? "Inscribe a los participantes e inicia el torneo para generar la primera ronda."
                    : "No se encontraron rondas registradas para este torneo."}
                </p>
              </div>
            ) : (
              // Display rounds from newest to oldest
              [...t.rounds].reverse().map((round) => (
                <div key={round.id} className="round-block">
                  <div className="round-header">
                    <h4>
                      <Gamepad2 /> {round.decision?.final ? "Final" : `Ronda ${round.round_number}`}
                    </h4>
                    <span className={`round-status ${round.status}`}>
                      {round.status === "completed" ? "Ronda Completada" : "Ronda en Curso"}
                    </span>
                  </div>
                  {round.decision?.summary && <details className="ui-status">
                    <summary>Cómo se generó la ronda</summary>
                    <p>{round.decision.summary}</p>
                    <ul>{round.matches.map((match) => (
                      <li key={match.id}>
                        {match.table_number ? `Mesa ${match.table_number}` : "Pase o descanso"}. {round.decision.matches?.[match.table_number]}
                      </li>
                    ))}</ul>
                  </details>}
                  <div className="round-matches">
                    {round.matches.map((m) => {
                      if (m.table_entries?.length) return <article className="admin-panel tournament-table-placements" key={m.id}>
                        <h5>Mesa {m.table_number}</h5>
                        {round.decision?.advance && <p>{round.decision.final
                          ? "El primer puesto gana el torneo."
                          : `Clasifican ${round.decision.advance[m.table_number]} de esta mesa.`}</p>}
                        {m.placements?.length ? <ol>{m.placements.map((id) => <li key={id}>
                          {m.table_entries.find((entry) => entry.id === id)?.name}
                          {round.decision?.advance && m.placements.indexOf(id) < round.decision.advance[m.table_number] &&
                            (round.decision.final ? " · Campeón" : " · Clasifica")}
                        </li>)}</ol>
                          : <ul>{m.table_entries.map((entry) => <li key={entry.id}>{entry.name}</li>)}</ul>}
                        {m.notes && <p>{m.notes}</p>}
                        {isActive && m.status !== "completed" && <button className="admin-secondary" disabled={Boolean(submitting)} onClick={() => handleOpenResultModal(m)}>Registrar puestos de la mesa {m.table_number}</button>}
                      </article>;
                      const isBye = !m.participant2_id;
                      const p1Won = m.status === "completed" && m.winner_id === m.participant1_id;
                      const p2Won = m.status === "completed" && m.winner_id === m.participant2_id;
                      const isDraw = m.status === "completed" && !m.winner_id && !isBye;

                      return (
                        <div key={m.id} className={`match-row ${isBye ? "bye-match" : ""}`}>
                          {/* Table number */}
                          <div className="match-table-num" title={`Mesa ${m.table_number}`}>
                            {m.table_number}
                          </div>

                          {/* Player 1 */}
                          <div className={`match-player ${p1Won ? "winner" : p2Won ? "loser" : ""}`}>
                            {m.participant1_skill && (
                              <span
                                className={`skill-dot ${m.participant1_skill}`}
                                title={`Habilidad: ${getSkillLabel(m.participant1_skill)}`}
                              />
                            )}
                            <span className="name">{m.participant1_name || "Jugador 1"}</span>
                          </div>

                          {/* VS / Score */}
                          <div className="match-vs">
                            {m.status === "completed" ? (
                              <span className="match-score">
                                {isDraw ? "Empate" : "Resultado registrado"}
                              </span>
                            ) : (
                              "VS"
                            )}
                          </div>

                          {/* Player 2 or BYE */}
                          <div className={`match-player ${p2Won ? "winner" : p1Won ? "loser" : ""}`}>
                            {m.participant2_skill && (
                              <span
                                className={`skill-dot ${m.participant2_skill}`}
                                title={`Habilidad: ${getSkillLabel(m.participant2_skill)}`}
                              />
                            )}
                            <span className="name">
                              {isBye ? "PASE LIBRE (BYE)" : (m.participant2_name || "Jugador 2")}
                            </span>
                          </div>

                          {/* Actions */}
                          <div className="match-actions">
                            {isBye ? (
                              <span className="match-actions btn-done" style={{ fontSize: 11 }}>
                                {t.elimination ? "Pase automático" : "+1 pt automático"}
                              </span>
                            ) : m.status === "completed" ? (
                              <button
                                className="btn-done" disabled
                                title={m.notes || "Resultado registrado"}
                              >
                                <Check /> {isDraw ? "Empate" : "Finalizada"}
                              </button>
                            ) : (
                              <button
                                className="btn-result" disabled={!isActive || Boolean(submitting)}
                                onClick={() => handleOpenResultModal(m)}
                              >
                                Registrar Resultado
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* Subtab: PARTICIPANTS */}
        {detailTab === "participants" && (
          <div className="tournament-detail-content">
            {/* Add participant form (available in draft mode) */}
            {isDraft && (
              <div className="tournament-section">
                <h3>
                  <UserPlus /> {isTeam ? "Inscribir equipo" : "Inscribir participante"}
                </h3>

                {/* Toggle: System User vs External Person */}
                {!isTeam && <div className="type-toggle">
                  <button
                    type="button"
                    className={participantForm.type === "system" ? "active" : ""}
                    onClick={() => setParticipantForm((f) => ({ ...f, type: "system" }))}
                  >
                    Usuario del Sistema
                  </button>
                  <button
                    type="button"
                    className={participantForm.type === "external" ? "active" : ""}
                    onClick={() => setParticipantForm((f) => ({ ...f, type: "external" }))}
                  >
                    Persona Externa (Invitado)
                  </button>
                </div>}

                <form className="add-inline-form" onSubmit={handleAddParticipant}>
                  {!isTeam && participantForm.type === "system" ? (
                    <label>
                      Usuario Registrado
                      <select
                        value={participantForm.user_id}
                        onChange={(e) =>
                          setParticipantForm((f) => ({ ...f, user_id: e.target.value }))
                        }
                      >
                        {users.map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.username}{u.email ? ` (${u.email})` : ""}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : (
                    <label>
                      {isTeam ? "Nombre del equipo" : "Nombre de la persona externa"}
                      <input
                        type="text"
                        placeholder="Ej. Juan Pérez"
                        value={participantForm.external_name}
                        onChange={(e) =>
                          setParticipantForm((f) => ({ ...f, external_name: e.target.value }))
                        }
                      />
                    </label>
                  )}

                  {isTeam && Array.from({ length: t.team_size }, (_, index) => <label key={index}>
                    Integrante {index + 1}
                    <input required minLength={2} maxLength={100} value={participantForm.team_members[index] || ""}
                      onChange={(event) => {
                        const name = event.target.value;
                        setParticipantForm((current) => {
                          const members = Array.from({ length: t.team_size }, (_, i) => i === index ? name : current.team_members[i] || "");
                          return { ...current, team_members: members };
                        });
                      }} />
                  </label>)}
                  {!isTeam && !isMultiplayer && <label>
                    Nivel de Habilidad (SBMM)
                    <select
                      value={participantForm.skill_level}
                      onChange={(e) =>
                        setParticipantForm((f) => ({ ...f, skill_level: e.target.value }))
                      }
                    >
                      {SKILL_LEVELS.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.label}
                        </option>
                      ))}
                    </select>
                  </label>}

                  {formErrors.participant && <p className="error-message" role="alert">{formErrors.participant}</p>}
                  <button type="submit" disabled={Boolean(submitting)} className="btn-add">
                    {submitting === "participant" ? "Guardando…" : "Inscribir"}
                  </button>
                </form>
              </div>
            )}

            {/* List of participants */}
            <div className="tournament-section">
              <h3>
                <Users /> Lista de Participantes ({(t.participants || []).length} / {t.max_participants})
              </h3>

              {(!t.participants || t.participants.length === 0) ? (
                <p style={{ color: "var(--text-muted)", fontSize: 13 }}>
                  No hay participantes inscritos aún. Agrega jugadores del sistema o externos para comenzar.
                </p>
              ) : (
                <div className="participant-list">
                  {t.participants.map((p) => (
                    <div key={p.id} className="participant-item">
                      <span className="participant-name">
                        {p.display_name}
                        {p.team_members?.length > 0 && <small>{p.team_members.join(", ")}</small>}
                        {!isTeam && p.external_name && <span className="external-badge">Externo</span>}
                      </span>

                      {!isTeam && !isMultiplayer && <span className={`skill-badge ${p.skill_level}`}>{getSkillLabel(p.skill_level)}</span>}

                      <div className="participant-stats">
                        <span className="stat-pts">{Number(p.points.toFixed(4))} pts</span>
                        <span className="stat-w">{p.wins} V</span>
                        <span className="stat-l">{p.losses} D</span>
                        <span className="stat-d">{p.draws} E</span>
                        {p.has_bye && <span title="Ya recibió bye">BYE</span>}
                      </div>

                      {isDraft && (
                        <button
                          type="button"
                          title="Eliminar participante"
                          disabled={Boolean(submitting)} onClick={() => handleRemoveParticipant(p.id)}
                        >
                          <Trash2 />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Subtab: JUDGES */}
        {detailTab === "judges" && (
          <div className="tournament-detail-content">
            <div className="tournament-section">
              <h3>
                <Shield /> Asignar Juez al Torneo
              </h3>
              {!["completed","cancelled"].includes(t.status) && <form className="add-inline-form judge-assignment-form" onSubmit={handleAddJudge}>
                <label>
                  Usuario del Sistema
                  <select
                    value={judgeForm.user_id}
                    onChange={(e) => setJudgeForm((f) => ({ ...f, user_id: e.target.value }))}
                  >
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.username}{u.role ? ` · ${u.role === "admin" ? "Administrador" : u.role === "facilitador" ? "Facilitador" : "Jugador"}` : ""}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="judge-principal-option">
                  <input
                    type="checkbox"
                    checked={judgeForm.is_head_judge}
                    onChange={(e) =>
                      setJudgeForm((f) => ({ ...f, is_head_judge: e.target.checked }))
                    }
                  />
                  <span>Juez principal</span>
                </label>

                {formErrors.judge && <p className="error-message" role="alert">{formErrors.judge}</p>}
                  <button type="submit" disabled={Boolean(submitting)} className="btn-add">
                  {submitting === "judge" ? "Guardando…" : "Asignar"}
                </button>
              </form>}
            </div>

            <div className="tournament-section">
              <h3>
                <Shield /> Jueces Designados ({(t.judges || []).length})
              </h3>
              {(!t.judges || t.judges.length === 0) ? (
                <p style={{ color: "var(--text-muted)", fontSize: 13 }}>
                  No se han asignado jueces para supervisar las mesas de este torneo.
                </p>
              ) : (
                <div className="participant-list">
                  {t.judges.map((j) => (
                    <div key={j.id} className="judge-item">
                      <span className="judge-name">{j.display_name}</span>
                      {j.is_head_judge && <span className="head-badge">Juez Principal</span>}
                      {!["completed","cancelled"].includes(t.status) && <button
                        type="button"
                        title="Eliminar juez"
                        disabled={Boolean(submitting)} onClick={() => handleRemoveJudge(j.id)}
                      >
                        <Trash2 />
                      </button>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Subtab: STANDINGS */}
        {detailTab === "standings" && (
          <div className="tournament-section">
            <h3>
              <Trophy /> Tabla de Clasificación Suiza (SBMM)
            </h3>
            <p style={{ color: "var(--text-muted)", fontSize: 12, marginTop: -6, marginBottom: 14 }}>
              {t.scoring}
            </p>

            {(!t.standings || t.standings.length === 0) ? (
              <p style={{ color: "var(--text-muted)", fontSize: 13 }}>
                Aún no hay puntuaciones registradas en este torneo.
              </p>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table className="standings-table">
                  <thead>
                    <tr>
                      <th style={{ width: 50 }}>#</th>
                      <th>{isTeam ? "Equipo" : "Participante"}</th>
                      {!isTeam && !isMultiplayer && <th>Experiencia</th>}
                      <th>Puntos</th>
                      <th>{isMultiplayer ? "Primeros puestos" : "V - D - E"}</th>
                      {!isMultiplayer && <th>Buchholz</th>}
                      {!isMultiplayer && <th>Buchholz mediano</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {t.standings.map((st, index) => {
                      const rank = st.rank;
                      const rankClass = rank === 1 ? "rank-1" : rank === 2 ? "rank-2" : rank === 3 ? "rank-3" : "rank-other";
                      return (
                        <tr key={st.id || st.player_id}>
                          <td>
                            <span className={`standings-rank ${rankClass}`}>{rank}</span>
                          </td>
                          <td>
                            <strong>{st.name}</strong><small style={{display:"block"}}>{st.tie_break || ""}</small>
                          </td>
                          {!isTeam && !isMultiplayer && <td>
                            <span className={`skill-badge ${st.skill_level}`}>
                              {getSkillLabel(st.skill_level)}
                            </span>
                          </td>}
                          <td>
                            <strong style={{ color: "var(--text-main)", fontSize: 14 }}>
                              {st.points}
                            </strong>
                          </td>
                          <td style={{ color: "var(--text-muted)" }}>
                            {isMultiplayer ? st.wins : `${st.wins} - ${st.losses} - ${st.draws}`}
                          </td>
                          {!isMultiplayer && <td>{st.buchholz}</td>}
                          {!isMultiplayer && <td>{st.median_buchholz}</td>}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* â”€â”€ MODAL: RECORD MATCH RESULT â”€â”€ */}
        {modal === "result" && resultForm.match && (
          <div className="admin-modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && closeModal()}>
            <div className="admin-modal tournament-modal" style={{ maxWidth: 540 }}>
              <div className="modal-heading">
                <h2>Mesa {resultForm.match.table_number} — Registrar Resultado</h2>
                <button aria-label="Cerrar ventana" type="button" disabled={Boolean(submitting)} onClick={closeModal}><X />
                </button>
              </div>

              <form onSubmit={handleSubmitResult} className="result-form">
                {resultForm.placements.length ? <>
                  <p>Ordena a los participantes del primero al último. Al cambiar un puesto, se intercambia con el anterior titular de ese puesto.</p>
                  {resultForm.placements.map((id, position) => <label key={position}>
                    Puesto {position + 1}
                    <select disabled={Boolean(submitting)} value={id} onChange={(event) => {
                      const value = event.target.value;
                      setResultForm((current) => {
                        const placements = [...current.placements];
                        const previous = placements.indexOf(value);
                        [placements[position], placements[previous]] = [placements[previous], placements[position]];
                        return { ...current, placements };
                      });
                    }}>
                      {resultForm.match.table_entries.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
                    </select>
                  </label>)}
                </> : <>
                <p style={{ fontSize: 13, color: "var(--text-muted)", margin: "0 0 6px" }}>
                  {t.elimination ? "Selecciona al ganador. Resuelve cualquier empate antes de registrar el resultado." : "Selecciona al jugador ganador o marca la casilla de empate:"}
                </p>

                {/* Player selector cards */}
                <div className="result-players">
                  <div
                    role="button" tabIndex={0} onKeyDown={(e)=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();e.currentTarget.click();}}} className={`result-player-card ${!resultForm.is_draw && resultForm.winner_id === resultForm.match.participant1_id ? "selected" : ""}`}
                    onClick={() =>
                      setResultForm((f) => ({
                        ...f,
                        winner_id: f.match.participant1_id,
                        is_draw: false,
                      }))
                    }
                  >
                    <div className="player-name">{resultForm.match.participant1_name}</div>
                    <span className={`skill-badge ${resultForm.match.participant1_skill}`}>
                      {getSkillLabel(resultForm.match.participant1_skill)}
                    </span>
                    {!resultForm.is_draw && resultForm.winner_id === resultForm.match.participant1_id && (
                      <div style={{ marginTop: 6, color: "#10b981", fontSize: 11, fontWeight: 700 }}>
                        <Check /> GANADOR
                      </div>
                    )}
                  </div>

                  <div className="result-vs">VS</div>

                  <div
                    role="button" tabIndex={0} onKeyDown={(e)=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();e.currentTarget.click();}}} className={`result-player-card ${!resultForm.is_draw && resultForm.winner_id === resultForm.match.participant2_id ? "selected" : ""}`}
                    onClick={() =>
                      setResultForm((f) => ({
                        ...f,
                        winner_id: f.match.participant2_id,
                        is_draw: false,
                      }))
                    }
                  >
                    <div className="player-name">{resultForm.match.participant2_name}</div>
                    <span className={`skill-badge ${resultForm.match.participant2_skill}`}>
                      {getSkillLabel(resultForm.match.participant2_skill)}
                    </span>
                    {!resultForm.is_draw && resultForm.winner_id === resultForm.match.participant2_id && (
                      <div style={{ marginTop: 6, color: "#10b981", fontSize: 11, fontWeight: 700 }}>
                        <Check /> GANADOR
                      </div>
                    )}
                  </div>
                </div>

                {/* Draw option */}
                {!t.elimination && <label className="result-draw-option">
                  <input
                    type="checkbox"
                    checked={resultForm.is_draw}
                    onChange={(e) =>
                      setResultForm((f) => ({
                        ...f,
                        is_draw: e.target.checked,
                        winner_id: e.target.checked ? null : f.match.participant1_id,
                      }))
                    }
                  />
                  <span>Empate / Tablas (ambos jugadores reciben 0.5 puntos)</span>
                </label>}

                {!t.elimination && <p className="ui-status">La clasificación usa victoria, empate o derrota.</p>}

                </>}

                {/* Notes */}
                <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: "var(--text-muted)" }}>
                  Observaciones / Notas del Juez
                  <input
                    type="text"
                    placeholder="Ej. Victoria por jaque mate, abandono, etc."
                    value={resultForm.notes}
                    onChange={(e) => setResultForm((f) => ({ ...f, notes: e.target.value }))}
                    style={{ minHeight: 34, padding: "6px 10px", borderRadius: 6, border: "1px solid var(--glass-border)", background: "rgba(255,255,255,.05)", color: "var(--text-main)" }}
                  />
                </label>

                <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 10 }}>
                  <button
                    type="button"
                    className="admin-btn"
                    onClick={closeModal}
                  >
                    Cancelar
                  </button>
                  {formErrors.result && <p className="error-message" role="alert">{formErrors.result}</p>}
                  <button type="submit" disabled={Boolean(submitting)} className="admin-primary">
                    {submitting === "result" ? "Guardando…" : "Guardar resultado"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    );
  }

  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // RENDER: TOURNAMENTS LIST VIEW
  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  return (
    <div className="admin-module admin-tournaments-module">
      {/* Module heading */}
      <div className="module-heading">
        <div>
          <h1>Torneos</h1>
          <p>Organiza duelos, equipos o mesas multijugador con clasificación por rondas o eliminación directa.</p>
        </div>
        <button className="admin-primary" onClick={() => { setFormError("create", ""); setModal("create"); }}>
          <Plus /> Nuevo Torneo
        </button>
      </div>

      {/* Status filter tabs */}
      <div className="tournament-status-tabs">
        {STATUS_TABS.map((tab) => {
          const count = tab.countKey ? stats[tab.countKey] : pagination.total;
          return (
            <button
              key={tab.id}
              className={statusFilter === tab.id ? "active" : ""}
              onClick={() => {
                setStatusFilter(tab.id);
                setPage(1);
              }}
            >
              {tab.label}
              <span className="tab-count">{count}</span>
            </button>
          );
        })}
      </div>

      {/* Toolbar / Search */}
      <div className="admin-toolbar">
        <label className="admin-search">
          <Search />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por nombre de torneo o juego..."
          />
        </label>
      </div>

      {/* Grid of tournaments */}
      {listError && <div className="admin-empty">
        <p className="error-message" role="alert">No se pudo actualizar el listado. {listError}</p>
        <button type="button" className="admin-secondary" onClick={loadTournaments}>Reintentar carga</button>
      </div>}
      {loading ? (
        <div style={{ padding: 40, textAlign: "center", color: "var(--text-muted)" }}>
          Cargando torneos...
        </div>
      ) : listError && filteredTournaments.length === 0 ? null : filteredTournaments.length === 0 ? (
        <div className="tournament-empty">
          <Trophy />
          <h3>No se encontraron torneos</h3>
          <p>Crea un nuevo torneo para comenzar a organizar partidas con el sistema suizo.</p>
        </div>
      ) : (
        <div className="tournament-grid">
          {filteredTournaments.map((tourn) => (
            <div
              key={tourn.id}
              role="button" tabIndex={0} onKeyDown={(e)=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();handleOpenTournament(tourn);}}} className="tournament-card"
              onClick={() => handleOpenTournament(tourn)}
            >
              <div className="tournament-card-header">
                {tourn.game_image_url ? (
                  <img src={tourn.game_image_url} alt={tourn.game_name} />
                ) : (
                  <div className="no-image">
                    <Gamepad2 />
                  </div>
                )}
                <div className="tournament-card-info">
                  <h3>{tourn.name}</h3>
                  <div className="game-label">{tourn.game_name || "Juego no especificado"}</div>
                </div>
                {getStatusBadge(tourn.status)}
              </div>

              <div className="tournament-card-body">
                <div className="tournament-card-stats">
                  <div>
                    <strong>{tourn.participant_count || 0}</strong>
                    <span>Participantes</span>
                  </div>
                  <div>
                    <strong>{tourn.current_round || 0}</strong>
                    <span>Rondas</span>
                  </div>
                  <div>
                    <strong>{tourn.judge_count || 0}</strong>
                    <span>Jueces</span>
                  </div>
                </div>
              </div>

              <div className="tournament-card-footer">
                <div className="creator">
                  <CalendarDays size={14} />
                  <span>
                    {tourn.created_at ? new Date(tourn.created_at).toLocaleDateString() : ""}
                  </span>
                </div>
                <span style={{ color: "var(--admin-blue)", fontWeight: 600 }}>
                  Gestionar →
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      <AdminPagination
        page={page}
        pages={pagination.pages}
        total={pagination.total}
        onChange={setPage}
        pageSize={pageSize}
        onPageSizeChange={(value) => {
          setPageSize(value);
          setPage(1);
        }}
      />

      {/* â”€â”€ MODAL: CREATE TOURNAMENT â”€â”€ */}
      {modal === "create" && (
        <div className="admin-modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && closeModal()}>
          <div className="admin-modal tournament-modal tournament-create-modal">
            <div className="modal-heading">
              <h2>Crear Nuevo Torneo</h2>
              <button aria-label="Cerrar ventana" type="button" disabled={Boolean(submitting)} onClick={closeModal}><X />
              </button>
            </div>

            <form onSubmit={handleCreateTournament} className="tournament-create-form">
              <label>
                Nombre del Torneo *
                <input
                  type="text"
                  required
                  placeholder="Ej. Torneo de Ajedrez Ludisist 2026"
                  value={createForm.name}
                  onChange={(e) => setCreateForm((f) => ({ ...f, name: e.target.value }))}
                />
              </label>

              <label>
                Juego *
                <select
                  required
                  value={createForm.game_id}
                  onChange={(e) => setCreateForm((f) => ({ ...f, game_id: e.target.value }))}
                >
                  <option value="">-- Selecciona un juego --</option>
                  {games.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                </select>
              </label>

              <label>Formato
                <select value={createForm.competition_format} onChange={(event) => setCreateForm({ ...createForm, competition_format: event.target.value })}>
                  <option value="individual">Individual 1 contra 1</option>
                  <option value="multiplayer">Mesas clasificadas por puestos</option>
                  <option value="teams">Equipos fijos</option>
                </select>
              </label>
              <label>Sistema de avance
                <select value={String(createForm.elimination)} onChange={(event) => setCreateForm({ ...createForm, elimination: event.target.value === "true" })}>
                  <option value="false">Sin eliminación</option>
                  <option value="true">Eliminación directa</option>
                </select>
              </label>
              {createForm.competition_format === "multiplayer" && <label>Tamaño máximo de mesa
                <input type="number" min={3} max={10} required value={createForm.table_size} onChange={(event) => setCreateForm({ ...createForm, table_size: Number(event.target.value) })} />
              </label>}
              {createForm.elimination && createForm.competition_format === "multiplayer" &&
                <label>Máximo de clasificados por mesa preliminar
                  <input type="number" min={1} max={createForm.table_size - 1} required
                    value={createForm.advance_per_table} onChange={(event) => setCreateForm({ ...createForm, advance_per_table: Number(event.target.value) })} />
                </label>}
              {createForm.elimination && <p className="ui-status">{createForm.competition_format === "multiplayer"
                ? "Cada mesa preliminar elimina al menos a una persona. El primer puesto de la última mesa gana el torneo."
                : "El ganador de cada cruce avanza. Cualquier empate debe resolverse para registrar al ganador."}</p>}
              {createForm.competition_format === "teams" && <label>Integrantes por equipo
                <input type="number" min={2} max={8} required value={createForm.team_size} onChange={(event) => setCreateForm({ ...createForm, team_size: Number(event.target.value) })} />
              </label>}
              <label>
                {createForm.competition_format === "teams" ? "Cupos de equipos" : "Cupos de participantes"}
                <select
                  value={createForm.max_participants}
                  onChange={(e) =>
                    setCreateForm((f) => ({ ...f, max_participants: Number(e.target.value) }))
                  }
                >
                  <option value={4}>4</option>
                  <option value={8}>8</option>
                  <option value={16}>16</option>
                  <option value={32}>32</option>
                  <option value={64}>64</option>
                </select>
              </label>

              <label className="tournament-description-field">
                Descripción o Reglas Especiales
                <textarea
                  rows={3}
                  placeholder="Información adicional sobre el torneo, premios o formato de tiempo..."
                  value={createForm.description}
                  onChange={(e) => setCreateForm((f) => ({ ...f, description: e.target.value }))}
                />
              </label>

              <label>Lugar<input value={createForm.location} maxLength={180} onChange={(e)=>setCreateForm({...createForm,location:e.target.value})}/></label>
              <label>Fecha y hora local (opcional)<input type="datetime-local" value={createForm.scheduled_at} onChange={(e)=>setCreateForm({...createForm,scheduled_at:e.target.value})}/></label>
              <p className="ui-status">{createForm.competition_format === "teams"
                ? "Al publicar, el torneo aparecerá en el listado público. La organización registra los equipos."
                : "Al publicar, el torneo aparecerá en el listado público y se abrirán las inscripciones."}</p>
              {formErrors.create && <p className="error-message" role="alert">{formErrors.create}</p>}
              <div className="tournament-create-actions">
                <button type="button" className="admin-btn" disabled={Boolean(submitting)} onClick={closeModal}>Cancelar</button>
                <button type="submit" value="draft" disabled={Boolean(submitting)} className="admin-secondary">Guardar borrador</button>
                <button type="submit" value="publish" disabled={Boolean(submitting)} className="admin-primary">Crear y publicar</button>
                {submitting === "create" && <span role="status">Guardando torneo…</span>}
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
