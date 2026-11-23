import React, { useRef, useState } from "react";
import { getToken } from "../services/auth";
import { toast } from "react-toastify";

const API_URL = process.env.REACT_APP_API_URL || "http://localhost:8000";

export default function EditGame({ game, onCancel, onUpdate }) {
  const [form, setForm] = useState({
    name: game.name || "",
    description: game.description || "",
    min_players: game.min_players ?? 1,
    max_players: game.max_players ?? 10,
    playing_time: game.playing_time ?? 60,
    complexity_rating: game.complexity_rating ?? 1.0,
    image_url: game.image_url ?? "",
    bgg_id: game.bgg_id ?? "",
    game_metadata: game.game_metadata || {},
  });
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [selectedPreview, setSelectedPreview] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const pending = useRef(false);

  const handleChange = e => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async e => {
    e.preventDefault();
    if (pending.current) return;
    pending.current = true;
    setSaving(true);
    setSaveError("");
    try {
      const body = { ...form };
      if (body.bgg_id === "") body.bgg_id = null;
      else body.bgg_id = Number(body.bgg_id);
      body.min_players = Number(body.min_players);
      body.max_players = Number(body.max_players);
      body.playing_time = Number(body.playing_time);
      body.complexity_rating = Number(body.complexity_rating);
      const res = await fetch(`${API_URL}/games/${game.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getToken()}`
        },
        body: JSON.stringify(body)
      });

      if (!res.ok) {
        const errorData = await res.json();
        const msg = typeof errorData.detail === 'object'
          ? JSON.stringify(errorData.detail)
          : (errorData.detail || "No se pudo actualizar");
        throw new Error(msg);
      }

      toast.success("¡Actualizado!");
      if (onUpdate) onUpdate();
      if (onCancel) onCancel();
    } catch (err) {
      setSaveError(err.message || "No se pudo guardar el juego.");
    } finally {
      pending.current = false;
      setSaving(false);
    }
  };

  const handleFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch(`${API_URL}/upload`, {
        method: "POST",
        headers: { "Authorization": `Bearer ${localStorage.getItem("token")}` },
        body: formData,
      });

      if (!res.ok) throw new Error("Error al subir imagen");

      const data = await res.json();
      setForm({ ...form, image_url: data.url });
      toast.success("Imagen actualizada");
    } catch (error) {
      console.error(error);
      toast.error("Error al subir la imagen");
    }
  };

  const handleBggSearch = async () => {
    if (!searchQuery.trim()) return;
    setSearching(true);
    setSelectedPreview(null);
    try {
      const res = await fetch(`${API_URL}/games/bgg/search?query=${encodeURIComponent(searchQuery)}`, {
        headers: { Authorization: `Bearer ${getToken()}` }
      });
      if (!res.ok) throw new Error("Error en búsqueda");
      const data = await res.json();
      setSearchResults(data);
    } catch (err) {
      toast.error("Error al buscar en BGG");
    } finally {
      setSearching(false);
    }
  };

  const handleBggPreview = async (bggId) => {
    try {
      const res = await fetch(`${API_URL}/games/bgg-detail/${bggId}`, {
        headers: { Authorization: `Bearer ${getToken()}` }
      });
      if (!res.ok) throw new Error("Error al obtener detalle");
      const data = await res.json();
      setSelectedPreview(data);
    } catch (err) {
      toast.error("Error al obtener detalle de BGG");
    }
  };

  const handleBggSelect = (bggId) => {
    setForm({ ...form, bgg_id: bggId });
    setSearchResults([]);
    setSearchQuery("");
    setSelectedPreview(null);
    toast.success("ID de BGG vinculado");
  };

  return (
    <form onSubmit={handleSubmit} className="modal-form edit-game-form" noValidate>
      <h2>Editar Juego</h2>

      <div className="form-group">
        <label>Nombre del Juego</label>
        <input type="text" name="name" minLength="2" placeholder="Ej: Catan" value={form.name} onChange={handleChange} required />
      </div>

      <div className="form-group">
        <label>Imagen</label>
        <div className="edit-game-image-controls">
          <input
            type="file"
            accept="image/*"
            onChange={handleFileChange}
          />
          {form.image_url && <span style={{ color: 'var(--success-ink)' }}>✓ Tiene Imagen</span>}
        </div>
        <input
          type="text"
          name="image_url"
          placeholder="URL o sube archivo..."
          value={form.image_url}
          onChange={handleChange}
          style={{ marginTop: '0.5rem' }}
        />
      </div>

      <div className="form-group">
        <label>Descripción</label>
        <textarea name="description" placeholder="Breve reseña..." value={form.description} onChange={handleChange} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
        <div className="form-group">
          <label>Min Jugadores</label>
          <input type="number" name="min_players" value={form.min_players} onChange={handleChange} required min="1" />
        </div>
        <div className="form-group">
          <label>Max Jugadores</label>
          <input type="number" name="max_players" value={form.max_players} onChange={handleChange} required min="1" />
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
        <div className="form-group">
          <label>Duración (min)</label>
          <input type="number" name="playing_time" value={form.playing_time} onChange={handleChange} required min="1" />
        </div>
        <div className="form-group">
          <label>Complejidad (1-5)</label>
          <input type="number" name="complexity_rating" value={form.complexity_rating} step="any" min="1" max="5" onChange={handleChange} />
        </div>
      </div>

      <div className="form-group">
        <label>ID de BoardGameGeek (BGG)</label>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <input
            type="number"
            name="bgg_id"
            placeholder="Ej: 134277"
            value={form.bgg_id}
            onChange={handleChange}
            style={{ flex: 1 }}
          />
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => {
            setSearchQuery(form.name);
            setTimeout(() => document.getElementById("bgg-search-input").focus(), 100);
          }}>
            Buscar en BGG
          </button>
        </div>
      </div>

      <div className="form-group">
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <input
            id="bgg-search-input"
            type="text"
            placeholder="Buscar juego en BGG..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handleBggSearch())}
            style={{ flex: 1 }}
          />
          <button type="button" className="btn btn-secondary btn-sm" onClick={handleBggSearch} disabled={searching}>
            {searching ? "Buscando..." : "Buscar"}
          </button>
        </div>

        {searchResults.length > 0 && (
          <ul style={{ listStyle: "none", padding: 0, marginTop: "0.5rem", maxHeight: "none", overflowY: "visible" }}>
            {searchResults.map((r) => (
              <li key={r.bgg_id} style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                padding: "0.4rem 0.5rem", borderBottom: "1px solid var(--border)", cursor: "pointer"
              }}
                onMouseEnter={() => handleBggPreview(r.bgg_id)}
                role="button" tabIndex={0} onKeyDown={(e)=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();handleBggSelect(r.bgg_id);}}} onClick={() => handleBggSelect(r.bgg_id)}
              >
                <span>{r.name} <small style={{ color: "var(--muted)" }}>({r.year})</small></span>
                <button type="button" className="btn btn-primary btn-sm">Vincular</button>
              </li>
            ))}
          </ul>
        )}

        {selectedPreview && (
          <div style={{ marginTop: "0.5rem", padding: "0.5rem", background: "var(--surface-raised)", borderRadius: "8px", fontSize: "0.85rem" }}>
            <strong>{selectedPreview.name}</strong>
            {selectedPreview.image_url && (
              <img src={selectedPreview.image_url} alt={selectedPreview.name}
                style={{ width: "100%", maxHeight: "120px", objectFit: "cover", borderRadius: "4px", marginTop: "0.3rem" }}
                onError={(e) => e.target.style.display = "none"}
              />
            )}
            <p style={{ margin: "0.3rem 0", color: "var(--ink)" }}>
              {selectedPreview.min_players}-{selectedPreview.max_players} jug · {selectedPreview.playing_time}min
              {selectedPreview.complexity_rating ? ` · Complejidad: ${selectedPreview.complexity_rating.toFixed(1)}` : ""}
            </p>
            <p style={{ color: "var(--muted)", fontSize: "0.8rem" }}>
              {selectedPreview.description ? selectedPreview.description.substring(0, 200) + "..." : ""}
            </p>
          </div>
        )}
      </div>

      {saveError && <p className="error-message" role="alert">{saveError}</p>}
      <div className="modal-actions">
        <button disabled={saving} type="button" onClick={onCancel} className="btn-lg btn-secondary">
          Cancelar
        </button>
        <button type="submit" disabled={saving} className="btn-lg btn-primary">
          {saving ? "Guardando…" : "Guardar cambios"}
        </button>
      </div>
    </form>
  );
}
