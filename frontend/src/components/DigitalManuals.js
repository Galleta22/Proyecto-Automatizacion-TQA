import { ReportManual } from "./ContentReview";
import { confirmAction } from "../ui/confirmAction";
import React, { useEffect, useMemo, useState } from "react";
import {
    LuBookOpen as BookOpen, LuDownload as Download, LuFileText as FileText,
    LuSearch as Search, LuTrash2 as Trash2, LuUpload as Upload, LuX as X,
} from "react-icons/lu";
import { toast } from "react-toastify";
import { deleteGameManual, downloadGameManual, getGameManuals, uploadGameManual } from "../services/api";
import "./DigitalManuals.css";

const emptyForm = { game_id: "", title: "", version: "", file: null };

export default function DigitalManuals({ games, canManage }) {
    const [manuals, setManuals] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");
    const [gameFilter, setGameFilter] = useState("");
    const [showUpload, setShowUpload] = useState(false);
    const [form, setForm] = useState(emptyForm);
    const [saving, setSaving] = useState(false);

    const loadManuals = async () => {
        setLoading(true);
        try {
            setManuals(await getGameManuals());
        } catch (error) {
            toast.error(error.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadManuals();
    }, []);

    const filteredManuals = useMemo(() => manuals.filter((manual) => {
        const text = `${manual.title} ${manual.game_name} ${manual.original_filename}`.toLowerCase();
        return (!gameFilter || manual.game_id === gameFilter) && text.includes(search.toLowerCase());
    }), [manuals, search, gameFilter]);

    const groupedManuals = useMemo(() => {
        const groups = new Map();
        filteredManuals.forEach((manual) => {
            if (!groups.has(manual.game_id)) {
                groups.set(manual.game_id, {
                    id: manual.game_id,
                    name: manual.game_name,
                    image: manual.game_image_url,
                    manuals: [],
                });
            }
            groups.get(manual.game_id).manuals.push(manual);
        });
        return Array.from(groups.values());
    }, [filteredManuals]);

    const submitManual = async (event) => {
        event.preventDefault();
        if (!form.file) {
            toast.info("Selecciona un archivo");
            return;
        }
        setSaving(true);
        try {
            const manual = await uploadGameManual(form);
            setManuals((current) => [manual, ...current]);
            setForm(emptyForm);
            setShowUpload(false);
            toast.success("Reglamento publicado");
        } catch (error) {
            toast.error(error.message);
        } finally {
            setSaving(false);
        }
    };

    const removeManual = async (manual) => {
        if (!(await confirmAction(`¿Eliminar "${manual.title}"?`))) return;
        try {
            await deleteGameManual(manual.id);
            setManuals((current) => current.filter((item) => item.id !== manual.id));
            toast.success("Reglamento eliminado");
        } catch (error) {
            toast.error(error.message);
        }
    };

    const downloadManual = async (manual) => {
        try {
            await downloadGameManual(manual);
        } catch (error) {
            toast.error(error.message);
        }
    };

    return (
        <section className="digital-manuals">
            <header className="manuals-header rules-resource-heading">
                <div>
                    <span>Biblioteca documental</span>
                    <h2>Reglamentos digitales</h2>
                    <p>Manuales completos y documentos de consulta organizados por juego.</p>
                </div>
                {canManage && <button className="btn-primary rules-resource-action" onClick={() => setShowUpload(true)}><Upload /> Subir reglamento</button>}
            </header>

            <div className="manual-filters">
                <label><Search /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar reglamento o juego" /></label>
                <select value={gameFilter} onChange={(event) => setGameFilter(event.target.value)}>
                    <option value="">Todos los juegos</option>
                    {games.map((game) => <option key={game.id} value={game.id}>{game.name}</option>)}
                </select>
            </div>

            {loading ? <p className="manual-empty">Cargando biblioteca...</p> : groupedManuals.length === 0 ? (
                <div className="manual-empty-state"><BookOpen /><h3>No hay reglamentos disponibles</h3><p>Los documentos publicados aparecerán aquí agrupados por juego.</p></div>
            ) : (
                <div className="manual-game-grid">
                    {groupedManuals.map((group) => (
                        <article className="manual-game-card" key={group.id}>
                            <div className="manual-game-heading">
                                {group.image ? <img src={group.image} alt="" /> : <div><BookOpen /></div>}
                                <span><small>{group.manuals.length} {group.manuals.length === 1 ? "documento" : "documentos"}</small><h3>{group.name}</h3></span>
                            </div>
                            <div className="manual-list">
                                {group.manuals.map((manual) => (
                                    <div className="manual-row" key={manual.id}>
                                        <FileText />
                                        <div>
                                            <strong>{manual.title}</strong>
                                            <span>{manual.version && `Versión ${manual.version} · `}{formatBytes(manual.file_size)} · por {manual.uploaded_by}</span>
                                            <small>{manual.original_filename}</small><ReportManual manual={manual}/>
                                        </div>
                                        <div className="manual-actions rules-resource-tools">
                                            <button onClick={() => downloadManual(manual)} title="Descargar" aria-label="Descargar"><Download /></button>
                                            {manual.can_delete && <button className="manual-delete" onClick={() => removeManual(manual)} title="Eliminar" aria-label="Eliminar"><Trash2 /></button>}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </article>
                    ))}
                </div>
            )}

            {showUpload && (
                <div className="manual-modal-backdrop" onMouseDown={(event) => {
                    if (event.target === event.currentTarget) setShowUpload(false);
                }}>
                    <form className="manual-upload-modal" onSubmit={submitManual}>
                        <header><div><small>Nuevo documento</small><h3>Subir reglamento digital</h3></div><button type="button" onClick={() => setShowUpload(false)} aria-label="Cerrar"><X /></button></header>
                        <div className="manual-upload-fields">
                            <label>Juego<select required value={form.game_id} onChange={(event) => setForm({ ...form, game_id: event.target.value })}><option value="">Seleccionar juego</option>{games.map((game) => <option key={game.id} value={game.id}>{game.name}</option>)}</select></label>
                            <label>Título<input required minLength="3" maxLength="255" value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="Ej. Reglamento oficial en español" /></label>
                            <label>Versión opcional<input maxLength="50" value={form.version} onChange={(event) => setForm({ ...form, version: event.target.value })} placeholder="Ej. 2.0 o Edición 2024" /></label>
                            <label className="manual-file-field"><FileText /><span><strong>{form.file?.name || "Seleccionar archivo"}</strong><small>PDF, TXT o Markdown · máximo 20 MB</small></span><input required type="file" accept=".pdf,.txt,.md,application/pdf,text/plain,text/markdown" onChange={(event) => setForm({ ...form, file: event.target.files?.[0] || null })} /></label>
                        </div>
                        <footer><button type="button" onClick={() => setShowUpload(false)}>Cancelar</button><button className="manual-submit" disabled={saving}><Upload /> {saving ? "Subiendo..." : "Publicar"}</button></footer>
                    </form>
                </div>
            )}
        </section>
    );
}

function formatBytes(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
