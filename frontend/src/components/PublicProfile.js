import React, { useEffect, useMemo, useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import {
  LuArrowLeft as ArrowLeft, LuAward as Award, LuCalendarDays as CalendarDays,
  LuChevronLeft as ChevronLeft, LuChevronRight as ChevronRight,
  LuClock3 as Clock3, LuFlame as Flame, LuHeart as Heart, LuMapPin as MapPin,
  LuMessageCircle as MessageCircle, LuSend as Send, LuShield as Shield, LuSparkles as Sparkles,
  LuSwords as Swords, LuTrophy as Trophy, LuUsers as Users, LuGamepad2 as Gamepad2,
  LuUserPlus as UserPlus, LuUserCheck as UserCheck, LuZap as Zap,
} from "react-icons/lu";
import { toast } from "react-toastify";
import { getPublicProfile, getPublicUserSessions, followUser, unfollowUser } from "../services/api";
import { parseJwt, getToken } from "../services/auth";
import "./UserProfile.css";

const EXPERIENCE = {
  beginner: "Principiante",
  intermediate: "Intermedio",
  advanced: "Avanzado",
  expert: "Experto",
};

export default function PublicProfile() {
  const { userId } = useParams();
  const navigate = useNavigate();
  const [profile, setProfile] = useState(null);
  const [error, setError] = useState("");
  const [sessions, setSessions] = useState([]);
  const [sessionsPage, setSessionsPage] = useState(1);
  const [sessionsPages, setSessionsPages] = useState(0);
  const [sessionsTotal, setSessionsTotal] = useState(0);

  const loadSessions = (page) => {
    getPublicUserSessions(userId, page).then((data) => {
      setSessions(data.items);
      setSessionsPage(data.page);
      setSessionsPages(data.pages);
      setSessionsTotal(data.total);
    }).catch((error) => window.dispatchEvent(new CustomEvent("ludisist:request-error", {detail:error.message})));
  };

  const currentUserId = useMemo(() => {
    try { return parseJwt(getToken())?.user_id; } catch { return null; }
  }, []);

  const handleFollow = async () => {
    try {
      if (profile.is_following) {
        await unfollowUser(userId);
        setProfile({ ...profile, is_following: false, followers_count: profile.followers_count - 1 });
      } else {
        await followUser(userId);
        setProfile({ ...profile, is_following: true, followers_count: profile.followers_count + 1 });
      }
    } catch (err) { toast.error(err.message); }
  };

  useEffect(() => {
    setProfile(null);
    setError("");
    setSessions([]);
    getPublicProfile(userId).then((data) => {
      setProfile(data);
    }).catch((requestError) => setError(requestError.message));
    loadSessions(1);
  }, [userId]);

  const favoriteBadge = useMemo(
    () => profile?.badges.find((badge) => badge.is_favorite),
    [profile],
  );
  const tutorBadge = useMemo(
    () => profile?.badges.find((badge) => badge.slug === "tutor"),
    [profile],
  );

  if (error) return <div className="profile-loading">{error}</div>;
  if (!profile) return <div className="profile-loading">Cargando perfil...</div>;

  const displayName = profile.nickname || profile.username;
  return <div className="player-profile public-player-profile">
    <Link className="public-profile-back" to="/mesas"><ArrowLeft /> Volver a Mesas</Link>
    <section className="profile-identity">
      <div className="profile-avatar">
        {profile.avatar_url ? <img src={profile.avatar_url} alt={`Foto de ${displayName}`} /> : displayName.charAt(0).toUpperCase()}
      </div>
      <div className="identity-copy">
        <span className="profile-eyebrow">@{profile.username}</span>
        <div className="profile-name-row">
          <h1>{displayName}</h1>
          {favoriteBadge && <span className="profile-favorite-badge">{favoriteBadge.image_url ? <img src={favoriteBadge.image_url} alt="" /> : <Award />}{favoriteBadge.name}</span>}
          {tutorBadge && <span className="profile-tutor-badge"><Shield /> Tutor verificado</span>}
        </div>
        {currentUserId && currentUserId !== userId && (
          <div className="profile-actions">
            <button className={`profile-follow-btn ${profile.is_following ? "following" : ""}`} onClick={handleFollow}>
              {profile.is_following ? <><UserCheck /> Siguiendo</> : <><UserPlus /> Seguir</>}
            </button>
            {profile.open_to_messages && (
              <button className="profile-message-btn" onClick={() => navigate(`/mensajes?user=${userId}`)}>
                <Send /> Mensaje
              </button>
            )}
          </div>
        )}
        <div className="profile-follow-counts">
          <span><strong>{profile.following_count || 0}</strong> Siguiendo</span>
          <span><strong>{profile.followers_count || 0}</strong> Seguidores</span>
        </div>
        <div className="profile-level-bar">
          <div className="profile-level-info">
            <Zap /> <strong>Nivel {profile.stats?.level || 0}</strong>
            <span>{profile.stats?.xp || 0} XP</span>
            <span className="profile-streak"><Flame /> {profile.stats?.streak || 0}</span>
          </div>
          <div className="profile-xp-bar"><div style={{ width: `${Math.min((profile.stats?.xp % 100) / 100 * 100, 100)}%` }} /></div>
        </div>
        <div className="identity-meta">
          <span><Trophy /> {EXPERIENCE[profile.experience_level] || "Principiante"}</span>
          {profile.created_at && <span><CalendarDays /> Desde {new Date(profile.created_at).toLocaleDateString("es-BO", { year: "numeric", month: "long" })}</span>}
        </div>
        <p>{profile.bio || "Este jugador todavía no ha escrito una presentación."}</p>
      </div>
    </section>

    <div className="profile-layout">
      <main className="profile-main">
        <section className="profile-section">
          <div className="profile-section-heading"><div><Heart /><span><small>Preferencias</small><h2>Su mesa ideal</h2></span></div></div>
          {profile.favorite_genres.length
            ? <div className="genre-list">{profile.favorite_genres.map((genre) => <span key={genre}>{genre}</span>)}</div>
            : <p className="profile-empty">No ha definido géneros favoritos.</p>}
          <div className="preference-grid">
            <Preference icon={Swords} label="Estilo" value={profile.play_style || "Sin definir"} />
            <Preference icon={Clock3} label="Duración preferida" value={profile.preferred_duration || "Cualquiera"} />
            <Preference icon={Users} label="Tamaño del grupo" value={profile.preferred_group_size || "Flexible"} />
          </div>
        </section>

        <section className="profile-section">
          <div className="profile-section-heading"><div><Sparkles /><span><small>Actividad</small><h2>Trayectoria en Ludisist</h2></span></div></div>
          <div className="profile-stats">
            <Stat value={profile.stats.favorite_games} label="Juegos favoritos" />
            <Stat value={profile.stats.games_played} label="Juegos jugados" />
            <Stat value={profile.stats.sessions_played} label="Partidas registradas" />
            <Stat value={profile.stats.rules_viewed} label="Reglas consultadas" />
            <Stat value={formatTime(profile.stats.total_time_played)} label="Tiempo jugado" />
          </div>
          {profile.favorite_games.length > 0 && <div className="favorite-games">{profile.favorite_games.map((game) => <article key={game.id}>
            {game.image_url ? <img src={game.image_url} alt={game.name} /> : <div className="favorite-game-placeholder"><Heart /></div>}
            <div><strong>{game.name}</strong><small>{game.playing_time ? `${game.playing_time} min` : "Duración variable"}</small></div>
          </article>)}</div>}
        </section>

        <section className="profile-section">
          <div className="profile-section-heading"><div><Gamepad2 /><span><small>Historial</small><h2>Partidas recientes</h2></span></div></div>
          {sessions.length === 0
            ? <p className="profile-empty">Este jugador aún no ha completado partidas.</p>
            : <div className="profile-session-list">{sessions.map((session) => <article key={session.id} className="profile-session-row">
              {session.game_image_url ? <img src={session.game_image_url} alt="" /> : <div className="profile-session-placeholder"><Gamepad2 /></div>}
              <div className="profile-session-info">
                <strong>{session.game_name}</strong>
                <small>{session.player_count} jugador{session.player_count !== 1 ? "es" : ""} &middot; {formatTime(session.elapsed_seconds)} &middot; {session.scoring_mode === "teams" ? "Por equipos" : "Individual"}</small>
              </div>
              <span className="profile-session-date">{session.end_time ? new Date(session.end_time).toLocaleDateString("es-BO", { day: "numeric", month: "short" }) : ""}</span>
            </article>)}</div>}
          {sessionsPages > 1 && <div className="profile-session-pagination">
            <button disabled={sessionsPage <= 1} onClick={() => loadSessions(sessionsPage - 1)}><ChevronLeft /></button>
            <span>{sessionsPage} de {sessionsPages}</span>
            <button disabled={sessionsPage >= sessionsPages} onClick={() => loadSessions(sessionsPage + 1)}><ChevronRight /></button>
          </div>}
        </section>
      </main>

      <aside className="profile-sidebar">
        {profile.badges.length > 0 && <section className="profile-badges-panel">
          <h2>Insignias</h2><p>Reconocimientos visibles de este jugador.</p>
          {profile.badges.map((badge) => <div className="profile-badge-row" key={badge.id}>
            {badge.image_url ? <img src={badge.image_url} alt="" /> : <Award />}
            <span><strong>{badge.name}</strong><small>{badge.slug === "tutor" ? "Insignia Tutor" : "Insignia aprobada"}</small></span>
          </div>)}
        </section>}
        <section className="community-panel">
          <h2>Disponibilidad y contacto</h2><p>Disponibilidad declarada por el jugador.</p>
          <CommunityStatus icon={Users} active={profile.looking_for_players} label="Busca grupo de juego" />
          <CommunityStatus icon={MapPin} active={profile.open_to_events} label="Disponible para eventos" />
          <CommunityStatus icon={MessageCircle} active={profile.open_to_messages} label="Acepta mensajes" />
        </section>
      </aside>
    </div>
  </div>;
}

function Preference({ icon: Icon, label, value }) {
  return <div className="preference-item"><Icon /><span><small>{label}</small><strong>{value}</strong></span></div>;
}

function Stat({ value, label }) {
  return <div><strong>{value ?? 0}</strong><span>{label}</span></div>;
}

function formatTime(seconds) {
  if (!seconds) return 0;
  const hours = Math.floor(seconds / 3600);
  const min = Math.floor((seconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${min}m`;
  return `${min}m`;
}

function CommunityStatus({ icon: Icon, active, label }) {
  return <div className={`community-status ${active ? "active" : ""}`}><Icon /><span>{label}</span><small>{active ? "Sí" : "No"}</small></div>;
}
