import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { LuBookOpen as BookOpen, LuBot as Bot, LuCalendarDays, LuDice5 as Dice5, LuMapPin as MapPin, LuUsers, LuClock, LuStar } from "react-icons/lu";
import { getMatchTables, getRandomGame, getGameById, rateGame, removeGameRating } from "../services/api";
import { getToken, parseJwt } from "../services/auth";
import { toast } from "react-toastify";
import GameDetailModal from "./GameDetailModal";
import useTheme from "../ui/useTheme";
import "./BannerInicio.css";

export default function BannerInicio({ user }) {
  const theme = useTheme();
  const heroImage = theme === "light" ? "/assets/ludisist-hero-light.png" : "/assets/hero_board_games_banner_1765570274220.png";
  const loggedIn = !!user;
  const token = getToken();
  const currentUser = token ? parseJwt(token) : null;
  const isPlayer = currentUser?.role === "player";
  const [dailyGame, setDailyGame] = useState(null);
  const [loading, setLoading] = useState(true);
  const [detailGame, setDetailGame] = useState(null);
  const [activeTables, setActiveTables] = useState([]);

  const handleRatingChange = async (gameId, rating) => {
    try {
      const result = rating
        ? await rateGame(gameId, rating)
        : await removeGameRating(gameId);
      setDetailGame((current) => current?.id === gameId ? { ...current, ...result } : current);
      setDailyGame((current) => current?.id === gameId ? { ...current, ...result } : current);
      toast.success(rating ? "Valoración guardada" : "Valoración eliminada");
    } catch (error) {
      toast.error(error.message);
    }
  };

  const pickDailyGame = async () => {
    const today = new Date().toDateString();
    const stored = localStorage.getItem("daily_game");
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        if (parsed.date === today && parsed.game) {
          setDailyGame(await getGameById(parsed.game.id));
          setLoading(false);
          return;
        }
      } catch {}
    }
    try {
      const game = await getRandomGame();
      localStorage.setItem("daily_game", JSON.stringify({ date: today, game }));
      setDailyGame(game);
    } catch {
      setDailyGame(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { pickDailyGame(); }, []);

  useEffect(() => {
    if (!loggedIn) return;
    getMatchTables().then((res) => {
      setActiveTables(Array.isArray(res) ? res.slice(0, 6) : []);
    }).catch((error) => window.dispatchEvent(new CustomEvent("ludisist:request-error", {detail:error.message})));
  }, [loggedIn]);

  const complexityLabel = (r) => {
    if (!r) return "—";
    if (r <= 1.5) return "Muy ligero";
    if (r <= 2.5) return "Ligero";
    if (r <= 3.5) return "Medio";
    if (r <= 4.5) return "Complejo";
    return "Muy complejo";
  };

  return (
    <div className="landing-page">
      <div className="hero-section">
        <img className="hero-art" src={heroImage} alt="Ludisist" fetchPriority="high" />
        <div className="hero-content">
          <h1 className="hero-title">
            Descubre el <span className="text-gradient">Universo de Tablero</span>
          </h1>
          <p className="hero-subtitle">
            Tu compañero inteligente para juegos de mesa. Gestiona tu colección, consulta reglas al instante y lleva tus partidas al siguiente nivel.
          </p>

          <div className="hero-actions">
            <Link to="/juegos" className="btn btn-primary btn-lg glow-effect">
              Explorar Catálogo
            </Link>
            {!loggedIn && (
              <Link to="/login" className="btn btn-outline btn-lg">
                Unirse Ahora
              </Link>
            )}
          </div>
        </div>
      </div>

      <section className="daily-recommendation-section">
        <div className="daily-recommendation-header">
          <LuStar className="daily-star-icon" />
          <h2 className="section-title">Recomendación del Día</h2>
        </div>
        {loading ? (
          <div className="daily-loading">Cargando recomendación…</div>
        ) : dailyGame ? (
          <div className="daily-game-card">
            <div className="daily-game-image-wrapper">
              {dailyGame.image_url ? (
                <img src={dailyGame.image_url} alt={dailyGame.name} className="daily-game-image" />
              ) : (
                <div className="daily-game-image-placeholder"><Dice5 /></div>
              )}
            </div>
            <div className="daily-game-info">
              <h3 className="daily-game-name">{dailyGame.name}</h3>
              {loggedIn ? (
                <>
                  {dailyGame.categories?.length > 0 && (
                    <div className="daily-game-categories">
                      {dailyGame.categories.map(c => (
                        <span key={c.id} className="daily-category-tag">{c.name}</span>
                      ))}
                    </div>
                  )}
                  <div className="daily-game-meta">
                    <span className="daily-meta-item">
                      <LuUsers /> {dailyGame.min_players}–{dailyGame.max_players} jugadores
                    </span>
                    <span className="daily-meta-item">
                      <LuClock /> {dailyGame.playing_time} min
                    </span>
                    <span className="daily-meta-item">
                      <LuStar /> {complexityLabel(dailyGame.complexity_rating)}
                    </span>
                  </div>
                  {dailyGame.rating_average > 0 && (
                    <div className="daily-game-rating">
                      â˜… {dailyGame.rating_average} ({dailyGame.rating_count} votos)
                    </div>
                  )}
                  {dailyGame.description && (
                    <p className="daily-game-description">
                      {dailyGame.description.length > 250
                        ? dailyGame.description.slice(0, 250) + "…"
                        : dailyGame.description}
                    </p>
                  )}
                  <div className="daily-game-link-wrapper">
                    <button className="btn btn-primary daily-game-link" onClick={() => setDetailGame(dailyGame)}>
                      Ver ficha del juego
                    </button>
                  </div>
                </>
              ) : null}
            </div>
          </div>
        ) : (
          <div className="daily-empty">No hay juegos disponibles en el catálogo.</div>
        )}
      </section>

      {loggedIn && activeTables.length > 0 && (
        <section className="active-tables-section">
          <div className="active-tables-header">
            <h2 className="section-title">Mesas activas</h2>
            <Link to="/mesas" className="btn btn-outline btn-sm">Ver todas</Link>
          </div>
          <div className="active-tables-grid">
            {activeTables.map((table) => (
              <Link to="/mesas" className="active-table-card" key={table.id}>
                <div className="active-table-cover">
                  {table.game_image_url ? <img src={table.game_image_url} alt="" /> : <LuCalendarDays />}
                  <span className="active-table-spots">{table.status === "full" ? "Completa" : `${table.available_spots} cupo${table.available_spots !== 1 ? "s" : ""}`}</span>
                </div>
                <div className="active-table-body">
                  <small>{table.game_name}</small>
                  <h3>{table.title}</h3>
                  <div className="active-table-meta">
                    <span><LuCalendarDays /> {new Date(table.scheduled_at).toLocaleDateString()}</span>
                    <span><MapPin /> {table.location}</span>
                    <span><LuUsers /> {table.approved_count + 1}/{table.capacity}</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      <div className="features-section">
        <h2 className="section-title">¿Qué es <span style={{ color: '#4ade80' }}>Ludisist</span>?</h2>
        <div className="features-grid">
          <div className="feature-card">
            <div className="feature-icon"><Dice5 /></div>
            <h3>Catálogo Extenso</h3>
            <p>Accede a una base de datos con tus juegos favoritos, desde clásicos hasta las últimas novedades.</p>
          </div>
          <div className="feature-card">
            <div className="feature-icon"><BookOpen /></div>
            <h3>Reglas Claras</h3>
            <p>Olvídate de discutir por las reglas. Consulta manuales resumidos y busca dudas específicas al instante.</p>
          </div>
          <div className="feature-card">
            <div className="feature-icon"><Bot /></div>
            <h3>Asistente de juegos</h3>
            <p>Consulta dudas sobre juegos cuando el asistente esté disponible; contrasta sus respuestas con el manual.</p>
          </div>
        </div>
      </div>

      <GameDetailModal
        game={detailGame}
        onClose={() => setDetailGame(null)}
        isPlayer={isPlayer}
        onEdit={() => { setDetailGame(null); toast.info("Edita el juego desde el panel de administración."); }}
        onDelete={() => { setDetailGame(null); toast.info("Elimina el juego desde el panel de administración."); }}
        onRules={() => { setDetailGame(null); toast.info("Gestiona las reglas desde el catálogo de juegos."); }}
        onRatingChange={handleRatingChange}
      />
    </div>
  );
}
