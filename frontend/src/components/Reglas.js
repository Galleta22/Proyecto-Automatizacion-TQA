import { confirmAction } from "../ui/confirmAction";
import React, { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { getToken } from "../services/auth";
import { createRule, updateRule, deleteRule } from "../services/api";
import RuleForm from "./RuleForm";
import MarkdownRenderer from "./MarkdownRenderer";
import DigitalManuals from "./DigitalManuals";
import { toast } from "react-toastify";
import { LuPencil, LuPlus, LuTrash2 } from "react-icons/lu";
import "./Reglas.css";

const RULE_TYPE_LABELS = {
    setup: "Preparación",
    gameplay: "Jugabilidad",
    scoring: "Puntuación",
    faq: "FAQ",
    quick_start: "Inicio Rápido",
};


const SOURCE_LABELS = {
    bgg: "BGG",
    admin: "Admin",
    house: "Casera",
    community: "Comunidad",
};

export default function Reglas() {
    const [searchParams,setSearchParams] = useSearchParams();
    const [rules, setRules] = useState([]);
    const [games, setGames] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [editingRule, setEditingRule] = useState(null);
    const [searchTerm, setSearchTerm] = useState("");
    const [selectedGameId, setSelectedGameId] = useState("");
    const [visibilityFilter, setVisibilityFilter] = useState("all");
    const [expandedIds, setExpandedIds] = useState(new Set());
    const [activeSection, setActiveSection] = useState(searchParams.get("section") === "manuals" ? "manuals" : "rules");

    const fetchData = async () => {
        try {
            const token = getToken();
            const headers = token ? { Authorization: `Bearer ${token}` } : {};
            const validBaseUrl = process.env.REACT_APP_API_URL || "http://127.0.0.1:8000";

            const [rulesRes, gamesRes] = await Promise.all([
                fetch(`${validBaseUrl}/rules`, { headers }),
                fetch(`${validBaseUrl}/games`, { headers })
            ]);

            const rulesData = await rulesRes.json();
            const gamesData = await gamesRes.json();

            setRules(Array.isArray(rulesData) ? rulesData : []);
            setGames(Array.isArray(gamesData) ? gamesData : []);
        } catch (error) {
            console.error("Error fetching rules/games", error);
            toast.error("Error al cargar datos");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    const handleCreate = async (formData) => {
        await createRule(formData);
        toast.success("¡Regla creada!");
        setShowForm(false);
        fetchData();
    };

    const handleUpdate = async (formData) => {
        await updateRule(editingRule.id, formData);
        toast.success("¡Regla actualizada!");
        setEditingRule(null);
        fetchData();
    };

    const handleDelete = async (ruleId) => {
        if (!(await confirmAction("¿Seguro que deseas eliminar esta regla?"))) return;
        try {
            await deleteRule(ruleId);
            toast.success("Regla eliminada");
            fetchData();
        } catch (err) {
            toast.error(err.message);
        }
    };

    const toggleExpand = (ruleId) => {
        setExpandedIds(prev => {
            const next = new Set(prev);
            if (next.has(ruleId)) next.delete(ruleId);
            else next.add(ruleId);
            return next;
        });
    };

    // Filter rules based on search term and selected game
    const filteredRules = rules.filter(rule => {
        const matchesSearch = searchTerm === "" ||
            rule.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
            rule.content.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesGame = selectedGameId === "" || rule.game_id === selectedGameId;
        const matchesVisibility = visibilityFilter === "all" || rule.visibility === visibilityFilter;
        return matchesSearch && matchesGame && matchesVisibility;
    });

    // Group filtered rules by game
    const rulesByGame = games.map(game => {
        return {
            ...game,
            gameRules: filteredRules.filter(r => r.game_id === game.id)
        };
    }).filter(g => g.gameRules.length > 0);

    // Helper to check role
    const parseJwt = (token) => {
        try {
            return JSON.parse(atob(token.split('.')[1]));
        } catch (e) {
            return null;
        }
    };

    const token = getToken();
    const user = token ? parseJwt(token) : null;
    const canCreateGlobal = user?.role === "admin" || user?.role === "facilitador";

    const sectionTabs = (
        <div className="resource-tabs rules-section-tabs" role="group" aria-label="Secciones de reglas">
            <button className={activeSection === "rules" ? "active" : ""} aria-pressed={activeSection === "rules"} onClick={() => {setActiveSection("rules");setSearchParams({section:"rules"});}}>Reglas rápidas</button>
            <button className={activeSection === "manuals" ? "active" : ""} aria-pressed={activeSection === "manuals"} onClick={() => {setActiveSection("manuals");setSearchParams({section:"manuals"});}}>Reglamentos digitales</button>
        </div>
    );

    if (activeSection === "manuals") {
        return (
            <div className="reglas-container">
                {sectionTabs}
                {token ? <DigitalManuals games={games} canManage={canCreateGlobal} /> : <p>Los manuales requieren una cuenta. <a href="/login?next=%2Freglas%3Fsection%3Dmanuals">Iniciar sesión</a> · <a href="/register">Crear cuenta</a></p>}
            </div>
        );
    }

    return (
        <div className="reglas-container">
            {sectionTabs}
            <div className="reglas-header rules-resource-heading">
                <div>
                    <h1>Reglas y notas de juego</h1>
                    <p>Consulta las reglas específicas para cada juego de nuestra colección.</p>
                </div>
                {token && <button className="btn-primary rules-resource-action" onClick={() => setShowForm(true)}>
                    <LuPlus aria-hidden="true" /> Nueva regla
                </button>}
            </div>

            {/* Search and Filter Controls */}
            <div className="search-filter-bar">
                <input
                    type="text"
                    aria-label="Buscar en reglas" placeholder="Buscar en reglas…"
                    className="search-input"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                />
                <select
                    aria-label="Filtrar por juego" className="game-filter"
                    value={selectedGameId}
                    onChange={(e) => setSelectedGameId(e.target.value)}
                >
                    <option value="">Todos los juegos</option>
                    {games.map(g => (
                        <option key={g.id} value={g.id}>{g.name}</option>
                    ))}
                </select>
                <select
                    aria-label="Filtrar por visibilidad" className="game-filter"
                    value={visibilityFilter}
                    onChange={(e) => setVisibilityFilter(e.target.value)}
                >
                    <option value="all">Todas las reglas</option>
                    <option value="global">Reglas globales</option>
                    <option value="private">Sólo mis reglas</option>
                </select>
                {(searchTerm || selectedGameId || visibilityFilter !== "all") && (
                    <button
                        className="clear-filters-btn"
                        onClick={() => { setSearchTerm(""); setSelectedGameId(""); setVisibilityFilter("all"); }}
                    >
                        ✕ Limpiar
                    </button>
                )}
            </div>

            {/* Create Modal */}
            {showForm && (
                <div className="modal-overlay rules-form-overlay" onClick={(e) => {
                    if (e.target === e.currentTarget) setShowForm(false);
                }}>
                    <div className="modal-content rules-form-modal">
                        <RuleForm
                            games={games}
                            canCreateGlobal={canCreateGlobal}
                            onSave={handleCreate}
                            onCancel={() => setShowForm(false)}
                        />
                    </div>
                </div>
            )}

            {/* Edit Modal */}
            {editingRule && (
                <div className="modal-overlay rules-form-overlay" onClick={(e) => {
                    if (e.target === e.currentTarget) setEditingRule(null);
                }}>
                    <div className="modal-content rules-form-modal">
                        <RuleForm
                            rule={editingRule}
                            games={games}
                            canCreateGlobal={canCreateGlobal}
                            onSave={handleUpdate}
                            onCancel={() => setEditingRule(null)}
                        />
                    </div>
                </div>
            )}

            {loading ? (
                <div className="loading">Cargando reglamento...</div>
            ) : (
                <div className="rules-grid">
                    {rulesByGame.map(game => (
                        <div key={game.id} className="rule-card">
                            <div className="rule-card-header">
                                <h3>{game.name}</h3>
                                <span className="rule-count">{game.gameRules.length} Reglas</span>
                            </div>
                            <div className="rule-list">
                                {game.gameRules.map(rule => {
                                    const isExpanded = expandedIds.has(rule.id);
                                    return (
                                        <div key={rule.id} className="rule-item-card">
                                            <div
                                                className="rule-item-header"
                                                onClick={() => toggleExpand(rule.id)}
                                            >
                                                <div className="rule-item-header-left">
                                                    <span
                                                        className="expand-icon"
                                                        style={{ transform: isExpanded ? "rotate(90deg)" : "rotate(0deg)" }}
                                                    >
                                                        ▶
                                                    </span>
                                                    <strong>{rule.title}</strong>
                                                    <span className="rule-type-badge">
                                                        {RULE_TYPE_LABELS[rule.rule_type] || rule.rule_type}
                                                    </span>
                                                    {rule.is_official === false && (
                                                        <span className="house-rule-badge">
                                                            {SOURCE_LABELS[rule.source] || "Casera"}
                                                        </span>
                                                    )}
                                                    {rule.visibility === "private" && (
                                                        <span className="private-rule-badge">Privada</span>
                                                    )}
                                                </div>
                                                {(rule.can_edit || rule.can_delete) && (
                                                    <div className="rule-actions rules-resource-tools" onClick={e => e.stopPropagation()}>
                                                        <button
                                                            className="btn-edit"
                                                            style={{ display: rule.can_edit ? undefined : "none" }}
                                                            onClick={() => setEditingRule(rule)}
                                                            title="Editar regla" aria-label="Editar regla"
                                                        >
                                                            <LuPencil aria-hidden="true" />
                                                        </button>
                                                        <button
                                                            className="btn-delete"
                                                            style={{ display: rule.can_delete ? undefined : "none" }}
                                                            onClick={() => handleDelete(rule.id)}
                                                            title="Eliminar regla" aria-label="Eliminar regla"
                                                        >
                                                            <LuTrash2 aria-hidden="true" />
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                            {isExpanded && (
                                                <div className="rule-item-body">
                                                    <MarkdownRenderer content={rule.content} />
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    ))}

                    {rulesByGame.length === 0 && (
                        <div className="no-rules">
                            {searchTerm || selectedGameId
                                ? "No se encontraron reglas con esos filtros."
                                : "No hay reglas registradas aún. ¡Crea la primera!"}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
