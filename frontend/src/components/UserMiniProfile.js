import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  LuUserRound as UserRound, LuX as X, LuShieldCheck as ShieldCheck,
  LuUsers as Users, LuGamepad2 as Gamepad2, LuBookOpen as BookOpen,
  LuStar as Star, LuSwords as Swords, LuUserPlus as UserPlus, LuUserCheck as UserCheck,
  LuSend as Send,
} from "react-icons/lu";
import { getPublicProfile, followUser, unfollowUser } from "../services/api";
import { getToken, parseJwt } from "../services/auth";
import "./UserMiniProfile.css";

export default function UserMiniProfile({ userId, onClose }) {
  const [error,setError]=useState("");const [busy,setBusy]=useState(false);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [following, setFollowing] = useState(false);
  const currentUserId = parseJwt(getToken())?.user_id;
  const navigate = useNavigate();

  useEffect(() => {
    getPublicProfile(userId).then((data) => {
      setProfile(data);
      setFollowing(data.is_following || false);
    }).catch((err) => setError(err.message)).finally(() => setLoading(false));
  }, [userId]);

  const handleFollow = async () => {
    if(busy)return;setBusy(true);
    try {
      if (following) {
        await unfollowUser(userId);
        setFollowing(false);
      } else {
        await followUser(userId);
        setFollowing(true);
      }
    } catch(err) {setError(err.message);} finally {setBusy(false);}
  };

  return (
    <div className="mini-profile-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="mini-profile-card">
        <button aria-label="Cerrar perfil breve" className="mini-profile-close" onClick={onClose}><X /></button>
        {error&&<p className="ui-status error" role="alert">{error}</p>}{loading ? (
          <div className="mini-profile-loading">Cargando...</div>
        ) : profile ? (
          <>
            <div className="mini-profile-header">
              <div className="mini-profile-avatar">
                {profile.avatar_url ? <img src={profile.avatar_url} alt="" /> : <UserRound />}
                {profile.is_tutor && <span className="mini-profile-tutor-badge" title="Tutor"><ShieldCheck /></span>}
              </div>
              <div className="mini-profile-info">
                <strong>{profile.nickname || profile.username}</strong>
                <small>@{profile.username}</small>
              </div>
              {currentUserId && currentUserId !== userId && (
                <div className="mini-profile-actions">
                  <button aria-label={following?"Dejar de seguir":"Seguir jugador"} aria-pressed={following} disabled={busy} className={`mini-profile-follow ${following ? "following" : ""}`} onClick={handleFollow}>
                    {following ? <UserCheck /> : <UserPlus />}
                  </button>
                  {profile.open_to_messages && (
                    <button aria-label="Enviar mensaje" className="mini-profile-message" onClick={() => { onClose(); navigate(`/mensajes?user=${userId}`); }}>
                      <Send />
                    </button>
                  )}
                </div>
              )}
            </div>
            {profile.bio && <p className="mini-profile-bio">{profile.bio}</p>}
            <div className="mini-profile-stats">
              <span><Gamepad2 /> {profile.stats?.games_played || 0} partidas</span>
              <span><BookOpen /> {profile.stats?.rules_viewed || 0} reglas</span>
            </div>
            <div className="mini-profile-genres">
              {profile.favorite_genres?.slice(0, 3).map((g) => <span key={g}>{g}</span>)}
            </div>
            <Link to={`/jugadores/${userId}`} className="mini-profile-link" onClick={onClose}>Ver perfil completo</Link>
          </>
        ) : (
          <div className="mini-profile-error">No se pudo cargar el perfil</div>
        )}
      </div>
    </div>
  );
}
