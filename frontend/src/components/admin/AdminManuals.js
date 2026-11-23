import { confirmAction } from "../../ui/confirmAction";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  LuBookOpen as BookOpen, LuDownload as Download, LuFileText as FileText,
  LuFolderOpen as FolderOpen, LuHardDrive as HardDrive, LuPlus as Plus, LuRefreshCw as Replace,
  LuSearch as Search, LuTrash2 as Trash2, LuUpload as Upload, LuX as X,
} from "react-icons/lu";
import { Link } from "react-router-dom";
import { toast } from "react-toastify";
import {
  deleteGameManual, downloadGameManual, getGameManuals, replaceGameManualFile, uploadGameManual,
} from "../../services/api";
import { adminRequest } from "./adminApi";
import useAdminAction, { AdminActionStatus } from "./useAdminAction";

const emptyForm = { game_id: "", title: "", version: "", language: "", source: "", file: null };

export default function AdminManuals() {
  const action = useAdminAction();
  const [manuals, setManuals] = useState([]);
  const [games, setGames] = useState([]);
  const [query, setQuery] = useState("");
  const [gameId, setGameId] = useState("");
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [replacing, setReplacing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [uploadError, setUploadError] = useState("");
  const uploadPending = useRef(false);

  const load = async () => {
    setLoading(true);
    setLoadError("");
    try {
      const [manualData, gameData] = await Promise.all([
        getGameManuals(),
        adminRequest("/games"),
      ]);
      setManuals(manualData);
      setGames(gameData);
    } catch (error) {
      setLoadError(error.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => manuals.filter((manual) => {
    const matchesGame = !gameId || manual.game_id === gameId;
    const haystack = `${manual.title} ${manual.game_name} ${manual.version} ${manual.language} ${manual.source} ${manual.original_filename} ${manual.uploaded_by}`.toLowerCase();
    return matchesGame && haystack.includes(query.toLowerCase());
  }), [manuals, gameId, query]);

  const metrics = useMemo(() => ({
    documents: manuals.length,
    games: new Set(manuals.map((manual) => manual.game_id)).size,
    pdfs: manuals.filter((manual) => manual.content_type === "application/pdf").length,
    size: manuals.reduce((total, manual) => total + Number(manual.file_size || 0), 0),
  }), [manuals]);

  const closeModal = () => {
    if (uploadPending.current) return;
    setUploadError("");
    setModalOpen(false);
    setReplacing(null);
    setForm(emptyForm);
  };

  const openReplacement = (manual) => {
    setReplacing(manual);
    setForm({ ...emptyForm, game_id: manual.game_id, title: manual.title,
      version: manual.version, language: manual.language || "", source: manual.source || "" });
    setModalOpen(true);
  };

  const submit = async (event) => {
    event.preventDefault();
    if (uploadPending.current) return;
    if (!form.file || form.file.size > 20 * 1024 * 1024) {
      setUploadError("Selecciona un archivo de hasta 20 MB.");
      return;
    }
    uploadPending.current = true;
    setUploadError("");
    setProgress(null);
    setSaving(true);
    try {
      const { file, version, language, source } = form;
      const manual = replacing
        ? await replaceGameManualFile(replacing.id, { file, version, language, source }, setProgress)
        : await uploadGameManual(form, setProgress);
      setManuals((current) => replacing
        ? current.map((item) => item.id === manual.id ? manual : item)
        : [manual, ...current]);
      setReplacing(null);
      setModalOpen(false);
      setForm(emptyForm);
      toast.success(replacing ? "Archivo reemplazado" : "Reglamento publicado");
    } catch (error) {
      setUploadError(error.message);
    } finally {
      uploadPending.current = false;
      setSaving(false);
    }
  };

  const download = (manual) => action.run("Preparando descarga…", async () => {
    await downloadGameManual(manual);
  });

  const remove = (manual) => action.run("Eliminando reglamento…", async () => {
    if (!(await confirmAction(`Eliminar el reglamento "${manual.title}"?`))) return;
    await deleteGameManual(manual.id);
    setManuals((current) => current.filter((item) => item.id !== manual.id));
    toast.success("Reglamento eliminado");
  });

  return (
    <div className="admin-module admin-manuals">
      <div className="module-heading">
        <div>
          <h1>Reglamentos</h1>
          <p>Biblioteca digital, versiones y archivos disponibles por juego</p>
        </div>
        <button className="admin-primary" disabled={loading || Boolean(loadError) || !games.length} onClick={() => setModalOpen(true)}>
          <Plus /> Subir reglamento
        </button>
      </div>

      <p><Link to="/revision-contenido">Revisar avisos de reglamentos</Link></p>
      <AdminActionStatus action={action} />
      {loadError && <div className="admin-empty">
        <p role="alert">No se pudo actualizar la biblioteca. {loadError}</p>
        <button type="button" className="admin-secondary" onClick={load}>Reintentar carga</button>
      </div>}
      {!loading && !loadError && games.length === 0 && <p>Agrega un juego para poder publicar un reglamento.</p>}

      <div className="manual-metric-grid">
        <article><FileText /><span>Documentos<strong>{metrics.documents}</strong></span></article>
        <article><FolderOpen /><span>Juegos cubiertos<strong>{metrics.games}</strong></span></article>
        <article><BookOpen /><span>Archivos PDF<strong>{metrics.pdfs}</strong></span></article>
        <article><HardDrive /><span>Espacio utilizado<strong>{formatBytes(metrics.size)}</strong></span></article>
      </div>

      <div className="admin-toolbar">
        <label className="admin-search">
          <Search />
          <input aria-label="Buscar reglamentos" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar título, juego, versión, idioma o fuente" />
        </label>
        <select aria-label="Filtrar por juego" value={gameId} onChange={(event) => setGameId(event.target.value)}>
          <option value="">Todos los juegos</option>
          {games.map((game) => <option key={game.id} value={game.id}>{game.name}</option>)}
        </select>
      </div>

      <section className="admin-panel table-panel">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Reglamento</th>
              <th>Juego</th>
              <th>Versión</th>
              <th>Idioma y fuente</th>
              <th>Archivo</th>
              <th>Publicado por</th>
              <th>Fecha</th>
              <th className="actions">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((manual) => (
              <tr key={manual.id}>
                <td><div className="manual-title-cell"><FileText /><strong>{manual.title}</strong></div></td>
                <td>{manual.game_name}</td>
                <td>{manual.version || <span className="muted">Sin versión</span>}</td>
                <td>{manual.language || "Idioma sin indicar"}<small className="table-summary">{manual.source || "Fuente sin indicar"}</small></td>
                <td><strong>{formatBytes(manual.file_size)}</strong><small className="table-summary">{manual.original_filename}</small></td>
                <td>{manual.uploaded_by}</td>
                <td>{formatDate(manual.created_at)}</td>
                <td className="actions">
                  <button title="Descargar" aria-label={`Descargar ${manual.title}`} disabled={Boolean(action.pending)} onClick={() => download(manual)}><Download /></button>
                  <button type="button" title="Reemplazar archivo" aria-label={`Reemplazar archivo de ${manual.title}`} onClick={() => openReplacement(manual)}><Replace /></button>
                  <button className="danger" title="Eliminar" aria-label={`Eliminar ${manual.title}`} disabled={Boolean(action.pending)} onClick={() => remove(manual)}><Trash2 /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {loading && <div className="admin-loading" role="status">Cargando reglamentos…</div>}
        {!loading && !loadError && filtered.length === 0 && <div className="admin-empty">{manuals.length ? "Ningún reglamento coincide con los filtros." : "Todavía no hay reglamentos publicados."}</div>}
      </section>

      {modalOpen && (
        <div className="admin-modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && closeModal()}>
          <form className="admin-modal manual-admin-modal" onSubmit={submit}>
            <div className="modal-heading">
              <div><small>Biblioteca digital</small><h2>{replacing ? "Reemplazar archivo" : "Subir reglamento"}</h2></div>
              <button type="button" onClick={closeModal} disabled={saving} aria-label="Cerrar"><X /></button>
            </div>
            <div className="manual-admin-fields">
              <label>Juego
                <select disabled={saving || Boolean(replacing)} required value={form.game_id} onChange={(event) => setForm({ ...form, game_id: event.target.value })}>
                  <option value="">Seleccionar juego</option>
                  {games.map((game) => <option key={game.id} value={game.id}>{game.name}</option>)}
                </select>
              </label>
              <label>Versión
                <input disabled={saving} maxLength="50" value={form.version} onChange={(event) => setForm({ ...form, version: event.target.value })} placeholder="Ej. 2.0 o Edición 2024" />
              </label>
              <label className="manual-admin-title">Título
                <input disabled={saving || Boolean(replacing)} required minLength="3" maxLength="255" value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="Ej. Reglamento oficial en español" />
              </label>
              <label>Idioma
                <input disabled={saving} maxLength="50" value={form.language} onChange={(event) => setForm({ ...form, language: event.target.value })} placeholder="Ej. Español" />
              </label>
              <label>Fuente
                <input disabled={saving} maxLength="255" value={form.source} onChange={(event) => setForm({ ...form, source: event.target.value })} placeholder="Ej. Editorial o enlace de origen" />
              </label>
              <label className="manual-admin-file">
                <Upload />
                <span><strong>{form.file?.name || "Seleccionar archivo"}</strong><small>PDF, TXT o Markdown, máximo 20 MB</small></span>
                <input disabled={saving} required type="file" accept=".pdf,.txt,.md,application/pdf,text/plain,text/markdown" onChange={(event) => setForm({ ...form, file: event.target.files?.[0] || null })} />
              </label>
            </div>
            <p className="manual-admin-upload-status">{replacing ? `El archivo «${replacing.original_filename}» dejará de estar disponible. El reglamento conservará su enlace y sus avisos.` : "La publicación agrega un archivo a la biblioteca. Las versiones anteriores siguen disponibles."}</p>
            {saving && <div className="manual-admin-upload-status">
              <p role="status">{progress === 100 ? "Archivo enviado. Esperando confirmación…" : "Subiendo archivo…"}</p>
              {progress !== 100 && <progress max={100} value={progress ?? undefined} aria-label="Progreso de subida del reglamento" />}
            </div>}
            {uploadError && <p className="manual-admin-upload-status error-message" role="alert">No se pudo guardar el reglamento. {uploadError}</p>}
            <footer className="manual-admin-actions">
              <button type="button" className="admin-secondary" disabled={saving} onClick={closeModal}>Cancelar</button>
              <button className="admin-primary" disabled={saving}><Upload /> {saving ? "Guardando…" : replacing ? "Reemplazar archivo" : "Publicar"}</button>
            </footer>
          </form>
        </div>
      )}
    </div>
  );
}

function formatBytes(bytes) {
  if (!bytes) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(value) {
  if (!value) return "Sin fecha";
  return new Intl.DateTimeFormat("es", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(value));
}
