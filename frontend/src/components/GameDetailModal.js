import { confirmAction } from "../ui/confirmAction";
import React, { useEffect, useState } from "react";
import { LuCheck as Check, LuLightbulb as Lightbulb, LuPencil as Pencil, LuPlus as Plus, LuStar as Star, LuTrash2 as Trash2, LuX as X } from "react-icons/lu";
import { toast } from "react-toastify";
import { createGameTip, deleteGameTip, getGameTips, updateGameTip } from "../services/api";
import { getToken } from "../services/auth";
import "./GameDetailModal.css";

const TIP_CATEGORIES = {
    getting_started: "Cómo empezar",
    important_rule: "Regla importante",
    confusing_rule: "Regla confusa",
    strategy: "Estrategia",
    general: "Consejo general",
};

export default function GameDetailModal({ embedded = false, game, onClose, isPlayer, onEdit, onDelete, onRules, onRatingChange }) {
    const [tips, setTips] = useState([]);
    const [loadingTips, setLoadingTips] = useState(false);
    const [showTipForm, setShowTipForm] = useState(false);
    const [editingTipId, setEditingTipId] = useState(null);
    const [tipForm, setTipForm] = useState({ category: "general", content: "" });
    const [savingTip, setSavingTip] = useState(false);

    useEffect(() => {
        if (!game || embedded) return undefined;

        const previousOverflow = document.body.style.overflow;
        const handleKeyDown = (event) => {
            if (event.key === "Escape") onClose();
        };

        document.body.style.overflow = "hidden";
        window.addEventListener("keydown", handleKeyDown);

        return () => {
            document.body.style.overflow = previousOverflow;
            window.removeEventListener("keydown", handleKeyDown);
        };
    }, [game, onClose, embedded]);

    useEffect(() => {
        if (!game) return;
        let active = true;
        setLoadingTips(true);
        getGameTips(game.id)
            .then((data) => {
                if (active) setTips(data);
            })
            .catch((error) => toast.error(error.message))
            .finally(() => {
                if (active) setLoadingTips(false);
            });
        return () => {
            active = false;
        };
    }, [game]);

    if (!game) return null;
    const token = getToken();
    const image = game.image_url || "/game-placeholder.svg";

    const resetTipForm = () => {
        setTipForm({ category: "general", content: "" });
        setEditingTipId(null);
        setShowTipForm(false);
    };

    const handleTipSubmit = async (event) => {
        event.preventDefault();
        if (tipForm.content.trim().length < 10) {
            toast.info("El tip debe tener al menos 10 caracteres");
            return;
        }
        setSavingTip(true);
        try {
            const savedTip = editingTipId
                ? await updateGameTip(editingTipId, tipForm)
                : await createGameTip(game.id, tipForm);
            setTips((current) => editingTipId
                ? current.map((tip) => tip.id === savedTip.id ? savedTip : tip)
                : [savedTip, ...current]);
            toast.success(editingTipId ? "Tip actualizado" : "Tip publicado");
            resetTipForm();
        } catch (error) {
            toast.error(error.message);
        } finally {
            setSavingTip(false);
        }
    };

    const startEditingTip = (tip) => {
        setTipForm({ category: tip.category, content: tip.content });
        setEditingTipId(tip.id);
        setShowTipForm(true);
    };

    const handleDeleteTip = async (tipId) => {
        if (!(await confirmAction("¿Eliminar este tip?"))) return;
        try {
            await deleteGameTip(tipId);
            setTips((current) => current.filter((tip) => tip.id !== tipId));
            toast.success("Tip eliminado");
        } catch (error) {
            toast.error(error.message);
        }
    };

    return (
        <div
            className={embedded ? "game-detail-page" : "game-detail-overlay"}
            onMouseDown={(event) => {
                if (event.target === event.currentTarget) onClose();
            }}
        >
            <div className={embedded ? "game-detail-content" : "modal-content game-detail-modal"}>
                {!embedded && <button className="close-btn" aria-label="Cerrar detalle" onClick={onClose}>×</button>}

                <div className="detail-layout">
                    <div className="detail-image-container" style={{ backgroundImage: `url(${image})` }}>
                        <div className="detail-image-blur-overlay" />
                        <img
                            src={image}
                            alt={game.name}
                            className="detail-image"
                            onError={(event) => {
                                event.currentTarget.onerror = null;
                                event.currentTarget.src = "/game-placeholder.svg";
                            }}
                        />
                    </div>

                    <div className="detail-info">
                        {!embedded && <h2>{game.name}</h2>}
                        <div className="badges">
                            <span className="badge-complexity">Complejidad: {Number(game.complexity_rating || 0).toFixed(1)}/5</span>
                            <span className="badge-time">Duración: {game.playing_time} min</span>
                            <span className="badge-players">Jugadores: {game.min_players}-{game.max_players}</span>
                        </div>

                        <div className="game-rating-panel">
                            <div>
                                <strong>{game.rating_count ? Number(game.rating_average).toFixed(1) : "Sin puntuación"}</strong>
                                <span>{game.rating_count || 0} {game.rating_count === 1 ? "valoración" : "valoraciones"}</span>
                            </div>
                            {token ? (
                                <div className="rating-controls" aria-label="Puntuar juego">
                                    {[1, 2, 3, 4, 5].map((value) => (
                                        <button
                                            key={value}
                                            className={value <= (game.user_rating || 0) ? "active" : ""}
                                            title={`${value} de 5`}
                                            aria-label={`${value} de 5`}
                                            onClick={() => onRatingChange(game.id, value)}
                                        >
                                            <Star />
                                        </button>
                                    ))}
                                    {game.user_rating && (
                                        <button className="clear-rating" title="Quitar valoración" aria-label="Quitar valoración" onClick={() => onRatingChange(game.id, null)}>
                                            <Trash2 />
                                        </button>
                                    )}
                                </div>
                            ) : <small>Inicia sesión para puntuar</small>}
                        </div>

                        <div className="detail-description">
                            <h3>Descripción</h3>
                            <p>{game.description}</p>
                        </div>

                        <section className="game-tips-section">
                            <div className="game-tips-heading">
                                <div>
                                    <Lightbulb />
                                    <h3>Tips de la comunidad</h3>
                                </div>
                                {token && !showTipForm && (
                                    <button className="tip-add-button" onClick={() => setShowTipForm(true)} title="Añadir tip">
                                        <Plus />
                                        Añadir
                                    </button>
                                )}
                            </div>

                            {showTipForm && (
                                <form className="tip-form" onSubmit={handleTipSubmit}>
                                    <select
                                        value={tipForm.category}
                                        onChange={(event) => setTipForm((current) => ({ ...current, category: event.target.value }))}
                                        aria-label="Categoría del tip"
                                    >
                                        {Object.entries(TIP_CATEGORIES).map(([value, label]) => (
                                            <option key={value} value={value}>{label}</option>
                                        ))}
                                    </select>
                                    <textarea
                                        value={tipForm.content}
                                        onChange={(event) => setTipForm((current) => ({ ...current, content: event.target.value }))}
                                        placeholder="Comparte algo útil para quienes van a jugar..."
                                        maxLength={800}
                                        rows={4}
                                        autoFocus
                                    />
                                    <div className="tip-form-footer">
                                        <span>{tipForm.content.length}/800</span>
                                        <button type="button" className="tip-icon-button" onClick={resetTipForm} title="Cancelar" aria-label="Cancelar">
                                            <X />
                                        </button>
                                        <button type="submit" className="tip-save-button" disabled={savingTip}>
                                            <Check />
                                            {savingTip ? "Guardando" : editingTipId ? "Actualizar" : "Publicar"}
                                        </button>
                                    </div>
                                </form>
                            )}

                            {loadingTips ? (
                                <p className="tips-empty">Cargando tips...</p>
                            ) : tips.length === 0 ? (
                                <p className="tips-empty">Todavía no hay tips para este juego.</p>
                            ) : (
                                <div className="tips-list">
                                    {tips.map((tip) => (
                                        <article className={`tip-item tip-${tip.category}`} key={tip.id}>
                                            <div className="tip-item-meta">
                                                <span className="tip-category">{TIP_CATEGORIES[tip.category] || TIP_CATEGORIES.general}</span>
                                                <span>por {tip.author}</span>
                                                {(tip.can_edit || tip.can_delete) && (
                                                    <div className="tip-item-actions">
                                                        {tip.can_edit && (
                                                            <button onClick={() => startEditingTip(tip)} title="Editar tip" aria-label="Editar tip">
                                                                <Pencil />
                                                            </button>
                                                        )}
                                                        {tip.can_delete && (
                                                            <button onClick={() => handleDeleteTip(tip.id)} title="Eliminar tip" aria-label="Eliminar tip">
                                                                <Trash2 />
                                                            </button>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                            <p>{tip.content}</p>
                                        </article>
                                    ))}
                                </div>
                            )}
                        </section>

                        <div className="detail-actions">
                            {token && <button onClick={() => onRules(game)} className="btn btn-secondary">Ver reglas</button>}
                            {token && !isPlayer && (
                                <>
                                    <button onClick={() => onEdit(game)} className="btn btn-primary">Editar juego</button>
                                    <button onClick={() => onDelete(game.id)} className="btn btn-danger">Eliminar</button>
                                </>
                            )}
                            {!token && <p className="detail-guest-message">Inicia sesión para ver reglas y herramientas.</p>}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
