import React, { useEffect, useState } from "react";
import {
    LuCalendarDays as CalendarDays, LuCamera as Camera, LuCheck as Check, LuClock3 as Clock3,
    LuHeart as Heart, LuMapPin as MapPin, LuMessageCircle as MessageCircle,
    LuAward as Award, LuPencil as Pencil, LuSave as Save, LuShield as Shield,
    LuSparkles as Sparkles, LuStar as Star, LuSwords as Swords, LuTrash2 as Trash2,
    LuTrophy as Trophy, LuUserRound as UserRound, LuUsers as Users, LuX as X,
    LuZap as Zap, LuFlame as Flame,
} from "react-icons/lu";
import { toast } from "react-toastify";
import { getToken, parseJwt, logout } from "../services/auth";
import { Link } from "react-router-dom";
import { deleteAccount, getMyBadges, getMyProfile, requestBadge, setFavoriteBadge, updateMyProfile, uploadProfileImage, getNotificationPreferences, updateNotificationPreferences, getMyFollowing, getMyFollowers } from "../services/api";
import UserMiniProfile from "./UserMiniProfile";
import "./UserProfile.css";

const GENRES = [
    "Estrategia", "Familiar", "Cooperativo", "Party", "Rol",
    "Cartas", "Abstracto", "Deducción", "Aventura", "Construcción",
    "Económico", "Wargame",
];

const emptyProfile = {
    avatar_url: "",
    nickname: "",
    bio: "",
    experience_level: "beginner",
    favorite_genres: [],
    play_style: "",
    preferred_duration: "",
    preferred_group_size: "",
    looking_for_players: false,
    open_to_events: false,
    open_to_messages: false,
};

const EXPERIENCE = {
    beginner: "Principiante",
    intermediate: "Intermedio",
    advanced: "Avanzado",
    expert: "Experto",
};

const LUDISIST_AVATARS = [
    { id: "strategist", name: "Estratega", url: "/assets/avatars/avatar-strategist.jpg" },
    { id: "cartographer", name: "Cartógrafa", url: "/assets/avatars/avatar-cartographer.jpg" },
    { id: "tactician", name: "Táctico", url: "/assets/avatars/avatar-tactician.jpg" },
];

export default function UserProfile() {
    const tokenUser = parseJwt(getToken());
    const [loadError,setLoadError] = useState("");
    const [profile, setProfile] = useState(null);
    const [form, setForm] = useState(emptyProfile);
    const [editing, setEditing] = useState(false);
    const [saving, setSaving] = useState(false);
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [passwordConfirm, setPasswordConfirm] = useState("");
    const [avatarFile, setAvatarFile] = useState(null);
    const [avatarPreview, setAvatarPreview] = useState("");
    const [avatarMode, setAvatarMode] = useState("photo");
    const [badges, setBadges] = useState([]);
    const [notifPrefs, setNotifPrefs] = useState({});
    const [notifPrefsLoaded, setNotifPrefsLoaded] = useState(false);
    const [followingPage,setFollowingPage]=useState(1);const [followingPages,setFollowingPages]=useState(1);const [followersPage,setFollowersPage]=useState(1);const [followersPages,setFollowersPages]=useState(1);const [socialError,setSocialError]=useState("");
    const [followingList, setFollowingList] = useState([]);
    const [followersList, setFollowersList] = useState([]);
    const [showFollowing, setShowFollowing] = useState(false);
    const [showFollowers, setShowFollowers] = useState(false);
    const [miniProfileUserId, setMiniProfileUser] = useState(null);
    const setMiniProfile = (id) => setMiniProfileUser(id);

    useEffect(() => {
        getMyProfile()
            .then((data) => {
                setProfile(data);
                setForm({ ...emptyProfile, ...data });
            })
            .catch((error) => {setLoadError(error.message);toast.error(error.message);});
        getMyBadges().then(setBadges).catch(() => setBadges([]));
        getNotificationPreferences()
            .then((data) => { setNotifPrefs(data); setNotifPrefsLoaded(true); })
            .catch(() => { setNotifPrefsLoaded(true); });


    }, []);

    useEffect(()=>{getMyFollowing(followingPage,10).then((data)=>{setFollowingList(data.items||[]);setFollowingPages(data.pages||1);}).catch((err)=>setSocialError(err.message));},[followingPage]);
    useEffect(()=>{getMyFollowers(followersPage,10).then((data)=>{setFollowersList(data.items||[]);setFollowersPages(data.pages||1);}).catch((err)=>setSocialError(err.message));},[followersPage]);
    useEffect(() => () => {
        if (avatarPreview) URL.revokeObjectURL(avatarPreview);
    }, [avatarPreview]);

    if(loadError) return <div role="alert" className="ui-status error">{loadError}<button onClick={()=>window.location.reload()}>Reintentar</button></div>;
    if (!tokenUser || !profile) return <div className="profile-loading">Cargando perfil...</div>;

    const displayName = profile.nickname || profile.username;
    const approvedBadges = badges.filter((badge) => badge.status === "approved");
    const favoriteBadge = approvedBadges.find((badge) => badge.is_favorite && badge.slug !== "tutor");
    const tutorBadge = approvedBadges.find((badge) => badge.slug === "tutor");
    const profileBadges = badges.filter((badge) => !(badge.slug === "tutor" && badge.status === "approved"));
    const submitBadgeRequest = async (badge) => {
        try {
            await requestBadge(badge.id);
            setBadges((current) => current.map((item) => item.id === badge.id ? { ...item, status: "pending" } : item));
            toast.success("Solicitud enviada al administrador");
        } catch (error) {
            toast.error(error.message);
        }
    };
    const chooseFavoriteBadge = async (badge) => {
        try {
            const result = await setFavoriteBadge(badge.id);
            setBadges((current) => current.map((item) => ({
                ...item,
                is_favorite: result.is_favorite ? item.id === badge.id : false,
            })));
            toast.success(result.is_favorite ? `${badge.name} ahora aparece junto a tu nombre` : "Insignia favorita retirada");
        } catch (error) {
            toast.error(error.message);
        }
    };
    const openEdit = () => {
        setAvatarMode(profile.avatar_url?.startsWith("/assets/avatars/") ? "avatar" : "photo");
        setEditing(true);
    };
    const toggleGenre = (genre) => {
        setForm((current) => ({
            ...current,
            favorite_genres: current.favorite_genres.includes(genre)
                ? current.favorite_genres.filter((item) => item !== genre)
                : [...current.favorite_genres, genre],
        }));
    };

    const saveProfile = async () => {
        setSaving(true);
        try {
            let avatarUrl = form.avatar_url || "";
            if (avatarFile) {
                const uploaded = await uploadProfileImage(avatarFile);
                avatarUrl = uploaded.url;
            }
            const updated = await updateMyProfile({
                avatar_url: avatarUrl,
                nickname: form.nickname,
                bio: form.bio,
                experience_level: form.experience_level,
                favorite_genres: form.favorite_genres,
                play_style: form.play_style,
                preferred_duration: form.preferred_duration,
                preferred_group_size: form.preferred_group_size,
                looking_for_players: form.looking_for_players,
                open_to_events: form.open_to_events,
                open_to_messages: form.open_to_messages,
            });
            setProfile(updated);
            setForm({ ...emptyProfile, ...updated });
            setAvatarFile(null);
            setAvatarPreview("");
            await updateNotificationPreferences(notifPrefs);
            setEditing(false);
            window.dispatchEvent(new CustomEvent("ludisist:profile-updated", { detail: updated }));
            toast.success("Perfil actualizado");
        } catch (error) {
            toast.error(error.message);
        } finally {
            setSaving(false);
        }
    };

    const cancelEdit = () => {
        setForm({ ...emptyProfile, ...profile });
        setAvatarFile(null);
        setAvatarPreview("");
        setEditing(false);
    };

    const selectAvatar = (event) => {
        const file = event.target.files?.[0];
        if (!file) return;
        if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
            toast.error("Selecciona una imagen JPG, PNG o WebP");
            return;
        }
        if (file.size > 5 * 1024 * 1024) {
            toast.error("La imagen no puede superar 5 MB");
            return;
        }
        if (avatarPreview) URL.revokeObjectURL(avatarPreview);
        setAvatarFile(file);
        setAvatarPreview(URL.createObjectURL(file));
        setAvatarMode("photo");
    };

    const selectPresetAvatar = (avatarUrl) => {
        if (avatarPreview) URL.revokeObjectURL(avatarPreview);
        setAvatarFile(null);
        setAvatarPreview("");
        setForm((current) => ({ ...current, avatar_url: avatarUrl }));
    };

    const removeAvatar = () => {
        if (avatarPreview) URL.revokeObjectURL(avatarPreview);
        setAvatarFile(null);
        setAvatarPreview("");
        setForm({ ...form, avatar_url: "" });
    };

    const handleDeleteAccount = async () => {
        try {
            await deleteAccount(passwordConfirm);
            logout();
            window.location.href = "/";
        } catch (error) {
            toast.error(error.message);
        }
    };

    return (
        <div className="player-profile">
            <section className="profile-identity">
                <div className="profile-avatar">
                    {profile.avatar_url
                        ? <img src={profile.avatar_url} alt={`Foto de ${displayName}`} />
                        : displayName.charAt(0).toUpperCase()}
                </div>
                <div className="identity-copy">
                    <span className="profile-eyebrow">@{profile.nickname || profile.username}</span>
                    <div className="profile-name-row">
                        <h1>{displayName}</h1>
                        {favoriteBadge && <span className="profile-favorite-badge">
                            {favoriteBadge.image_url ? <img src={favoriteBadge.image_url} alt="" /> : <Award />}
                            {favoriteBadge.name}
                        </span>}
                        {tutorBadge && <span className="profile-tutor-badge"><Shield /> Tutor verificado</span>}
                    </div>
                    <div className="profile-level-bar">
                        <div className="profile-level-info">
                            <Zap /> <strong>Nivel {profile.stats?.level || 0}</strong>
                            <span>{profile.stats?.xp || 0} XP</span>
                            <span className="profile-streak"><Flame /> {profile.stats?.streak || 0}</span>
                        </div>
                        <div className="profile-xp-bar">
                            <div style={{ width: `${Math.min((profile.stats?.xp || 0) % 100 / 100 * 100, 100)}%` }} />
                        </div>
                    </div>
                    <div className="identity-meta">
                        <span><Shield /> {profile.role === "admin" ? "Administrador" : profile.role === "facilitador" ? "Facilitador" : "Jugador"}</span>
                        <span><Trophy /> {EXPERIENCE[profile.experience_level] || "Principiante"}</span>
                        <span><CalendarDays /> Desde {new Date(profile.created_at).toLocaleDateString("es-BO", { year: "numeric", month: "long" })}</span>
                    </div>
                    <p>{profile.bio || "Todavía no has escrito una presentación. Cuenta qué juegos disfrutas y qué tipo de mesa buscas."}</p>
                </div>
                <button className="profile-edit-button" onClick={openEdit}><Pencil /> Editar perfil</button>
            </section>

            <div className="profile-layout">
                <div className="profile-main">
                    <section className="profile-section">
                        <div className="profile-section-heading">
                            <div><Heart /><span><small>Preferencias</small><h2>Mi mesa ideal</h2></span></div>
                        </div>
                        {profile.favorite_genres.length ? (
                            <div className="genre-list">
                                {profile.favorite_genres.map((genre) => <span key={genre}>{genre}</span>)}
                            </div>
                        ) : <p className="profile-empty">Añade tus géneros favoritos para mejorar futuras recomendaciones.</p>}
                        <div className="preference-grid">
                            <Preference icon={Swords} label="Estilo" value={profile.play_style || "Sin definir"} />
                            <Preference icon={Clock3} label="Duración preferida" value={profile.preferred_duration || "Cualquiera"} />
                            <Preference icon={Users} label="Tamaño del grupo" value={profile.preferred_group_size || "Flexible"} />
                        </div>
                    </section>

                    <section className="profile-section" aria-labelledby="profile-favorite-games">
                        <div className="profile-section-heading"><div>
                            <Heart aria-hidden="true" /><h2 id="profile-favorite-games">Juegos favoritos</h2>
                        </div></div>
                        {profile.favorite_games.length ? (
                            <div className="favorite-games">
                                {profile.favorite_games.map((game) => (
                                    <Link key={game.id} to={`/juegos/${game.id}`}>
                                        {game.image_url
                                            ? <img src={game.image_url} alt="" />
                                            : <div className="favorite-game-placeholder"><Heart aria-hidden="true" /></div>}
                                        <div><strong>{game.name}</strong><small>{game.playing_time ? `${game.playing_time} min` : "Duración variable"}</small></div>
                                    </Link>
                                ))}
                            </div>
                        ) : <p className="profile-empty">Aún no tienes juegos favoritos. <Link to="/juegos">Explorar el catálogo</Link></p>}
                    </section>

                    <section className="profile-section">
                        <div className="profile-section-heading">
                            <div><Sparkles /><span><small>Actividad</small><h2>Trayectoria en Ludisist</h2></span></div>
                        </div>
                        <div className="profile-stats">
                            <Stat value={profile.favorite_games.length} label="Juegos favoritos" />
                            <Stat value={profile.stats?.games_played || profile.stats?.sessions_played || 0} label="Juegos jugados" />
                            <Stat value={profile.stats?.sessions_played || 0} label="Partidas registradas" />
                            <Stat value={profile.stats?.rules_viewed || 0} label="Reglas consultadas" />
                            <Stat value={formatTime(profile.stats?.total_time_played) || "—"} label="Tiempo jugado" />
                        </div>
                    </section>
                </div>

                <aside className="profile-sidebar">
                    {profileBadges.length > 0 && <section className="profile-badges-panel">
                        <h2>Insignias</h2>
                        <p>Solicita la Insignia Tutor o elige otra insignia aprobada como favorita.</p>
                        {profileBadges.map((badge) => <div className="profile-badge-row" key={badge.id}>
                            {badge.image_url ? <img src={badge.image_url} alt="" /> : <Award />}
                            <span><strong>{badge.name}</strong><small>{badgeStatus(badge.status)}</small></span>
                            {(badge.status === "eligible" || badge.status === "rejected") && <button onClick={() => submitBadgeRequest(badge)}>Solicitar</button>}
                            {badge.status === "approved" && badge.slug !== "tutor" && <button
                                className={`profile-badge-favorite ${badge.is_favorite ? "active" : ""}`}
                                title={badge.is_favorite ? "Insignia favorita" : "Mostrar junto al nombre"}
                                aria-label={badge.is_favorite ? `${badge.name} es tu insignia favorita` : `Marcar ${badge.name} como favorita`}
                                onClick={() => chooseFavoriteBadge(badge)}
                            ><Star /></button>}
                        </div>)}
                    </section>}
                    <section className="profile-follow-section">
                        <h2>Red social</h2>
                        <div className="profile-follow-triggers">
                            <button onClick={() => { getMyFollowing(1, 20).then(d => setFollowingList(d.items)); setShowFollowing(true); }}>
                                <strong>{profile.stats?.following_count ?? followingList.length}</strong> Siguiendo
                            </button>
                            <button onClick={() => { getMyFollowers(1, 20).then(d => setFollowersList(d.items)); setShowFollowers(true); }}>
                                <strong>{profile.stats?.followers_count ?? followersList.length}</strong> Seguidores
                            </button>
                        </div>
                    </section>
                    <Link className="btn btn-secondary" to="/cuenta">Cuenta, privacidad y notificaciones</Link>
                </aside>
            </div>

            {editing && (
                <div className="profile-modal-backdrop" onMouseDown={(event) => {
                    if (event.target === event.currentTarget) cancelEdit();
                }}>
                    <div className="profile-modal profile-edit-modal">
                        <div className="profile-modal-heading">
                            <div><small>Identidad pública</small><h2>Editar perfil de jugador</h2></div>
                            <button aria-label="Cerrar" onClick={cancelEdit}><X /></button>
                        </div>
                        <div className="profile-form">
                            <div className="profile-photo-field profile-form-wide">
                                <div className="profile-photo-preview">
                                    {(avatarPreview || form.avatar_url)
                                        ? <img src={avatarPreview || form.avatar_url} alt="Vista previa del perfil" />
                                        : displayName.charAt(0).toUpperCase()}
                                </div>
                                <div>
                                    <strong>Imagen de perfil</strong>
                                    <small>JPG, PNG o WebP. Máximo 5 MB.</small>
                                    <div className="profile-image-modes" role="tablist" aria-label="Tipo de imagen de perfil">
                                        <button type="button" className={avatarMode === "photo" ? "active" : ""} onClick={() => setAvatarMode("photo")}><Camera /> Foto</button>
                                        <button type="button" className={avatarMode === "avatar" ? "active" : ""} onClick={() => setAvatarMode("avatar")}><UserRound /> Avatar</button>
                                    </div>
                                </div>
                            </div>
                            {avatarMode === "photo" ? (
                                <div className="profile-photo-options profile-form-wide">
                                    <div>
                                        <strong>Subir una foto</strong>
                                        <small>JPG, PNG o WebP. Máximo 5 MB.</small>
                                    </div>
                                    <div className="profile-photo-actions">
                                        <label className="profile-photo-button"><Camera /> Elegir imagen<input type="file" accept="image/jpeg,image/png,image/webp" onChange={selectAvatar} /></label>
                                        {(avatarPreview || form.avatar_url) && <button type="button" onClick={removeAvatar}>Quitar imagen</button>}
                                    </div>
                                </div>
                            ) : (
                                <fieldset className="profile-avatar-options profile-form-wide">
                                    <legend>Avatares Ludisist</legend>
                                    <div className="profile-avatar-grid">
                                        {LUDISIST_AVATARS.map((avatar) => (
                                            <button
                                                type="button"
                                                key={avatar.id}
                                                className={form.avatar_url === avatar.url ? "selected" : ""}
                                                onClick={() => selectPresetAvatar(avatar.url)}
                                                aria-label={`Elegir avatar ${avatar.name}`}
                                            >
                                                <img src={avatar.url} alt="" />
                                                <span>{avatar.name}</span>
                                                {form.avatar_url === avatar.url && <Check />}
                                            </button>
                                        ))}
                                    </div>
                                </fieldset>
                            )}
                            <label>Nickname público<input maxLength="30" value={form.nickname} onChange={(event) => setForm({ ...form, nickname: event.target.value })} placeholder="Ej. MeepleMaster" /></label>
                            <label>Nivel de experiencia<select value={form.experience_level} onChange={(event) => setForm({ ...form, experience_level: event.target.value })}><option value="beginner">Principiante</option><option value="intermediate">Intermedio</option><option value="advanced">Avanzado</option><option value="expert">Experto</option></select></label>
                            <label className="profile-form-wide">Sobre mí<textarea maxLength="300" value={form.bio} onChange={(event) => setForm({ ...form, bio: event.target.value })} placeholder="Qué juegos disfrutas, cómo te gusta jugar y qué buscas en una mesa..." /><small>{form.bio.length}/300</small></label>
                            <fieldset className="profile-form-wide"><legend>Géneros favoritos</legend><div className="genre-picker">{GENRES.map((genre) => <button type="button" className={form.favorite_genres.includes(genre) ? "selected" : ""} key={genre} onClick={() => toggleGenre(genre)}>{form.favorite_genres.includes(genre) && <Check />}{genre}</button>)}</div></fieldset>
                            <label>Estilo de juego<select value={form.play_style} onChange={(event) => setForm({ ...form, play_style: event.target.value })}><option value="">Sin definir</option><option>Competitivo</option><option>Cooperativo</option><option>Casual</option><option>Estratégico</option><option>Narrativo</option><option>Variado</option></select></label>
                            <label>Duración preferida<select value={form.preferred_duration} onChange={(event) => setForm({ ...form, preferred_duration: event.target.value })}><option value="">Cualquiera</option><option>Hasta 30 minutos</option><option>30 a 60 minutos</option><option>1 a 2 horas</option><option>Más de 2 horas</option></select></label>
                            <label>Tamaño de grupo<select value={form.preferred_group_size} onChange={(event) => setForm({ ...form, preferred_group_size: event.target.value })}><option value="">Flexible</option><option>En pareja</option><option>3 a 4 personas</option><option>5 o más personas</option></select></label>
                            <div className="social-toggles">
                                <Toggle label="Busco jugadores" checked={form.looking_for_players} onChange={(value) => setForm({ ...form, looking_for_players: value })} />
                                <Toggle label="Me interesan eventos" checked={form.open_to_events} onChange={(value) => setForm({ ...form, open_to_events: value })} />
                                <Toggle label="Acepto mensajes" checked={form.open_to_messages} onChange={(value) => setForm({ ...form, open_to_messages: value })} />
                            </div>
                            <fieldset className="profile-form-wide"><legend>Preferencias de notificación</legend><div className="notif-prefs">{notifPrefsLoaded && <>
                                <Toggle label="Solicitudes para unirse a mis mesas" checked={notifPrefs.table_join_request} onChange={(value) => setNotifPrefs({ ...notifPrefs, table_join_request: value })} />
                                <Toggle label="Aprobación de solicitudes" checked={notifPrefs.table_request_approved} onChange={(value) => setNotifPrefs({ ...notifPrefs, table_request_approved: value })} />
                                <Toggle label="Rechazo de solicitudes" checked={notifPrefs.table_request_rejected} onChange={(value) => setNotifPrefs({ ...notifPrefs, table_request_rejected: value })} />
                                <Toggle label="Mesas canceladas" checked={notifPrefs.table_cancelled} onChange={(value) => setNotifPrefs({ ...notifPrefs, table_cancelled: value })} />
                                <Toggle label="Mesas finalizadas" checked={notifPrefs.table_finished} onChange={(value) => setNotifPrefs({ ...notifPrefs, table_finished: value })} />
                                <hr className="notif-prefs-divider" />
                                <Toggle label="Insignias asignadas" checked={notifPrefs.badge_assigned} onChange={(value) => setNotifPrefs({ ...notifPrefs, badge_assigned: value })} />
                                <Toggle label="Insignias aprobadas" checked={notifPrefs.badge_approved} onChange={(value) => setNotifPrefs({ ...notifPrefs, badge_approved: value })} />
                                <Toggle label="Insignias rechazadas" checked={notifPrefs.badge_rejected} onChange={(value) => setNotifPrefs({ ...notifPrefs, badge_rejected: value })} />
                                <Toggle label="Insignias revocadas" checked={notifPrefs.badge_revoked} onChange={(value) => setNotifPrefs({ ...notifPrefs, badge_revoked: value })} />
                            </>}</div></fieldset>
                        </div>
                        <div className="profile-modal-actions"><button className="profile-cancel" onClick={cancelEdit}>Cancelar</button><button className="profile-save" disabled={saving} onClick={saveProfile}><Save /> {saving ? "Guardando..." : "Guardar cambios"}</button></div>
                    </div>
                </div>
            )}

            {showDeleteModal && (
                <div className="profile-modal-backdrop">
                    <div className="profile-modal delete-profile-modal">
                        <div className="profile-modal-heading"><div><small>Zona sensible</small><h2>Desactivar cuenta</h2></div><button aria-label="Cerrar ventana" onClick={() => setShowDeleteModal(false)}><X /></button></div>
                        <div className="delete-profile-copy"><p>Perderás el acceso inmediatamente. Escribe tu contraseña para confirmar.</p><input type="password" value={passwordConfirm} onChange={(event) => setPasswordConfirm(event.target.value)} placeholder="Contraseña actual" /></div>
                        <div className="profile-modal-actions"><button className="profile-cancel" onClick={() => setShowDeleteModal(false)}>Cancelar</button><button className="profile-delete" disabled={!passwordConfirm} onClick={handleDeleteAccount}><Trash2 /> Confirmar baja</button></div>
                    </div>
                </div>
            )}
            {showFollowing && (
                <div className="profile-modal-backdrop" onClick={() => setShowFollowing(false)}>
                    <div className="profile-modal follow-modal" onClick={(e) => e.stopPropagation()}>
                        <div className="profile-modal-heading"><div><h2>Siguiendo</h2></div><button aria-label="Cerrar ventana" onClick={() => setShowFollowing(false)}><X /></button></div>
                        <div className="follow-list">
                            {socialError&&<p role="alert">{socialError}</p>}{followingPages>1&&<div><button disabled={followingPage===1} onClick={()=>setFollowingPage(followingPage-1)}>Anterior</button><span> {followingPage} de {followingPages} </span><button disabled={followingPage===followingPages} onClick={()=>setFollowingPage(followingPage+1)}>Siguiente</button></div>}{followingList.length === 0 && <p className="profile-empty">No sigues a nadie todavía.</p>}
                            {followingList.map((u) => <button key={u.id} className="follow-row" onClick={() => { window.location.assign(`/jugadores/${u.id}`); }}>
                                <div className="follow-avatar">{u.avatar_url ? <img src={u.avatar_url} alt="" /> : <UserRound />}</div>
                                <strong>{u.display_name}</strong>
                                <small>@{u.username}</small>
                            </button>)}
                        </div>
                    </div>
                </div>
            )}
            {showFollowers && (
                <div className="profile-modal-backdrop" onClick={() => setShowFollowers(false)}>
                    <div className="profile-modal follow-modal" onClick={(e) => e.stopPropagation()}>
                        <div className="profile-modal-heading"><div><h2>Seguidores</h2></div><button aria-label="Cerrar ventana" onClick={() => setShowFollowers(false)}><X /></button></div>
                        <div className="follow-list">
                            {socialError&&<p role="alert">{socialError}</p>}{followersPages>1&&<div><button disabled={followersPage===1} onClick={()=>setFollowersPage(followersPage-1)}>Anterior</button><span> {followersPage} de {followersPages} </span><button disabled={followersPage===followersPages} onClick={()=>setFollowersPage(followersPage+1)}>Siguiente</button></div>}{followersList.length === 0 && <p className="profile-empty">No tienes seguidores todavía.</p>}
                            {followersList.map((u) => <button key={u.id} className="follow-row" onClick={() => { window.location.assign(`/jugadores/${u.id}`); }}>
                                <div className="follow-avatar">{u.avatar_url ? <img src={u.avatar_url} alt="" /> : <UserRound />}</div>
                                <strong>{u.display_name}</strong>
                                <small>@{u.username}</small>
                            </button>)}
                        </div>
                    </div>
                </div>
            )}
            {miniProfileUserId && <UserMiniProfile userId={miniProfileUserId} onClose={() => setMiniProfileUser(null)} />}
        </div>
    );
}

function Preference({ icon: Icon, label, value }) {
    return <div className="preference-item"><Icon /><span><small>{label}</small><strong>{value}</strong></span></div>;
}

function Stat({ value, label }) {
    return <div><strong>{value ?? 0}</strong><span>{label}</span></div>;
}

function CommunityStatus({ icon: Icon, active, label }) {
    return <div className={`community-status ${active ? "active" : ""}`}><Icon /><span>{label}</span><small>{active ? "Activo" : "Inactivo"}</small></div>;
}

function badgeStatus(status) {
    if (status === "approved") return "Aprobada";
    if (status === "pending") return "Solicitud pendiente";
    if (status === "rejected") return "Puedes solicitar nuevamente";
    return "Disponible para solicitar";
}

function Toggle({ label, checked, onChange }) {
    return <label className="profile-toggle"><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} /><span /><strong>{label}</strong></label>;
}

function formatTime(seconds) {
    if (!seconds) return "—";
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (h > 0) return `${h}h ${m}m`;
    return `${m} min`;
}
