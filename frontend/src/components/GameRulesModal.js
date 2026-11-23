import { confirmAction } from "../ui/confirmAction";
import React, { useState, useEffect, useCallback } from "react";
import { getRules, createRule, updateRule, deleteRule } from "../services/api";
import { getToken, parseJwt } from "../services/auth";
import RuleForm from "./RuleForm";
import MarkdownRenderer from "./MarkdownRenderer";
import { toast } from "react-toastify";
import "./GameRulesModal.css";

const RULE_TYPE_LABELS = {
    setup: "Preparación",
    gameplay: "Jugabilidad",
    scoring: "Puntuación",
    faq: "FAQ",
    quick_start: "Inicio Rápido",
};

const RULE_TYPE_COLORS = {
    setup: "#22c55e",
    gameplay: "#3b82f6",
    scoring: "#f59e0b",
    faq: "#a855f7",
    quick_start: "#ec4899",
};

const SOURCE_LABELS = {
    bgg: "BGG",
    admin: "Admin",
    house: "Casera",
    community: "Comunidad",
};

export default function GameRulesModal({ game, onClose }) {
    const [rules, setRules] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [editingRule, setEditingRule] = useState(null);
    const [activeTab, setActiveTab] = useState("all");
    const [expandedIds, setExpandedIds] = useState(new Set());
    const [showOfficial, setShowOfficial] = useState("all"); // "all", "official", "house"
    const [visibilityFilter, setVisibilityFilter] = useState("all");

    const token = getToken();
    const userRole = token ? parseJwt(token)?.role : null;
    const canCreateGlobal = userRole === "admin" || userRole === "facilitador";

    const fetchRules = useCallback(async () => {
        try {
            const allRules = await getRules();
            const gameRules = allRules.filter(r => r.game_id === game.id);
            setRules(gameRules);
            // Expand first rule by default
            if (gameRules.length > 0) {
                setExpandedIds(new Set([gameRules[0].id]));
            }
        } catch (err) {
            toast.error("Error al cargar reglas");
        } finally {
            setLoading(false);
        }
    }, [game.id]);

    useEffect(() => {
        fetchRules();
    }, [fetchRules]);

    const handleCreate = async (formData) => {
        await createRule({ ...formData, game_id: game.id });
        toast.success("¡Regla creada!");
        setShowForm(false);
        fetchRules();
    };

    const handleUpdate = async (formData) => {
        await updateRule(editingRule.id, formData);
        toast.success("¡Regla actualizada!");
        setEditingRule(null);
        fetchRules();
    };

    const handleDelete = async (ruleId) => {
        if (!(await confirmAction("¿Eliminar esta regla?"))) return;
        try {
            await deleteRule(ruleId);
            toast.success("Regla eliminada");
            fetchRules();
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

    // Compute tabs based on available rule types
    const typeCounts = {};
    rules.forEach(r => {
        typeCounts[r.rule_type] = (typeCounts[r.rule_type] || 0) + 1;
    });

    const tabs = [
        { id: "all", label: "Todas", count: rules.length },
        ...Object.entries(RULE_TYPE_LABELS)
            .filter(([key]) => typeCounts[key])
            .map(([key, label]) => ({
                id: key,
                label,
                count: typeCounts[key],
                color: RULE_TYPE_COLORS[key],
            })),
    ];

    const filteredRules = (activeTab === "all"
        ? rules
        : rules.filter(r => r.rule_type === activeTab)
    ).filter(r => {
        if (showOfficial === "official") return r.is_official !== false;
        if (showOfficial === "house") return r.is_official === false;
        return true;
    }).filter(r => visibilityFilter === "all" || r.visibility === visibilityFilter);

    return (
        <div className="game-rules-modal">
            <div className="modal-header">
                <h3>Reglas de {game.name}</h3>
                <button className="close-btn" onClick={onClose}>×</button>
            </div>

            {showForm ? (
                <RuleForm
                    fixedGameId={game.id}
                    games={[game]}
                    canCreateGlobal={canCreateGlobal}
                    onSave={handleCreate}
                    onCancel={() => setShowForm(false)}
                />
            ) : editingRule ? (
                <RuleForm
                    rule={editingRule}
                    fixedGameId={game.id}
                    games={[game]}
                    canCreateGlobal={canCreateGlobal}
                    onSave={handleUpdate}
                    onCancel={() => setEditingRule(null)}
                />
            ) : (
                <>
                    {/* Tabs by rule type */}
                    {rules.length > 0 && (
                        <div className="rules-tabs">
                            {tabs.map(tab => (
                                <button
                                    key={tab.id}
                                    className={`rules-tab ${activeTab === tab.id ? "active" : ""}`}
                                    onClick={() => setActiveTab(tab.id)}
                                >
                                    {tab.label}
                                    <span className="tab-count" style={tab.color ? { background: tab.color + "33", color: tab.color } : {}}>
                                        {tab.count}
                                    </span>
                                </button>
                            ))}
                            <div style={{ flex: 1 }} />
                            <select
                                className="house-filter-select"
                                value={showOfficial}
                                onChange={(e) => setShowOfficial(e.target.value)}
                                title="Filtrar por tipo de regla"
                            >
                                <option value="all">Todas</option>
                                <option value="official">Oficiales</option>
                                <option value="house">Caseras</option>
                            </select>
                            <select
                                className="house-filter-select"
                                value={visibilityFilter}
                                onChange={(e) => setVisibilityFilter(e.target.value)}
                                title="Filtrar por visibilidad"
                            >
                                <option value="all">Todas</option>
                                <option value="global">Globales</option>
                                <option value="private">Sólo mías</option>
                            </select>
                        </div>
                    )}

                    <div className="rules-list-container">
                        {loading ? (
                            <p className="loading-text">Cargando...</p>
                        ) : filteredRules.length === 0 ? (
                            <p className="no-rules-text">
                                {activeTab === "all"
                                    ? "Este juego no tiene reglas aún."
                                    : `No hay reglas de tipo "${RULE_TYPE_LABELS[activeTab] || activeTab}".`}
                            </p>
                        ) : (
                            <div className="game-rules-list">
                                {filteredRules.map(rule => {
                                    const isExpanded = expandedIds.has(rule.id);
                                    const typeColor = RULE_TYPE_COLORS[rule.rule_type] || "#a855f7";
                                    return (
                                        <div key={rule.id} className="game-rule-card">
                                            <div
                                                className="game-rule-header"
                                                onClick={() => toggleExpand(rule.id)}
                                                style={{ cursor: "pointer" }}
                                            >
                                                <div className="game-rule-header-left">
                                                    <span
                                                        className="expand-icon"
                                                        style={{ transform: isExpanded ? "rotate(90deg)" : "rotate(0deg)" }}
                                                    >
                                                        ▶
                                                    </span>
                                                    <strong>{rule.title}</strong>
                                                    <span
                                                        className="rule-type-badge"
                                                        style={{
                                                            background: typeColor + "22",
                                                            color: typeColor,
                                                            border: `1px solid ${typeColor}44`,
                                                        }}
                                                    >
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
                                                    <div className={`game-rule-actions ${rule.can_edit ? "" : "no-edit"} ${rule.can_delete ? "" : "no-delete"}`} onClick={e => e.stopPropagation()}>
                                                        <button onClick={() => setEditingRule(rule)} className="edit-btn" title="Editar">✏️</button>
                                                        <button onClick={() => handleDelete(rule.id)} className="delete-btn" title="Eliminar">🗑️</button>
                                                    </div>
                                                )}
                                            </div>
                                            {isExpanded && (
                                                <div className="game-rule-body">
                                                    <MarkdownRenderer content={rule.content} />
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    {true && (
                        <button className="add-rule-btn" onClick={() => setShowForm(true)}>
                            + Añadir Regla
                        </button>
                    )}
                </>
            )}
        </div>
    );
}
