import React, { useState } from "react";
import { getToken, parseJwt } from "../services/auth";
import { toast } from "react-toastify";

const API_URL = process.env.REACT_APP_API_URL || "http://localhost:8000";

function ManualCreate({ onCreated, onCancel }) {
  const [form, setForm] = useState({
    name: "",
    description: "",
    min_players: 2,
    max_players: 10,
    playing_time: 60,
    complexity_rating: 1.0,
    image_url: ""
  });
  const [errors, setErrors] = useState({});
  const [saving,setSaving]=useState(false);

  const handleChange = e => {
    setForm({ ...form, [e.target.name]: e.target.value });
    setErrors((current) => ({ ...current, [e.target.name]: "" }));
  };

  const handleSubmit = async e => {
    e.preventDefault();
    const nextErrors = {};
    if (form.name.trim().length < 2) nextErrors.name = "Mínimo 2 caracteres.";
    if (Number(form.min_players) < 1) nextErrors.min_players = "Mínimo 1.";
    if (Number(form.max_players) < Number(form.min_players)) nextErrors.max_players = "Debe ser igual o mayor al mínimo.";
    if (Number(form.playing_time) < 1) nextErrors.playing_time = "Mínimo 1 minuto.";
    if (Number(form.complexity_rating) < 1 || Number(form.complexity_rating) > 5) nextErrors.complexity_rating = "Debe estar entre 1 y 5.";
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length || saving) return;
    setSaving(true);try {
      const res = await fetch(`${API_URL}/games`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getToken()}`
        },
        body: JSON.stringify(form)
      });
      if (!res.ok) {
        const errorData = await res.json();
        const msg = typeof errorData.detail === 'object'
          ? JSON.stringify(errorData.detail)
          : (errorData.detail || "Error al crear juego");
        throw new Error(msg);
      }
      toast.success("¡Juego creado correctamente!");
      if (onCreated) onCreated();
    } catch (err) {
      setErrors({submit:err.message});toast.error(err.message || "No tienes permisos o ocurrió un error");
    } finally {setSaving(false);}
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
      toast.success("Imagen subida correctamente");
    } catch (error) {
      toast.error("Error al subir la imagen");
    }
  };

  return (
    <form onSubmit={handleSubmit} className="modal-form" noValidate>
      <div className="form-group">
        <label>Nombre del Juego</label>
        <input className={errors.name ? "field-invalid" : ""} type="text" name="name" placeholder="Ej: Catan" value={form.name} onChange={handleChange} required />
        {errors.name && <small className="field-error">{errors.name}</small>}
      </div>

      <div className="form-group">
        <label>Imagen</label>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <input type="file" accept="image/*" onChange={handleFileChange} style={{ color: '#fff' }} />
          {form.image_url && <span style={{ color: '#4ade80' }}>✓ Subida</span>}
        </div>
        <input type="text" name="image_url" placeholder="O pega una URL..." value={form.image_url} onChange={handleChange} style={{ marginTop: '0.5rem' }} />
      </div>

      <div className="form-group">
        <label>Descripción</label>
        <textarea name="description" placeholder="Breve reseña del juego..." value={form.description} onChange={handleChange} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
        <div className="form-group">
          <label>Min Jugadores</label>
          <input className={errors.min_players ? "field-invalid" : ""} type="number" name="min_players" value={form.min_players} onChange={handleChange} required min="1" />
          {errors.min_players && <small className="field-error">{errors.min_players}</small>}
        </div>
        <div className="form-group">
          <label>Max Jugadores</label>
          <input className={errors.max_players ? "field-invalid" : ""} type="number" name="max_players" value={form.max_players} onChange={handleChange} required min="1" />
          {errors.max_players && <small className="field-error">{errors.max_players}</small>}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
        <div className="form-group">
          <label>Duración (min)</label>
          <input className={errors.playing_time ? "field-invalid" : ""} type="number" name="playing_time" value={form.playing_time} onChange={handleChange} required min="1" />
          {errors.playing_time && <small className="field-error">{errors.playing_time}</small>}
        </div>
        <div className="form-group">
          <label>Complejidad (1-5)</label>
          <input className={errors.complexity_rating ? "field-invalid" : ""} type="number" name="complexity_rating" value={form.complexity_rating} step="any" min="1" max="5" onChange={handleChange} />
          {errors.complexity_rating && <small className="field-error">{errors.complexity_rating}</small>}
        </div>
      </div>

      <div className="modal-actions">
        {onCancel && (
          <button type="button" onClick={onCancel} className="btn-lg btn-secondary">Cancelar</button>
        )}
        {errors.submit&&<p role="alert">{errors.submit}</p>}<button disabled={saving} type="submit" className="btn-lg btn-primary">{saving?"Guardando…":"Crear juego"}</button>
      </div>
    </form>
  );
}

function PreviewCard({ detail, onImport, importing }) {
  const getComplexityLabel = (r) => {
    if (!r) return "N/A";
    if (r <= 1.5) return "Baja";
    if (r <= 2.5) return "Media-Baja";
    if (r <= 3.5) return "Media";
    if (r <= 4.5) return "Alta";
    return "Muy Alta";
  };

  return (
    <div className="bgg-preview-card">
      {detail.image_url && (
        <img src={detail.image_url} alt={detail.name}
          className="bgg-preview-img"
          onError={(e) => { e.target.style.display = 'none' }}
        />
      )}
      <div className="bgg-preview-body">
        <h3 className="bgg-preview-title">{detail.name}</h3>
        <p className="bgg-preview-desc">
          {detail.description ? detail.description.substring(0, 200) + (detail.description.length > 200 ? '...' : '') : 'Sin descripción'}
        </p>
        <div className="bgg-preview-stats">
          <span>Jugadores: <strong>{detail.min_players}-{detail.max_players}</strong></span>
          <span>Duración: <strong>{detail.playing_time}min</strong></span>
          <span>Complejidad: <strong>{getComplexityLabel(detail.complexity_rating)}</strong></span>
        </div>
        <button
          type="button" className="btn-lg btn-primary"
          onClick={() => onImport(detail.bgg_id)}
          disabled={importing === detail.bgg_id}
          style={{ width: '100%', padding: '0.6rem' }}
        >
          {importing === detail.bgg_id ? "Importando..." : "Importar juego"}
        </button>
      </div>
    </div>
  );
}

function BGGImport({ onCreated, onCancel }) {
  const [searchQuery, setSearchQuery] = useState("");
  const [results, setResults] = useState([]);
  const [resultPage,setResultPage]=useState(1);const [searchError,setSearchError]=useState("");
  const [searching, setSearching] = useState(false);
  const [importing, setImporting] = useState(null);
  const [preview, setPreview] = useState(null);
  const [loadingPreview, setLoadingPreview] = useState(false);

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setSearching(true);setResultPage(1);setSearchError("");
    setResults([]);
    setPreview(null);
    try {
      const res = await fetch(`${API_URL}/games/bgg/search?query=${encodeURIComponent(searchQuery.trim())}`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || "Error al buscar en BGG");
      }
      const data = await res.json();
      setResults(Array.isArray(data) ? data : []);
      if (data.length === 0) toast.info("Sin resultados en BGG");
    } catch (err) {
      setSearchError(err.message);toast.error(err.message);
    } finally {
      setSearching(false);
    }
  };

  const handlePreview = async (bggId) => {
    setLoadingPreview(true);
    setPreview(null);
    try {
      const res = await fetch(`${API_URL}/games/bgg-detail/${bggId}`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!res.ok) throw new Error("Error al obtener detalle");
      const data = await res.json();
      setPreview(data);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoadingPreview(false);
    }
  };

  const handleImport = async (bggId) => {
    setImporting(bggId);
    try {
      const res = await fetch(`${API_URL}/games/bgg-import/${bggId}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || "Error al importar");
      }
      toast.success("¡Juego importado correctamente!");
      if (onCreated) onCreated();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setImporting(null);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter") handleSearch();
  };

  return (
    <div className="modal-form">
      <label className="bgg-search-label" htmlFor="bgg-game-search">Buscar en BoardGameGeek</label>
      <div className="bgg-search-row">
        <input
          id="bgg-game-search"
          type="text"
          placeholder="Nombre del juego en BoardGameGeek..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <button
          type="button" className="btn-lg btn-primary"
          onClick={handleSearch}
          disabled={searching || !searchQuery.trim()}
        >
          {searching ? "Buscando..." : "Buscar"}
        </button>
      </div>

      {searchError&&<p className="ui-status error" role="alert">{searchError}</p>}{searchQuery && results.length > 0 && (
        <p className="bgg-results-count">
          Resultados para "<strong>{searchQuery}</strong>":
        </p>
      )}

      {results.length > 0 && (
        <div className="bgg-results-list">
          {results.slice((resultPage-1)*8,resultPage*8).map((game, i) => (
            <div
              key={game.bgg_id || i}
              className={`bgg-result-item ${preview?.bgg_id === game.bgg_id ? "active" : ""}`}
              onClick={() => handlePreview(game.bgg_id)}
            >
              <div className="bgg-result-info">
                <div className="bgg-result-name">{game.name}</div>
                <div className="bgg-result-meta">ID: {game.bgg_id} · {game.year || '?'}</div>
              </div>
              <button
                type="button" className="btn-sm btn-primary"
                onClick={(e) => { e.stopPropagation(); handlePreview(game.bgg_id) }}
              >
                {loadingPreview ? "..." : "Ver detalle"}
              </button>
            </div>
          ))}
        </div>
      )}

      {results.length>8&&<nav aria-label="Páginas de resultados BGG" className="ui-confirm-actions"><button type="button" disabled={resultPage===1} onClick={()=>setResultPage(resultPage-1)}>Anterior</button><span>{resultPage} de {Math.ceil(results.length/8)}</span><button type="button" disabled={resultPage>=Math.ceil(results.length/8)} onClick={()=>setResultPage(resultPage+1)}>Siguiente</button></nav>}
      {preview && (
        <PreviewCard detail={preview} onImport={handleImport} importing={importing} />
      )}

      <div className="modal-actions" style={{ marginTop: '1rem' }}>
        {onCancel && (
          <button type="button" onClick={onCancel} className="btn-lg btn-secondary">Cancelar</button>
        )}
      </div>
    </div>
  );
}

export default function CreateGame({ onCreated, onCancel }) {
  const [tab, setTab] = useState("manual");
  const userRole = parseJwt(getToken())?.role;
  if (userRole !== "admin" && userRole !== "facilitador") return null;

  return (
    <div>
      <h2 className="create-game-title" style={{ textAlign: 'center', marginBottom: '1.5rem', color: '#fff' }}>Nuevo Juego</h2>
      <div style={{ display: 'flex', gap: 0, marginBottom: '1.5rem', borderBottom: '2px solid rgba(255,255,255,0.1)' }}>
        <button
          aria-pressed={tab==="manual"} onClick={() => setTab("manual")}
          style={{
            flex: 1, padding: '0.7rem', cursor: 'pointer', border: 'none',
            background: tab === "manual" ? 'rgba(79,172,254,0.15)' : 'transparent',
            color: tab === "manual" ? '#4facfe' : '#94a3b8',
            fontWeight: 600, fontSize: '0.9rem',
            borderBottom: tab === "manual" ? '2px solid #4facfe' : '2px solid transparent',
            marginBottom: '-2px', transition: 'all 0.2s',
          }}
        >
          Crear Manualmente
        </button>
        <button
          aria-pressed={tab==="bgg"} onClick={() => setTab("bgg")}
          style={{
            flex: 1, padding: '0.7rem', cursor: 'pointer', border: 'none',
            background: tab === "bgg" ? 'rgba(79,172,254,0.15)' : 'transparent',
            color: tab === "bgg" ? '#4facfe' : '#94a3b8',
            fontWeight: 600, fontSize: '0.9rem',
            borderBottom: tab === "bgg" ? '2px solid #4facfe' : '2px solid transparent',
            marginBottom: '-2px', transition: 'all 0.2s',
          }}
        >
          Importar de BGG
        </button>
      </div>

      {tab === "manual" ? (
        <ManualCreate onCreated={onCreated} onCancel={onCancel} />
      ) : (
        <BGGImport onCreated={onCreated} onCancel={onCancel} />
      )}
    </div>
  );
}
