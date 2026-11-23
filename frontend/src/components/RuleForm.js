import React, { useState, useEffect, useId, useRef } from "react";
import "./RuleForm.css";

const officialSources = ["bgg", "admin"];

export const SOURCE_OPTIONS = [
    { value: "bgg", label: "BoardGameGeek" },
    { value: "admin", label: "Equipo de Ludisist" },
    { value: "house", label: "Aporte propio" },
    { value: "community", label: "Comunidad" },
];

function sourceOptions(isOfficial) {
    return SOURCE_OPTIONS.filter(({ value }) => officialSources.includes(value) === isOfficial);
}

export default function RuleForm({ rule, games, onSave, onCancel, fixedGameId, canCreateGlobal = false }) {
    const [form, setForm] = useState({
        title: "",
        content: "",
        rule_type: "gameplay",
        game_id: fixedGameId || "",
        is_official: true,
        source: "bgg",
        visibility: canCreateGlobal ? "global" : "private",
    });
    const [errors, setErrors] = useState({});
    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState("");
    const pending = useRef(false);
    const id = useId();

    useEffect(() => {
        if (rule) {
            const isOfficial = rule.is_official ?? true;
            const sources = sourceOptions(isOfficial);
            setForm({
                title: rule.title || "",
                content: rule.content || "",
                rule_type: rule.rule_type || "gameplay",
                game_id: rule.game_id || fixedGameId || "",
                is_official: isOfficial,
                source: sources.find(({ value }) => value === rule.source)?.value ?? sources[0].value,
                visibility: rule.visibility || "global",
            });
        } else if (fixedGameId) {
            setForm(prev => ({ ...prev, game_id: fixedGameId }));
        }
    }, [rule, fixedGameId, canCreateGlobal]);

    const handleChange = e => {
        const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
        setForm({ ...form, [e.target.name]: value });
        setErrors((current) => ({ ...current, [e.target.name]: "" }));
    };

    const handleSubmit = async e => {
        e.preventDefault();
        if (pending.current) return;
        const nextErrors = {};
        if (!form.game_id) nextErrors.game_id = "Selecciona un juego.";
        if (form.title.trim().length < 3) nextErrors.title = "Mínimo 3 caracteres.";
        if (form.content.trim().length < 10) nextErrors.content = "Mínimo 10 caracteres.";
        setErrors(nextErrors);
        if (Object.keys(nextErrors).length) return;
        pending.current = true;
        setSaving(true);
        setSaveError("");
        try {
            await onSave({ ...form, title: form.title.trim(), content: form.content.trim() });
        } catch (error) {
            setSaveError(error.message || "No se pudo guardar la regla.");
        } finally {
            pending.current = false;
            setSaving(false);
        }
    };

    const ruleTypes = [
        { value: "setup", label: "Preparación" },
        { value: "gameplay", label: "Jugabilidad" },
        { value: "scoring", label: "Puntuación" },
        { value: "faq", label: "FAQ" },
        { value: "quick_start", label: "Inicio Rápido" },
    ];

    return (
        <form onSubmit={handleSubmit} className="rule-form" noValidate>
            <fieldset className="rule-form-fields" disabled={saving}>
            <h3>{rule ? "Editar Regla" : "Nueva Regla"}</h3>

            {!fixedGameId && (
                <div className="form-group rule-game-field">
                    <label htmlFor={`${id}-game_id`}>Juego</label>
                    <select className={errors.game_id ? "field-invalid" : ""} id={`${id}-game_id`} name="game_id" value={form.game_id} onChange={handleChange} required>
                        <option value="">Selecciona un juego...</option>
                        {games.map(g => (
                            <option key={g.id} value={g.id}>{g.name}</option>
                        ))}
                    </select>
                    {errors.game_id && <small className="field-error">{errors.game_id}</small>}
                </div>
            )}

            <div className="form-group rule-title-field">
                <label htmlFor={`${id}-title`}>Título</label>
                <input
                    type="text"
                    id={`${id}-title`} name="title"
                    placeholder="Ej: Cómo ganar puntos"
                    value={form.title}
                    className={errors.title ? "field-invalid" : ""}
                    onChange={handleChange}
                    required
                />
                {errors.title && <small className="field-error">{errors.title}</small>}
            </div>

            <div className="form-group rule-type-field">
                <label htmlFor={`${id}-rule_type`}>Tipo de Regla</label>
                <select id={`${id}-rule_type`} name="rule_type" value={form.rule_type} onChange={handleChange}>
                    {ruleTypes.map(rt => (
                        <option key={rt.value} value={rt.value}>{rt.label}</option>
                    ))}
                </select>
            </div>

            <div className="form-group rule-source-field">
                <label htmlFor={`${id}-source`}>Origen</label>
                <select id={`${id}-source`} name="source" value={form.source} onChange={handleChange}>
                    {sourceOptions(form.is_official).map(so => (
                        <option key={so.value} value={so.value}>{so.label}</option>
                    ))}
                </select>
            </div>

            <div className="form-group rule-visibility-field">
                <label htmlFor={canCreateGlobal ? `${id}-visibility` : undefined}>Visibilidad</label>
                {canCreateGlobal ? (
                    <select id={`${id}-visibility`} name="visibility" value={form.visibility} onChange={handleChange}>
                        <option value="global">Para todos los usuarios</option>
                        <option value="private">Solo para mí</option>
                    </select>
                ) : (
                    <>
                        <input type="hidden" name="visibility" value="private" />
                        <div className="private-rule-note">
                            Solo para mí
                            <small>Ningún otro usuario podrá consultar esta regla.</small>
                        </div>
                    </>
                )}
            </div>

            <div className="form-group rule-official-field" style={{ flexDirection: 'row', alignItems: 'center', gap: '0.75rem' }}>
                <label style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                    <input
                        type="checkbox"
                        name="is_official"
                        checked={form.is_official}
                        onChange={(e) => {
                            const isOfficial = e.target.checked;
                            setForm(previous => ({
                                ...previous,
                                is_official: isOfficial,
                                source: sourceOptions(isOfficial)[0].value,
                            }));

                        }}
                        style={{ width: '18px', height: '18px' }}
                    />
                    <span>Regla oficial</span>
                </label>
                <span style={{ fontSize: '0.8rem', color: "var(--muted)" }}>
                    {form.is_official ? "Parte del juego original" : "Variante del juego"}
                </span>
            </div>

            <div className="form-group rule-content-field">
                <label htmlFor={`${id}-content`}>Contenido</label>
                <textarea
                    id={`${id}-content`} name="content"
                    placeholder="Describe la regla en detalle..."
                    value={form.content}
                    className={errors.content ? "field-invalid" : ""}
                    onChange={handleChange}
                    rows={5}
                    required
                />
                {errors.content && <small className="field-error">{errors.content}</small>}
            </div>

            </fieldset>

            {saveError && <p className="field-error" role="alert">{saveError}</p>}
            <div className="form-actions">
                <button type="button" onClick={onCancel} disabled={saving} className="btn-secondary">
                    Cancelar
                </button>
                <button type="submit" disabled={saving} className="btn-primary">
                    {saving ? "Guardando…" : rule ? "Guardar cambios" : "Crear regla"}
                </button>
            </div>
        </form>
    );
}
