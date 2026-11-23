import { confirmAction } from "../../ui/confirmAction";
import React, { useEffect, useState } from "react";
import {
  LuSquarePen as Edit3, LuPlus as Plus, LuRefreshCw as RefreshCw,
  LuTrash2 as Trash2, LuX as X,
} from "react-icons/lu";
import { Link, useSearchParams } from "react-router-dom";
import { toast } from "react-toastify";
import CreateGame from "../CreateGame";
import EditGame from "../EditGame";
import { adminRequest } from "./adminApi";
import useAdminAction, { AdminActionStatus } from "./useAdminAction";
import AdminPagination from "./AdminPagination";
import useAdminList from "./useAdminList";

export default function AdminGames() {
  const action = useAdminAction();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedCoverage = searchParams.get("cobertura");
  const coverage = ["without_images", "without_rules"].includes(requestedCoverage) ? requestedCoverage : "all";
  const [query, setQuery] = useState("");
  const [modal, setModal] = useState(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState("20");
  const params = new URLSearchParams({
    paginated: "true", page: String(page), page_size: pageSize === "all" ? "20" : pageSize,
    all_items: String(pageSize === "all"), q: query, coverage,
  });
  const { data, loading, error, retry } = useAdminList(`/games?${params}`);
  const games = data?.items || [];

  useEffect(() => {
    if (!loading && !error && data && page > data.pages) setPage(data.pages);
  }, [data, error, loading, page]);

  const changeCoverage = (event) => {
    const value = event.target.value;
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      if (value === "all") next.delete("cobertura");
      else next.set("cobertura", value);
      return next;
    });
    setPage(1);
  };

  const remove = (game) => action.run("Eliminando juego…", async () => {
    if (!(await confirmAction(`Eliminar ${game.name} y sus datos asociados?`))) return;
    await adminRequest(`/games/${game.id}`, { method: "DELETE" }); toast.success("Juego eliminado"); retry();
  });
  const sync = (game) => action.run("Sincronizando con BGG…", async () => {
    await adminRequest(`/games/${game.id}/bgg-sync`, { method: "POST" }); toast.success(`${game.name} sincronizado`); retry();
  });

  return <div className="admin-module">
    <div className="module-heading"><div><h1>Juegos</h1><p>Catálogo, datos BGG y cobertura de reglas</p></div><button className="admin-primary" onClick={() => setModal({ type: "create" })}><Plus /> Nuevo juego</button></div>
    <div className="admin-toolbar admin-user-filters">
      <label>Buscar juego<input maxLength={100} value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} /></label>
      <label>Cobertura<select value={coverage} onChange={changeCoverage}>
        <option value="all">Todos los juegos</option>
        <option value="without_images">Sin imagen</option>
        <option value="without_rules">Sin reglas rápidas publicadas</option>
      </select></label>
    </div>
    <div className="game-rule-counts game-rule-legend">
      <span className="game-rule-public">Públicas</span>
      <span className="game-rule-private">Privadas</span>
    </div>
    <AdminActionStatus action={action} />
    {loading && <p role="status">Cargando juegos…</p>}
    {error && <div className="admin-empty">
      <p role="alert">No se pudo actualizar el catálogo. {error}</p>
      <button type="button" className="admin-secondary" onClick={retry}>Reintentar carga</button>
    </div>}
    <section className="admin-panel table-panel"><table className="admin-table">
      <thead><tr><th>Juego</th><th>Jugadores</th><th>Duración</th><th>Reglas rápidas</th><th>BGG</th><th className="actions">Acciones</th></tr></thead>
      <tbody>{!loading&&!error&&!games.length&&<tr><td colSpan={6}>No hay juegos que coincidan con los filtros.</td></tr>}{games.map((game) => <tr key={game.id}>
        <td><div className="game-cell">{game.image_url ? <img src={game.image_url} alt="" /> : <span className="game-placeholder" />}<div><strong><Link to={`/juegos/${game.id}`}>{game.name}</Link></strong><small>{game.description?.slice(0, 65) || "Sin descripción"}</small></div></div></td>
        <td>{game.min_players}-{game.max_players}</td><td>{game.playing_time || 0} min</td>
        <td><div className="game-rule-counts">
          <span className="game-rule-label game-rule-public">{game.quick_rule_count} públicas</span>
          <span className="game-rule-label game-rule-private">{game.private_quick_rule_count ?? 0} privadas</span>
        </div></td>
        <td>{game.bgg_id || <span className="muted">Sin vínculo</span>}</td>
        <td className="actions">{game.bgg_id && <button title="Sincronizar BGG" aria-label={`Sincronizar BGG ${game.name}`} disabled={Boolean(action.pending)} onClick={() => sync(game)}><RefreshCw /></button>}<button title="Editar" aria-label={`Editar ${game.name}`} onClick={() => setModal({ type: "edit", game })}><Edit3 /></button><button className="danger" title="Eliminar" aria-label={`Eliminar ${game.name}`} disabled={Boolean(action.pending)} onClick={() => remove(game)}><Trash2 /></button></td>
      </tr>)}</tbody>
    </table>{data && <AdminPagination page={data.page} pages={data.pages} total={data.total} onChange={setPage} pageSize={pageSize} onPageSizeChange={(value) => { setPageSize(value); setPage(1); }} />}</section>
    {modal && <div className="admin-modal-backdrop"><div className="admin-modal wide"><div className="modal-heading"><h2>{modal.type === "create" ? "Nuevo juego" : "Editar juego"}</h2><button aria-label="Cerrar ventana" onClick={() => setModal(null)}><X /></button></div>{modal.type === "create" ? <CreateGame onCreated={() => { setModal(null); retry(); }} onCancel={() => setModal(null)} /> : <EditGame game={modal.game} onUpdate={retry} onCancel={() => setModal(null)} />}</div></div>}
  </div>;
}
