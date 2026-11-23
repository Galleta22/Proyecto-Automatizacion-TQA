import { confirmAction } from "../../ui/confirmAction";
import React, { useEffect, useRef, useState } from "react";
import {
  LuAward as Award, LuEye as Eye, LuSquarePen as Edit3, LuPlus as Plus, LuTrash2 as Trash2,
  LuUserCheck as UserCheck, LuUserX as UserX, LuX as X,
} from "react-icons/lu";
import { useSearchParams } from "react-router-dom";
import { toast } from "react-toastify";
import { adminRequest } from "./adminApi";
import AdminPagination from "./AdminPagination";

const roles = { player: "Jugador", facilitador: "Facilitador", admin: "Administrador" };
const emptyForm = { username: "", email: "", password: "", role: "player", is_active: true };

export default function AdminUsers() {
  const [users, setUsers] = useState([]);
  const [query, setQuery] = useState("");
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedStatus = searchParams.get("estado");
  const status = ["active", "inactive"].includes(requestedStatus) ? requestedStatus : "all";
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [viewProfile, setViewProfile] = useState(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState("");
  const [actionError, setActionError] = useState("");
  const [removing, setRemoving] = useState(false);
  const removePending = useRef(false);
  const profileRequest = useRef(null);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ pages: 1, total: 0 });
  const [pageSize, setPageSize] = useState("20");

  const [role, setRole] = useState("all");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const savePending = useRef(false);

  const reload = () => setRefresh((current) => current + 1);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setLoadError("");
    const timer = window.setTimeout(async () => {
      const params = new URLSearchParams({
        paginated: "true", page: String(page), page_size: pageSize === "all" ? "20" : pageSize,
        all_items: String(pageSize === "all"), q: query, status, role,
      });
      try {
        const data = await adminRequest(`/users?${params}`, { signal: controller.signal });
        if (controller.signal.aborted) return;
        if (page > data.pages) {
          setPage(data.pages);
          return;
        }
        setUsers(data.items);
        setPagination(data);
      } catch (error) {
        if (!controller.signal.aborted) setLoadError(error.message);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 250);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [page, pageSize, query, status, role, refresh]);

  const openCreate = () => { setSaveError(""); setEditing(null); setForm(emptyForm); setModal(true); };
  const openEdit = (user) => {
    setSaveError("");
    setEditing(user);
    setForm({
      username: user.username,
      email: user.email,
      password: "",
      role: user.role,
      is_active: user.is_active,
    });
    setModal(true);
  };

  const closeProfile = () => {
    profileRequest.current?.abort();
    setViewProfile(null);
  };

  const openProfile = async (user) => {
    profileRequest.current?.abort();
    const controller = new AbortController();
    profileRequest.current = controller;
    setProfileLoading(true);
    setProfileError("");
    setViewProfile({ id: user.id, username: user.username });
    try {
      const profile = await adminRequest(`/users/admin/${user.id}/profile`, { signal: controller.signal });
      if (!controller.signal.aborted) setViewProfile(profile);
    } catch (error) {
      if (!controller.signal.aborted) setProfileError(error.message);
    } finally {
      if (!controller.signal.aborted) setProfileLoading(false);
    }
  };

  useEffect(() => () => profileRequest.current?.abort(), []);

  const save = async (event) => {
    event.preventDefault();
    if (savePending.current) return;
    savePending.current = true;
    setSaving(true);
    setSaveError("");
    const payload = { ...form };
    if (!payload.password) delete payload.password;
    try {
      if (editing) {
        await adminRequest(`/users/${editing.id}`, { method: "PUT", body: JSON.stringify(payload) });
        toast.success("Usuario actualizado");
      } else {
        await adminRequest("/users", { method: "POST", body: JSON.stringify(payload) });
        toast.success("Usuario creado");
      }
      setModal(false);
      reload();
    } catch (err) {
      setSaveError(err.message);
    } finally {
      savePending.current = false;
      setSaving(false);
    }
  };

  const remove = async (user) => {
    if (removePending.current) return;
    removePending.current = true;
    try {
      if (!(await confirmAction(`¿Dar de baja definitivamente la cuenta de ${user.username}? La cuenta perderá el acceso de forma permanente y sus aportes se conservarán.`))) return;
      setActionError("");
      setRemoving(true);
      await adminRequest(`/users/${user.id}`, { method: "DELETE" });
      toast.success("Cuenta dada de baja");
      reload();
    } catch (error) {
      setActionError(`No se pudo dar de baja a ${user.username}. ${error.message}`);
    } finally {
      removePending.current = false;
      setRemoving(false);
    }
  };

  return (
    <div className="admin-module">
      <div className="module-heading">
        <div><h1>Usuarios</h1><p>Accesos, roles y estado de las cuentas</p></div>
        <button className="admin-primary" onClick={openCreate}><Plus /> Nuevo usuario</button>
      </div>
      <div className="admin-toolbar admin-user-filters">
        <label>Buscar usuario o correo<input maxLength={100} value={query} onChange={(e) => { setQuery(e.target.value); setPage(1); }} /></label>
        <label>Rol<select value={role} onChange={(e) => { setRole(e.target.value); setPage(1); }}>
          <option value="all">Todos los roles</option>
          {Object.entries(roles).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select></label>
        <label>Estado de cuenta<select value={status} onChange={(e) => { setSearchParams((current) => {
            const next = new URLSearchParams(current);
            if (e.target.value === "all") next.delete("estado");
            else next.set("estado", e.target.value);
            return next;
          });
          setPage(1); }}>
          <option value="all">Todos los estados</option><option value="active">Activos</option><option value="inactive">Inactivos</option>
        </select></label>
      </div>
      {actionError && <p role="alert">{actionError}</p>}
      {removing && <p role="status">Dando de baja la cuenta…</p>}
      {loading && <p role="status">Cargando usuarios…</p>}
      {loadError && <div className="admin-empty">
        <p role="alert">No se pudo cargar la lista. {loadError}</p>
        <button type="button" className="admin-secondary" onClick={reload}>Reintentar carga</button>
      </div>}
      <AdminPagination compact page={page} pages={pagination.pages} total={pagination.total} onChange={setPage} pageSize={pageSize} onPageSizeChange={(value) => { setPageSize(value); setPage(1); }} />
      <section className="admin-panel table-panel">
        <table className="admin-table">
          <thead>
            <tr><th>Usuario</th><th>Correo</th><th>Rol</th><th>Estado de cuenta</th><th className="actions">Acciones</th></tr>
          </thead>
          <tbody>{users.map((user) => (
            <tr key={user.id}>
              <td><strong>{user.username}</strong></td><td>{user.email}</td>
              <td><span className={`admin-badge role-${user.role}`}>{roles[user.role] || user.role}</span></td>
              <td><span className={`admin-status ${user.is_active ? "online" : "offline"}`}>{user.is_active ? <UserCheck /> : <UserX />}{user.account_deleted ? "Baja definitiva" : user.is_active ? "Activo" : user.reactivation_requested ? "Solicita reactivación" : "Inactivo"}</span></td>
              <td className="actions"><button title="Ver perfil de" aria-label={`Ver perfil de ${user.username}`} onClick={() => openProfile(user)}><Eye /></button><button title="Editar cuenta de" aria-label={`Editar cuenta de ${user.username}`} onClick={() => openEdit(user)}><Edit3 /></button>{!user.account_deleted && <button disabled={removing} className="danger" title="Baja definitiva" aria-label={`Dar de baja definitivamente a ${user.username}`} onClick={() => remove(user)}><Trash2 /></button>}</td>
            </tr>
          ))}</tbody>
        </table>
        {!loading && !loadError && !users.length && <div className="admin-empty">No se encontraron usuarios.</div>}
        <AdminPagination page={page} pages={pagination.pages} total={pagination.total} onChange={setPage} pageSize={pageSize} onPageSizeChange={(value) => { setPageSize(value); setPage(1); }} />
      </section>

      {modal && <div className="admin-modal-backdrop" onMouseDown={(e) => !savePending.current && e.target === e.currentTarget && setModal(false)}>
        <div className="admin-modal">
          <div className="modal-heading"><h2>{editing ? "Editar usuario" : "Nuevo usuario"}</h2><button type="button" aria-label="Cerrar editor" disabled={saving} onClick={() => setModal(false)}><X /></button></div>
          <form onSubmit={save} className="admin-form-grid">
            <label>Usuario<input disabled={saving} required minLength="3" maxLength="100" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} /></label>
            <label>Correo<input disabled={saving} required type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>
            <label>Contraseña<input disabled={saving} required={!editing} minLength={editing && !form.password ? undefined : 8} maxLength="72" type="password" value={form.password} placeholder={editing ? "Sin cambios" : ""} onChange={(e) => setForm({ ...form, password: e.target.value })} /></label>
            <label>Rol<select disabled={saving} value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}><option value="player">Jugador</option><option value="facilitador">Facilitador</option><option value="admin">Administrador</option></select></label>
            {editing && !editing.account_deleted && <label className="check-row"><input type="checkbox" disabled={saving} checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} /> Cuenta activa</label>}
            {saveError && <p className="modal-actions" role="alert">No se pudo guardar la cuenta. {saveError}</p>}
            <div className="modal-actions"><button type="button" className="admin-secondary" disabled={saving} onClick={() => setModal(false)}>Cancelar</button><button className="admin-primary" disabled={saving}>{saving ? "Guardando…" : "Guardar"}</button></div>
          </form>
        </div>
      </div>}

      {viewProfile && <div className="admin-modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && closeProfile()}>
        <div className="admin-modal admin-user-profile-modal">
          <div className="modal-heading"><h2>Perfil de {viewProfile.nickname || viewProfile.username}</h2><button type="button" aria-label="Cerrar perfil" onClick={closeProfile}><X /></button></div>
          {profileLoading && <div className="admin-loading" role="status">Cargando perfil…</div>}
          {profileError && <div className="admin-empty">
            <p role="alert">No se pudo cargar el perfil. {profileError}</p>
            <button type="button" className="admin-secondary" onClick={() => openProfile(viewProfile)}>Reintentar carga</button>
          </div>}
          {!profileLoading && !profileError && <AdminUserProfile profile={viewProfile} />}
        </div>
      </div>}
    </div>
  );
}

function AdminUserProfile({ profile }) {
  const displayName = profile.nickname || profile.username;
  return <div className="admin-user-profile">
    <div className="admin-profile-identity">
      <div className="admin-profile-avatar">{profile.avatar_url ? <img src={profile.avatar_url} alt="" /> : displayName.charAt(0).toUpperCase()}</div>
      <div><small>@{profile.username}</small><h3>{displayName}</h3><p>{profile.bio || "Sin biografía pública."}</p></div>
      <span className={`admin-status ${profile.is_active ? "online" : "offline"}`}>{profile.is_active ? "Activo" : "Inactivo"}</span>
    </div>
    <div className="admin-profile-stats">
      <div><strong>{profile.stats.favorite_games}</strong><span>Favoritos</span></div>
      <div><strong>{profile.stats.rules_viewed}</strong><span>Reglas vistas</span></div>
    </div>
    <section className="admin-profile-sessions"><h4>Partidas registradas</h4><div><span><strong>{profile.stats.active_sessions}</strong>Partidas activas</span><span><strong>{profile.stats.completed_sessions}</strong>Partidas finalizadas</span></div></section>
    <section><h4>Preferencias de juego</h4><div className="admin-profile-tags">{profile.favorite_genres.length ? profile.favorite_genres.map((genre) => <span key={genre}>{genre}</span>) : <span>Sin géneros definidos</span>}</div><dl><div><dt>Experiencia</dt><dd>{profile.experience_level}</dd></div><div><dt>Estilo</dt><dd>{profile.play_style || "Sin definir"}</dd></div><div><dt>Duración</dt><dd>{profile.preferred_duration || "Cualquiera"}</dd></div><div><dt>Grupo</dt><dd>{profile.preferred_group_size || "Flexible"}</dd></div></dl></section>
    <section><h4>Insignias aprobadas</h4><div className="admin-profile-badges">{profile.badges.length ? profile.badges.map((badge) => <span key={badge.id}>{badge.image_url ? <img src={badge.image_url} alt="" /> : <Award />}{badge.name}{badge.is_favorite && <small>Favorita</small>}</span>) : <p>Sin insignias aprobadas.</p>}</div></section>
    <section><h4>Comunidad</h4><div className="admin-profile-community"><span className={profile.looking_for_players ? "active" : ""}>Busca jugadores</span><span className={profile.open_to_events ? "active" : ""}>Eventos</span><span className={profile.open_to_messages ? "active" : ""}>Mensajes</span></div></section>
  </div>;
}
