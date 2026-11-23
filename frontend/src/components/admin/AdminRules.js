import React, { useEffect, useRef, useState } from "react";
import { LuBot as Bot, LuPlus as Plus, LuSquarePen as Edit, LuTrash2 as Trash, LuX as X } from "react-icons/lu";
import { useSearchParams } from "react-router-dom";
import { toast } from "react-toastify";
import RuleForm, { SOURCE_OPTIONS } from "../RuleForm";
import { confirmAction } from "../../ui/confirmAction";
import AdminPagination from "./AdminPagination";
import { adminRequest } from "./adminApi";
import useAdminList from "./useAdminList";

export default function AdminRules() {
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedVisibility = searchParams.get("visibilidad");
  const visibility = ["global", "private"].includes(requestedVisibility) ? requestedVisibility : "all";
  const [query, setQuery] = useState("");
  const [gameId, setGameId] = useState("");
  const [page, setPage] = useState(1);
  const [modal, setModal] = useState(null);
  const [action, setAction] = useState("");
  const [actionError, setActionError] = useState("");
  const pending = useRef(false);
  const params = new URLSearchParams({ page, page_size: 50, search: query, game_id: gameId, visibility });
  const { data, loading, error, retry } = useAdminList(`/admin/rules?${params}`);
  const catalog = useAdminList("/games");
  const games = catalog.data || [];

  useEffect(() => {
    if (!loading && !error && data && page > data.pages) setPage(data.pages);
  }, [data, error, loading, page]);

  const save = async (payload) => {
    const ruleId = modal.rule?.id;
    await adminRequest(ruleId ? `/rules/${ruleId}` : "/rules", {
      method: ruleId ? "PUT" : "POST", body: JSON.stringify(payload),
    });
    toast.success("Regla guardada");
    setModal(null);
    retry();
  };

  const runAction = async (label, request) => {
    if (pending.current) return;
    pending.current = true;
    setAction(label);
    setActionError("");
    try {
      if (await request()) retry();
    } catch (failure) {
      setActionError(failure.message);
    } finally {
      pending.current = false;
      setAction("");
    }
  };

  const remove = (rule) => runAction("Eliminando regla…", async () => {
    if (!(await confirmAction(`¿Eliminar la regla «${rule.title}»?`))) return false;
    await adminRequest(`/rules/${rule.id}`, { method: "DELETE" });
    toast.success("Regla eliminada");
    return true;
  });

  const processRules = () => runAction("Procesando reglas publicadas…", async () => {
    await adminRequest("/ai/process-rules", { method: "POST", body: JSON.stringify({ game_id: gameId }) });
    toast.success("Reglas publicadas procesadas con IA");
    return true;
  });

  return <div className="admin-module">
    <div className="module-heading">
      <div><h1>Reglas</h1><p>Reglas publicadas y notas privadas de tu cuenta</p></div>
      <button className="admin-primary" disabled={!games.length} onClick={() => setModal({ rule: null })}><Plus /> Nueva regla</button>
    </div>
    <div className="admin-toolbar admin-user-filters">
      <label>Buscar reglas<input value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} /></label>
      <label>Juego<select value={gameId} onChange={(event) => { setGameId(event.target.value); setPage(1); }}>
        <option value="">Todos los juegos</option>{games.map((game) => <option key={game.id} value={game.id}>{game.name}</option>)}
      </select></label>
      <label>Visibilidad<select value={visibility} onChange={(event) => {
        const value = event.target.value;
        setSearchParams((current) => {
          const next = new URLSearchParams(current);
          if (value === "all") next.delete("visibilidad");
          else next.set("visibilidad", value);
          return next;
        });
        setPage(1);
      }}>
        <option value="all">Todas</option><option value="global">Publicadas</option><option value="private">Solo para mí</option>
      </select></label>
      {gameId && <button className="admin-secondary" disabled={Boolean(action)} onClick={processRules}><Bot /> Procesar reglas publicadas con IA</button>}
    </div>
    {catalog.loading && <p role="status">Cargando juegos…</p>}
    {catalog.error && <div className="admin-empty"><p role="alert">No se pudo cargar el selector de juegos. {catalog.error}</p><button className="admin-secondary" onClick={catalog.retry}>Reintentar juegos</button></div>}
    {loading && <p role="status">Cargando reglas…</p>}
    {error && <div className="admin-empty"><p role="alert">No se pudo actualizar el listado. {error}</p><button className="admin-secondary" onClick={retry}>Reintentar reglas</button></div>}
    {action && <p role="status">{action}</p>}
    {actionError && <p role="alert" className="error-message">{actionError}</p>}
    {data?.items.length > 0 && <section className="admin-panel table-panel">
      <table className="admin-table">
        <thead><tr><th>Título</th><th>Juego</th><th>Carácter</th><th>Origen</th><th>Visibilidad</th><th>Creado por</th><th className="actions">Acciones</th></tr></thead>
        <tbody>{data.items.map((rule) => <tr key={rule.id}>
          <td><strong>{rule.title}</strong><small className="table-summary">{rule.content.slice(0, 90)}</small></td>
          <td>{rule.game_name}</td>
          <td><span className="game-rule-label">{rule.is_official ? "Oficial" : "Casera"}</span></td>
          <td>{SOURCE_OPTIONS.find((option) => option.value === rule.source)?.label || rule.source || "Sin indicar"}</td>
          <td>{rule.visibility === "private"
            ? <span className="game-rule-label game-rule-private">Privada</span>
            : <span className="game-rule-label game-rule-public">Pública</span>}</td>
          <td>{rule.added_by_name || "—"}</td>
          <td className="actions">
            <button aria-label={`Editar ${rule.title}`} disabled={!games.length} onClick={() => setModal({ rule })}><Edit /></button>
            <button className="danger" aria-label={`Eliminar ${rule.title}`} disabled={Boolean(action)} onClick={() => remove(rule)}><Trash /></button>
          </td>
        </tr>)}</tbody>
      </table>
    </section>}
    {data && !loading && !error && !data.items.length && <p className="admin-empty">No hay reglas que coincidan con los filtros.</p>}
    {data && <AdminPagination page={data.page} pages={data.pages} total={data.total} onChange={setPage} />}
    {modal && <div className="admin-modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setModal(null)}>
      <div className="admin-modal rule-editor-modal">
        <div className="modal-heading"><h2>{modal.rule ? "Editar regla" : "Nueva regla"}</h2><button aria-label="Cerrar ventana" onClick={() => setModal(null)}><X /></button></div>
        <RuleForm rule={modal.rule} games={games} canCreateGlobal onSave={save} onCancel={() => setModal(null)} />
      </div>
    </div>}
  </div>;
}
