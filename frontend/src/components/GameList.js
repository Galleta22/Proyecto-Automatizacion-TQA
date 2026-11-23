import { confirmAction } from "../ui/confirmAction";
import { useNavigate } from "react-router-dom";
import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { LuBookOpen as BookOpen, LuDice5 as Dice5, LuHeart as Heart, LuLockKeyhole as LockKeyhole, LuSearch as Search, LuStar as Star } from "react-icons/lu";
import { getGames, deleteGame, getRules, getFavoriteGames, setGameFavorite, rateGame, removeGameRating } from "../services/api";
import { getToken, parseJwt } from "../services/auth";
import EditGame from "./EditGame";
import CreateGame from "./CreateGame";
import GameRulesModal from "./GameRulesModal";
import GameManualsModal from "./GameManualsModal";
import GameDetailModal from "./GameDetailModal";
import { toast } from "react-toastify";
import "./GameList.css";
import AdminPagination from "./admin/AdminPagination";

const API_URL = process.env.REACT_APP_API_URL || "http://localhost:8000";
const GUEST_GAME_LIMIT = 9;

export default function GameList() {
  const navigate = useNavigate();
  const [loading,setLoading] = useState(true);
  const [loadError,setLoadError] = useState("");
  const [games, setGames] = useState([]);
  const [rules, setRules] = useState([]);
  const [editingGame, setEditingGame] = useState(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState(0);
  const [syncTotal, setSyncTotal] = useState(0);
  const [searchTerm, setSearchTerm] = useState("");
  const [rulesGame, setRulesGame] = useState(null);
  const [selectedGame, setSelectedGame] = useState(null);
  const [rulesChoiceGame, setRulesChoiceGame] = useState(null);
  const [manualsGame, setManualsGame] = useState(null);
  const [sortOption, setSortOption] = useState("name_asc");
  const [showSyncModal, setShowSyncModal] = useState(false);
  const [selectedSyncIds, setSelectedSyncIds] = useState({});
  const [syncSearch, setSyncSearch] = useState("");
  const [syncFilter, setSyncFilter] = useState("all");
  const [syncOnlyEmpty, setSyncOnlyEmpty] = useState(false);
  const [syncResults, setSyncResults] = useState({});
  const [favoriteIds, setFavoriteIds] = useState(new Set());
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState("20");
  const [pagination, setPagination] = useState({ pages: 1, total: 0 });
  const [syncCatalog, setSyncCatalog] = useState([]);

  const token = getToken();
  const user = token ? parseJwt(token) : null;
  const isLoggedIn = !!token;
  const userRole = user?.role || null;
  // If not logged in, they are not a "player" in system sense, but a guest.
  // isPlayer is used to hide admin buttons.
  // We need a specific check for hiding ALL buttons for guests.
  const isGuest = !isLoggedIn;
  const isPlayer = userRole === 'player';

  const fetchGames = async () => {
    setLoading(true); setLoadError("");
    try {
      const data = await getGames(isLoggedIn ? { paginated: true, page, pageSize, query: searchTerm.trim(), sort: sortOption } : null);
      setGames(Array.isArray(data) ? data : data.items || []);
      setPagination(Array.isArray(data) ? { pages: 1, total: data.length } : data);
    } catch (error) {
      console.error("Fetch games error:", error);
      toast.error("Error al cargar juegos");
      setLoadError(error.message);
    } finally {setLoading(false);}
  };

  const fetchRules = async () => {
    try {
      const data = await getRules();
      setRules(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error("Fetch rules error:", error);
    }
  };


  useEffect(() => {
    const timer = window.setTimeout(fetchGames, 250);
    return () => window.clearTimeout(timer);
  }, [isLoggedIn, page, pageSize, searchTerm, sortOption]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetchRules();
    if (isLoggedIn) {
      getFavoriteGames()
        .then((favorites) => setFavoriteIds(new Set(favorites.map((game) => game.id))))
        .catch((error) => window.dispatchEvent(new CustomEvent("ludisist:request-error", {detail:error.message})));
    }
  }, [isLoggedIn]);

  const toggleFavorite = async (game) => {
    const nextFavorite = !favoriteIds.has(game.id);
    setFavoriteIds((current) => {
      const next = new Set(current);
      if (nextFavorite) next.add(game.id);
      else next.delete(game.id);
      return next;
    });
    try {
      await setGameFavorite(game.id, nextFavorite);
      toast.success(nextFavorite ? `${game.name} añadido a favoritos` : `${game.name} eliminado de favoritos`);
    } catch (error) {
      setFavoriteIds((current) => {
        const reverted = new Set(current);
        if (nextFavorite) reverted.delete(game.id);
        else reverted.add(game.id);
        return reverted;
      });
      toast.error(error.message);
    }
  };

  const updateGameRating = async (gameId, rating) => {
    try {
      const result = rating
        ? await rateGame(gameId, rating)
        : await removeGameRating(gameId);
      setGames((current) => current.map((game) => (
        game.id === gameId ? { ...game, ...result } : game
      )));
      setSelectedGame((current) => (
        current?.id === gameId ? { ...current, ...result } : current
      ));
      toast.success(rating ? "Valoración guardada" : "Valoración eliminada");
    } catch (error) {
      toast.error(error.message);
    }
  };

  const openSyncModal = async () => {
    const allGames = await getGames().catch(() => games);
    setSyncCatalog(allGames);
    const initialSelected = {};
    allGames.forEach(g => { if (g.bgg_id) initialSelected[g.id] = true; });
    setSelectedSyncIds(initialSelected);
    setSyncSearch("");
    setSyncFilter("all");
    setSyncOnlyEmpty(false);
    setSyncResults({});
    setShowSyncModal(true);
  };

  const toggleSyncSelection = (id) => {
    setSelectedSyncIds(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const selectAllSync = () => {
    setSelectedSyncIds((current) => {
      const next = { ...current };
      syncGames.forEach((game) => { if (game.bgg_id) next[game.id] = true; });
      return next;
    });
  };

  const deselectAllSync = () => {
    setSelectedSyncIds({});
  };

  const selectedSyncCount = Object.values(selectedSyncIds).filter(Boolean).length;
  const linkedSyncCount = syncCatalog.filter((game) => game.bgg_id).length;
  const syncGames = syncCatalog.filter((game) => {
    const query = syncSearch.trim().toLowerCase();
    const matchesSearch = !query || game.name.toLowerCase().includes(query) || String(game.bgg_id || "").includes(query);
    const matchesFilter = syncFilter === "all"
      || (syncFilter === "selected" && selectedSyncIds[game.id])
      || (syncFilter === "linked" && game.bgg_id)
      || (syncFilter === "unlinked" && !game.bgg_id);
    return matchesSearch && matchesFilter;
  });

  const runSyncSelected = async () => {
    const ids = Object.entries(selectedSyncIds).filter(([, v]) => v).map(([k]) => k);
    if (ids.length === 0) {
      toast.info("Seleccioná al menos un juego");
      return;
    }
    setSyncing(true);
    setSyncProgress(0);
    setSyncTotal(ids.length);
    setSyncResults((current) => {
      const next = { ...current };
      ids.forEach((id) => { next[id] = { status: "pending", message: "Sincronizando…" }; });
      return next;
    });
    try {
      const res = await fetch(`${API_URL}/games/bgg-sync-selected`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getToken()}`
        },
        body: JSON.stringify({ game_ids: ids, only_empty: syncOnlyEmpty })
      });
      if (!res.ok) throw new Error("Error en sincronización");
      const result = await res.json();
      const nextResults = {};
      (result.success || []).forEach((item) => {
        nextResults[item.id] = {
          status: "success",
          message: item.updated_fields?.length
            ? `${item.updated_fields.length} campos actualizados`
            : "Sin cambios necesarios",
        };
      });
      (result.errors || []).forEach((item) => {
        nextResults[item.id] = { status: "error", message: item.error || "No se pudo sincronizar" };
      });
      setSyncResults((current) => ({ ...current, ...nextResults }));
      setSyncProgress(ids.length);
      if (result.success) {
        toast.success(`${result.success.length} de ${ids.length} juegos sincronizados`);
        if (result.errors && result.errors.length > 0) {
          result.errors.forEach(e => console.warn(`Sync error: ${e.name || e.id} - ${e.error}`));
        }
      }
    } catch (err) {
      setSyncResults((current) => {
        const next = { ...current };
        ids.forEach((id) => { next[id] = { status: "error", message: err.message || "Error de sincronización" }; });
        return next;
      });
      toast.error(err.message || "Error al sincronizar");
    }
    const refreshedCatalog = await getGames().catch(() => null);
    if (refreshedCatalog) setSyncCatalog(refreshedCatalog);
    fetchGames();
    setSyncing(false);
  };

  const handleDelete = async (id) => {
    if (!(await confirmAction("¿Seguro que deseas eliminar este juego?"))) return;
    try {
      await deleteGame(id);
      toast.success("Juego eliminado");
      fetchGames();
    } catch (error) {
      console.error(error);
      toast.error(error.message || "Error al eliminar");
    }
  };

  const getGameImage = (game) => {
    return game.image_url || "/game-placeholder.svg";
  };

  const getComplexityLabel = (rating) => {
    if (!rating) return "N/A";
    if (rating <= 1.5) return "Baja";
    if (rating <= 2.5) return "Media - Baja";
    if (rating <= 3.5) return "Media";
    if (rating <= 4.5) return "Alta";
    return "Muy Alta";
  };

  const filteredGames = games
    .filter((g) => g.name.toLowerCase().includes(searchTerm.toLowerCase()))
    .sort((a, b) => {
      const byName = () => a.name.localeCompare(b.name);
      const compareNumber = (aValue, bValue, direction = 1) => {
        const first = Number.isFinite(Number(aValue)) ? Number(aValue) : 0;
        const second = Number.isFinite(Number(bValue)) ? Number(bValue) : 0;
        return (first - second) * direction;
      };

      switch (sortOption) {
        case "name_asc":
          return a.name.localeCompare(b.name);
        case "name_desc":
          return b.name.localeCompare(a.name);
        case "complexity_asc":
          return compareNumber(a.complexity_rating, b.complexity_rating) || byName();
        case "complexity_desc":
          return compareNumber(a.complexity_rating, b.complexity_rating, -1) || byName();
        case "duration_asc":
          return compareNumber(a.playing_time, b.playing_time) || byName();
        case "duration_desc":
          return compareNumber(a.playing_time, b.playing_time, -1) || byName();
        case "players_asc":
          return compareNumber(a.min_players, b.min_players)
            || compareNumber(a.max_players, b.max_players)
            || byName();
        case "players_desc":
          return compareNumber(a.max_players, b.max_players, -1)
            || compareNumber(a.min_players, b.min_players, -1)
            || byName();
        case "created_desc":
          return new Date(b.created_at) - new Date(a.created_at);
        case "updated_desc":
          return new Date(b.updated_at) - new Date(a.updated_at);
        default:
          return 0;
      }
    });
  const visibleGames = isGuest
    ? filteredGames.slice(0, GUEST_GAME_LIMIT)
    : filteredGames;
  const lockedPreviewGames = isGuest
    ? filteredGames.slice(GUEST_GAME_LIMIT, GUEST_GAME_LIMIT + 3)
    : [];
  const hasLockedGuestGames = lockedPreviewGames.length > 0;

  return (
    <div className="game-list-container">
      <div className="list-header">
        <div className="header-top-row">
          <h2 style={{ color: 'white', margin: 0 }}>Catálogo</h2>
          <div className="search-wrapper">
            <input
              type="text"
              aria-label="Buscar juegos" placeholder="Buscar juegos..."
              className="search-input"
              value={searchTerm}
              onChange={(e) => { setSearchTerm(e.target.value); setPage(1); }}
            />
            {searchTerm && (
              <button className="search-clear" onClick={() => { setSearchTerm(""); setPage(1); }}>✕</button>
            )}
          </div>
        </div>
        <div className="header-bottom-row">
          <div className="toolbar-group">
            <select aria-label="Ordenar catálogo" className="toolbar-select" value={sortOption} onChange={(e) => { setSortOption(e.target.value); setPage(1); }}>
              <optgroup label="Complejidad">
                <option value="complexity_asc">Más fáciles primero</option>
                <option value="complexity_desc">Más difíciles primero</option>
              </optgroup>
              <optgroup label="Duración">
                <option value="duration_asc">Más cortos primero</option>
                <option value="duration_desc">Más largos primero</option>
              </optgroup>
              <optgroup label="Jugadores">
                <option value="players_asc">Menos jugadores primero</option>
                <option value="players_desc">Más jugadores primero</option>
              </optgroup>
              <option value="name_asc">A-Z</option>
              <option value="name_desc">Z-A</option>
              <option value="created_desc">Más Nuevos</option>
              <option value="updated_desc">Recientes (Edición)</option>
            </select>
            {!isGuest && userRole === "facilitador" && (
              <>
                <button className="toolbar-btn toolbar-btn-primary" onClick={() => setShowCreateModal(!showCreateModal)}>
                  + Nuevo Juego
                </button>
                <button className="toolbar-btn toolbar-btn-outline" onClick={openSyncModal} disabled={syncing}>
                  {syncing ? `Sincronizando (${syncProgress}/${syncTotal})...` : "Sincronizar con BGG"}
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {!isGuest && (
        <AdminPagination compact page={page} pages={pagination.pages} total={pagination.total} onChange={setPage} pageSize={pageSize} onPageSizeChange={(value) => { setPageSize(value); setPage(1); }} />
      )}

      {/* Create Modal */}
      {showCreateModal && (
        <div className="modal-overlay catalog-modal-overlay" onClick={(e) => {
          if (e.target === e.currentTarget) setShowCreateModal(false);
        }}>
          <div className="modal-content create-game-modal">
            <CreateGame
              onCreated={() => {
                setShowCreateModal(false);
                fetchGames();
              }}
              onCancel={() => setShowCreateModal(false)}
            />
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {editingGame && (
        <div className="modal-overlay catalog-modal-overlay" onClick={(e) => {
          if (e.target === e.currentTarget) setEditingGame(null);
        }}>
          <div className="modal-content edit-game-modal">
            <EditGame
              game={editingGame}
              onClose={() => setEditingGame(null)}
              onCancel={() => setEditingGame(null)}
              onUpdate={fetchGames}
            />
          </div>
        </div>
      )}

      {/* Rules Choice Popup */}
      {rulesChoiceGame && (
        <div className="modal-overlay" onClick={(e) => {
          if (e.target === e.currentTarget) setRulesChoiceGame(null);
        }}>
          <div className="modal-content rules-choice-popup">
            <h3>¿Qué querés consultar?</h3>
            <p>Elegí qué tipo de contenido querés ver para <strong>{rulesChoiceGame.name}</strong>.</p>
            <div className="rules-choice-options">
              <button className="rules-choice-btn" onClick={() => {
                const game = rulesChoiceGame;
                setRulesChoiceGame(null);
                setManualsGame(game);
              }}>
                <BookOpen />
                <div>
                  Reglamentos digitales
                  <span>Manuales PDF descargables del juego</span>
                </div>
              </button>
              <button className="rules-choice-btn" onClick={() => {
                const game = rulesChoiceGame;
                setRulesChoiceGame(null);
                setRulesGame(game);
              }}>
                <Dice5 />
                <div>
                  Reglas de la casa
                  <span>Reglas personalizadas y consejos de la comunidad</span>
                </div>
              </button>
            </div>
            <button className="rules-choice-cancel" onClick={() => setRulesChoiceGame(null)}>
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Rules Modal */}
      {rulesGame && (
        <div className="modal-overlay catalog-modal-overlay" onClick={(e) => {
          if (e.target === e.currentTarget) setRulesGame(null);
        }}>
          <div className="modal-content game-rules-modal-shell">
            <GameRulesModal
              game={rulesGame}
              onClose={() => setRulesGame(null)}
            />
          </div>
        </div>
      )}

      {/* Manuals Modal */}
      {manualsGame && (
        <GameManualsModal
          game={manualsGame}
          onClose={() => setManualsGame(null)}
        />
      )}

      {/* Detail Modal */}
      <GameDetailModal
        game={selectedGame}
        onClose={() => setSelectedGame(null)}
        isPlayer={isPlayer}
        onEdit={(g) => {
          setSelectedGame(null); // Close detail
          setEditingGame(g);     // Open edit
        }}
        onDelete={(id) => {
          setSelectedGame(null); // Close detail
          handleDelete(id);      // Trigger delete confirmation
        }}
        onRules={(g) => {
          setSelectedGame(null); // Close detail
          navigate(`/juegos/${g.id}?tab=rules`); // Show choice popup
        }}
        onRatingChange={updateGameRating}
      />

      {loading && <p role="status">Cargando catálogo…</p>}
      {loadError && <div role="alert" className="ui-status error">{loadError}<button onClick={fetchGames}>Reintentar</button></div>}
      {!loading && !loadError && !games.length && <p className="ui-status">No hay juegos que coincidan. Cambia la búsqueda.</p>}
      {/* Games Grid */}
      <div className="games-grid">
        {visibleGames.map((game) => (
          <div key={game.id} className="game-card" role="link" tabIndex={0} aria-label={`Ver ${game.name}`} onKeyDown={(e)=>{if(e.target===e.currentTarget && e.key === "Enter")navigate(`/juegos/${game.id}`);}} onClick={() => navigate(`/juegos/${game.id}`)}>
            <div className="game-image-container">
              <img
                src={getGameImage(game)}
                alt={game.name}
                className="game-image"
                onError={(e) => { e.target.onerror = null; e.target.src = "/game-placeholder.svg" }}
              />
              {!isGuest && (
                <button
                  className={`favorite-button ${favoriteIds.has(game.id) ? "active" : ""}`}
                  title={favoriteIds.has(game.id) ? "Quitar de favoritos" : "Añadir a favoritos"}
                  aria-label={favoriteIds.has(game.id) ? `Quitar ${game.name} de favoritos` : `Añadir ${game.name} a favoritos`}
                  onClick={(event) => {
                    event.stopPropagation();
                    toggleFavorite(game);
                  }}
                >
                  <Heart />
                </button>
              )}
            </div>

            <div className="card-content">
              <div className="card-header">
                <h3>{game.name}</h3>
                <span className={`complexity-badge ${game.complexity_rating < 2.5 ? 'baja' : game.complexity_rating < 4 ? 'media' : 'alta'}`}>
                  {getComplexityLabel(game.complexity_rating)}
                </span>
              </div>

              <p className="description">{game.description}</p>

              <div className="card-rating" title={`${game.rating_count || 0} valoraciones`}>
                <Star />
                <strong>{game.rating_count ? Number(game.rating_average).toFixed(1) : "Sin votos"}</strong>
                {!!game.rating_count && <span>({game.rating_count})</span>}
              </div>

              <div className="game-stats">
                <div className="stat">
                  <span className="label">Jugadores</span>
                  <span className="value">{game.min_players}-{game.max_players}</span>
                </div>
                <div className="stat">
                  <span className="label">Duración</span>
                  <span className="value">{game.playing_time}m</span>
                </div>
              </div>

              <div className="card-actions" onClick={(e) => e.stopPropagation()}>
                {/* Admin Actions */}
                {!isGuest && userRole === "facilitador" && (
                  <button
                    onClick={() => setEditingGame(game)}
                    className="btn btn-primary btn-sm"
                  >
                    Editar
                  </button>
                )}

                {/* Rules Button - Only for logged in users */}
                {!isGuest && (
                  <button
                    onClick={() => navigate(`/juegos/${game.id}?tab=rules`)}
                    className="btn btn-secondary btn-sm"
                  >
                    Cómo jugar
                  </button>
                )}

                {/* Admin Actions */}
                {!isGuest && userRole === "facilitador" && (
                  <button
                    onClick={() => handleDelete(game.id)}
                    className="btn btn-danger btn-sm"
                  >
                    Eliminar
                  </button>
                )}

                {/* Guest Message (Optional, or just empty) */}
                {isGuest && (
                  <span style={{ fontSize: '0.8rem', color: '#94a3b8', fontStyle: 'italic' }}>
                    Inicia sesión para ver acciones
                  </span>
                )}
              </div>
            </div>
          </div>
        ))}

        {hasLockedGuestGames && (
          <section className="guest-catalog-gate" aria-label="Contenido disponible al iniciar sesión">
            <div className="guest-locked-preview" aria-hidden="true">
              {lockedPreviewGames.map((game) => (
                <div className="guest-preview-game" key={game.id}>
                  <img src={getGameImage(game)} alt="" />
                  <div>
                    <strong>{game.name}</strong>
                    <span>{game.min_players}-{game.max_players} jugadores</span>
                  </div>
                </div>
              ))}
            </div>

            <div className="guest-catalog-message">
              <LockKeyhole aria-hidden="true" />
              <strong>Hay más juegos esperando por ti</strong>
              <span>Inicia sesión o crea una cuenta para explorar el catálogo completo.</span>
              <div className="guest-catalog-actions">
                <Link className="guest-login-link" to="/login">Iniciar sesión</Link>
                <Link className="guest-register-link" to="/register">Crear cuenta</Link>
              </div>
            </div>
          </section>
        )}
      </div>

      {!isGuest && (
        <AdminPagination
          page={page}
          pages={pagination.pages}
          total={pagination.total}
          onChange={setPage}
          pageSize={pageSize}
          onPageSizeChange={(value) => {
            setPageSize(value);
            setPage(1);
          }}
        />
      )}

      {/* Sync Modal */}
      {showSyncModal && (
        <div className="modal-overlay catalog-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setShowSyncModal(false); }}>
          <div className="modal-content sync-game-modal">
            <div className="modal-form">
              <h2>Sincronizar con BGG</h2>
              <p style={{ color: "#94a3b8", marginBottom: "1rem" }}>
                Seleccioná los juegos para actualizar sus datos desde BoardGameGeek
                (imagen, jugadores, duración, complejidad).
              </p>
              <div className="sync-summary">
                <span><strong>{selectedSyncCount}</strong> seleccionados</span>
                <span><strong>{linkedSyncCount}</strong> con vínculo BGG</span>
                <span><strong>{syncCatalog.length - linkedSyncCount}</strong> sin vínculo</span>
              </div>
              <label className="sync-search">
                <Search />
                <input value={syncSearch} onChange={(event) => setSyncSearch(event.target.value)} placeholder="Buscar por nombre o ID BGG" />
              </label>
              <div className="sync-filters" role="group" aria-label="Filtrar juegos para sincronizar">
                {[['all', 'Todos'], ['selected', 'Seleccionados'], ['linked', 'Con BGG'], ['unlinked', 'Sin BGG']].map(([value, label]) => (
                  <button key={value} type="button" className={syncFilter === value ? "active" : ""} onClick={() => setSyncFilter(value)}>{label}</button>
                ))}
              </div>
              <div className="sync-selection-actions">
                <button type="button" className="btn btn-secondary btn-sm" onClick={selectAllSync}>Seleccionar visibles</button>
                <button type="button" className="btn btn-secondary btn-sm" onClick={deselectAllSync}>Deseleccionar todos</button>
              </div>
              <label className="sync-empty-option">
                <input type="checkbox" checked={syncOnlyEmpty} onChange={(event) => setSyncOnlyEmpty(event.target.checked)} />
                <span><strong>Actualizar solo campos vacíos</strong><small>Conserva los datos que editaste manualmente.</small></span>
              </label>
              <div className="sync-game-list">
                {syncGames.map(g => (
                  <div key={g.id} className={`sync-game-item ${selectedSyncIds[g.id] ? "selected" : ""} ${!g.bgg_id ? "disabled" : ""}`}>
                    <input
                      id={`sync-game-${g.id}`}
                      type="checkbox"
                      checked={!!selectedSyncIds[g.id]}
                      onChange={() => toggleSyncSelection(g.id)}
                      disabled={!g.bgg_id}
                    />
                    <label className="sync-game-copy" htmlFor={`sync-game-${g.id}`}>
                      <span className="sync-game-name">{g.name}</span>
                      <small>{g.bgg_id ? `BGG #${g.bgg_id}` : "Sin vínculo BGG"}</small>
                      <small className="sync-game-metadata">
                        {g.min_players || "?"}–{g.max_players || "?"} jugadores · {g.playing_time || "?"} min · Complejidad {g.complexity_rating ? Number(g.complexity_rating).toFixed(1) : "N/D"}
                      </small>
                      {syncResults[g.id] && <small className={`sync-item-result ${syncResults[g.id].status}`}>{syncResults[g.id].message}</small>}
                    </label>
                    <div className="sync-game-side">
                      {g.bgg_id && <a href={`https://boardgamegeek.com/boardgame/${g.bgg_id}`} target="_blank" rel="noreferrer" onClick={(event) => event.stopPropagation()}>Ver en BGG ↗</a>}
                      {(g.game_metadata?.thumbnail_url || g.image_url) && <img src={g.game_metadata?.thumbnail_url || g.image_url} alt="" onError={(event) => { event.currentTarget.style.display = "none"; }} />}
                    </div>
                  </div>
                ))}
                {!syncGames.length && <div className="sync-empty-list">No hay juegos para este filtro.</div>}
              </div>
              <div className="modal-actions" style={{ marginTop: "1rem" }}>
                <button type="button" onClick={() => setShowSyncModal(false)} className="btn-lg btn-secondary">
                  Cancelar
                </button>
                <button type="button" onClick={runSyncSelected} className="btn-lg btn-primary" disabled={syncing || selectedSyncCount === 0}>
                  {syncing ? `Sincronizando (${syncProgress}/${syncTotal})...` : `Sincronizar ${selectedSyncCount} seleccionados`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
