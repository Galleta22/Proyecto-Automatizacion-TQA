import { confirmAction } from "../../ui/confirmAction";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  LuAward as Award, LuCheck as Check, LuImageOff as ImageOff,
  LuPlus as Plus, LuSearch as Search, LuSquarePen as Edit,
  LuTrash2 as Trash, LuUpload as Upload, LuUserPlus as UserPlus,
  LuChevronDown as ChevronDown, LuX as X,
} from "react-icons/lu";
import { toast } from "react-toastify";
import { uploadProfileImage } from "../../services/api";
import { adminRequest } from "./adminApi";
import useAdminAction, { AdminActionStatus } from "./useAdminAction";

const emptyForm = { name: "", description: "", image_url: "", is_active: true };

export default function AdminBadges() {
  const action = useAdminAction();
  const [data, setData] = useState({ badges: [], users: [] });
  const [selectedId, setSelectedId] = useState("");
  const [query, setQuery] = useState("");
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [imageFile, setImageFile] = useState(null);
  const [saving, setSaving] = useState(false);

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [saveError, setSaveError] = useState("");
  const savePending = useRef(false);
  const reviewPending = useRef(false);
  const [reviewingId, setReviewingId] = useState(null);
  const [reviewError, setReviewError] = useState("");

  const load = async (preferredId) => {
    setLoading(true);
    setLoadError("");
    try {
      const result = await adminRequest("/badges/admin");
      setData(result);
      setSelectedId((current) => {
        const nextId = preferredId || current;
        return result.badges.some((badge) => badge.id === nextId) ? nextId : result.badges[0]?.id || "";
      });
    } catch (error) {
      setLoadError(error.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const selected = data.badges.find((badge) => badge.id === selectedId);
  const isTutor = selected?.slug === "tutor" || selected?.is_system;
  const stateByUser = new Map((selected?.states || []).map((state) => [state.user_id, state]));
  const pending = data.badges.flatMap((badge) => badge.states
    .filter((state) => state.status === "pending")
    .map((state) => ({ ...state, badgeName: badge.name })));
  const holders = (selected?.states || []).filter((state) => state.status === "approved");
  const users = useMemo(() => data.users.filter((user) =>
    `${user.username} ${user.email}`.toLowerCase().includes(query.toLowerCase())
  ), [data.users, query]);

  const openCreate = () => {
    setForm(emptyForm);
    setImageFile(null);
    setSaveError("");
    setModal("create");
  };

  const openEdit = () => {
    setForm({
      name: selected.name,
      description: selected.description,
      image_url: selected.image_url,
      is_active: selected.is_active,
    });
    setImageFile(null);
    setSaveError("");
    setModal("edit");
  };

  const save = async (event) => {
    event.preventDefault();
    if (savePending.current) return;
    savePending.current = true;
    setSaveError("");
    setSaving(true);
    try {
      let imageUrl = form.image_url;
      if (imageFile) imageUrl = (await uploadProfileImage(imageFile)).url;
      const payload = { ...form, image_url: imageUrl };
      const path = modal === "edit" ? `/badges/admin/${selected.id}` : "/badges/admin";
      const method = modal === "edit" ? "PUT" : "POST";
      const saved = await adminRequest(path, { method, body: JSON.stringify(payload) });
      toast.success("Insignia guardada");
      setModal(null);
      await load(saved.id);
    } catch (error) {
      setSaveError(error.message);
    } finally {
      savePending.current = false;
      setSaving(false);
    }
  };

  const remove = () => action.run("Eliminando insignia…", async () => {
    if (!(await confirmAction(`Eliminar la insignia "${selected.name}" y sus asignaciones?`))) return;
    await adminRequest(`/badges/admin/${selected.id}`, { method: "DELETE" });
    setSelectedId("");
    toast.success("Insignia eliminada");
    await load();
  });

  const toggleEligibility = (userId) => action.run("Actualizando elegibilidad…", async () => {
    const result = await adminRequest(`/badges/admin/${selected.id}/eligibility/${userId}`, { method: "PUT" });
    toast.success(result.detail);
    await load();
  });

  const toggleAssignment = (userId) => action.run("Actualizando asignación…", async () => {
    const result = await adminRequest(`/badges/admin/${selected.id}/assignment/${userId}`, { method: "PUT" });
    toast.success(result.detail);
    await load();
  });

  const review = async (state, status) => {
    if (reviewPending.current) return;
    reviewPending.current = true;
    setReviewingId(state.id);
    setReviewError("");
    try {
      await adminRequest(`/badges/admin/states/${state.id}`, {
        method: "PUT",
        body: JSON.stringify({ status }),
      });
      toast.success(status === "approved" ? "Solicitud aprobada" : "Solicitud rechazada");
      await load();
    } catch (error) {
      setReviewError(`No se pudo resolver la solicitud de ${state.username} para ${state.badgeName}. ${error.message}`);
    } finally {
      reviewPending.current = false;
      setReviewingId(null);
    }
  };

  const revoke = (state) => action.run("Revocando insignia…", async () => {
    if (!(await confirmAction(`¿Revocar ${selected.name} a ${state.username}?`))) return;
    await adminRequest(`/badges/admin/states/${state.id}`, { method: "DELETE" });
    toast.success("Insignia revocada");
    await load();
  });

  return <div className="admin-module badge-admin">
    <div className="module-heading">
      <div><h1>Insignias</h1><p>Catálogo, solicitudes y validación manual de reconocimientos</p></div>
      <button className="admin-primary" onClick={openCreate}><Plus /> Nueva insignia</button>
    </div>

    <AdminActionStatus action={action} />
    {loading && <p role="status">Cargando insignias…</p>}
    {loadError && <div className="admin-empty">
      <p role="alert">No se pudieron cargar las insignias. {loadError}</p>
      <button type="button" className="admin-secondary" onClick={() => load()}>Reintentar carga</button>
    </div>}
    {(data.badges.length > 0 || (!loading && !loadError)) && <section className="admin-panel badge-review-queue">
      <h2>Solicitudes pendientes ({pending.length})</h2>
      <details className="badge-tutor-help">
        <summary>Cómo se asigna la insignia Tutor</summary>
      <p>Cualquier usuario puede solicitar la insignia Tutor. Administración revisa las solicitudes y puede asignarla directamente. Una vez aprobada, permite participar como tutor en mesas que buscan a alguien para explicar el juego o acompañar la partida.</p>
      </details>
      {reviewError && <p role="alert">{reviewError}</p>}
      {reviewingId && <p role="status">Guardando decisión…</p>}
      {pending.length ? <ul>
        {pending.map((state) => <li key={state.id}>
          <div>
            <strong>{state.username}</strong>
            <span>{state.email} · {state.badgeName}</span>
          </div>
          <div className="badge-review-actions">
            <button type="button" className="admin-secondary" disabled={Boolean(action.pending || reviewingId || loading || loadError)} onClick={() => review(state, "approved")} aria-label={`Aprobar solicitud de ${state.username} para ${state.badgeName}`}><Check /> Aprobar</button>
            <button type="button" className="admin-secondary" disabled={Boolean(action.pending || reviewingId || loading || loadError)} onClick={() => review(state, "rejected")} aria-label={`Rechazar solicitud de ${state.username} para ${state.badgeName}`}><X /> Rechazar</button>
          </div>
        </li>)}
      </ul> : <p>No hay solicitudes pendientes.</p>}
    </section>}
    {data.automatic_badges?.length > 0 && <details className="admin-panel automatic-badges">
      <summary><Award aria-hidden="true" /><span>Insignias automáticas</span><small>{data.automatic_badges.length}</small><ChevronDown className="automatic-badge-chevron" aria-hidden="true" /></summary>
      <dl className="automatic-badge-list">
        {data.automatic_badges.map((badge) => {
          const granted = data.badges.find((item) => item.slug === badge.slug);
          const count = granted?.states.filter((state) => state.status === "approved").length ?? 0;
          return <div key={badge.slug}>
            <dt>{badge.name}</dt>
            <dd>{badge.description}</dd>
            <dd>{count} {count === 1 ? "usuario con esta insignia" : "usuarios con esta insignia"}</dd>
          </div>;
        })}
      </dl>
    </details>}
    {(data.badges.length > 0 || (!loading && !loadError)) && <div className="badge-admin-layout">
      <section className="admin-panel badge-catalog">
        <div className="panel-heading"><h2>Catálogo</h2><span>{data.badges.length}</span></div>
        <div className="badge-catalog-list">
          {data.badges.map((badge) => <button className={badge.id === selectedId ? "active" : ""} key={badge.id} aria-pressed={badge.id === selectedId} onClick={() => setSelectedId(badge.id)}>
            <BadgeImage badge={badge} />
            <span><strong>{badge.name}</strong><small>{badge.is_system ? "Permanente · " : ""}{badge.states.filter((state) => state.status === "approved").length} aprobadas</small></span>
          </button>)}
        </div>
      </section>

      {selected ? <div className="badge-admin-detail">
        <section className="admin-panel badge-summary">
          <BadgeImage badge={selected} />
          <div><small>{isTutor ? "Insignia permanente del sistema" : "Insignia seleccionada"}</small><h2>{selected.name}</h2><p>{selected.description || "Sin descripción"}</p></div>
          <div className="badge-summary-actions">
            <button title="Editar" aria-label="Editar" onClick={openEdit}><Edit /></button>
            {!isTutor && <button className="danger" title="Eliminar" aria-label="Eliminar" disabled={Boolean(action.pending || reviewingId || loading || loadError)} onClick={remove}><Trash /></button>}
          </div>
        </section>

        {isTutor && <section className="admin-panel badge-holders">
          <div className="panel-heading"><h2>Poseedores de Insignia Tutor</h2><span>{holders.length}</span></div>
          {holders.length ? holders.map((state) => <div className="badge-request-row" key={state.id}>
            <div><strong>{state.username}</strong><small>{state.email}</small></div>
            <button className="revoke" disabled={Boolean(action.pending || reviewingId || loading || loadError)} onClick={() => toggleAssignment(state.user_id)}><Trash /> Revocar</button>
          </div>) : <div className="admin-empty">Ningún usuario posee esta insignia.</div>}
        </section>}

        <section className={`admin-panel badge-users ${isTutor ? "tutor-management" : ""}`}>
          <div className="panel-heading"><h2>{isTutor ? "Asignar o revocar Insignia Tutor" : "Habilitar solicitudes"}</h2></div>
          <div className="badge-user-search"><Search /><input value={query} onChange={(event) => setQuery(event.target.value)} aria-label="Buscar usuario" placeholder="Buscar usuario" /></div>
          <div className="badge-user-list">{users.length === 0 && <p>No se encontraron usuarios.</p>}{users.map((user) => {
            const state = stateByUser.get(user.id);
            const locked = state?.status === "pending";
            return <div key={user.id}>
              <span><strong>{user.username}</strong><small>{user.email}</small></span>
              {state?.status === "approved"
                ? <button className="revoke" disabled={Boolean(action.pending || reviewingId || loading || loadError)} onClick={() => isTutor ? toggleAssignment(user.id) : revoke(state)}><Trash /> Revocar</button>
                : isTutor
                  ? <button disabled={Boolean(action.pending || reviewingId || loading || loadError)} onClick={() => toggleAssignment(user.id)}><UserPlus /> Asignar</button>
                : <button disabled={locked || Boolean(action.pending || reviewingId || loading || loadError)} className={state?.status === "eligible" || state?.status === "rejected" ? "enabled" : ""} onClick={() => toggleEligibility(user.id)}>
                    <UserPlus /> {stateLabel(state)}
                  </button>}
            </div>;
          })}</div>
        </section>
      </div> : <div className="admin-empty">Crea una insignia para comenzar.</div>}
    </div>}

    {modal && <div className="admin-modal-backdrop" onMouseDown={(event) => !savePending.current && event.target === event.currentTarget && setModal(null)}>
      <form className="admin-modal badge-editor" onSubmit={save}>
        <div className="modal-heading"><h2>{modal === "edit" ? "Editar insignia" : "Nueva insignia"}</h2><button aria-label="Cerrar ventana" disabled={saving} type="button" onClick={() => setModal(null)}><X /></button></div>
        <fieldset className="badge-editor-fields" disabled={saving} style={{ border: 0, margin: 0, minWidth: 0 }}>
          <label>Nombre<input required disabled={modal === "edit" && isTutor} minLength="2" maxLength="100" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label>
          <label>Descripción<textarea maxLength="500" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></label>
          <label className="badge-image-field">
            <Upload /><span><strong>{imageFile?.name || (form.image_url ? "Cambiar imagen" : "Añadir imagen")}</strong><small>JPG, PNG o WebP</small></span>
            <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => setImageFile(event.target.files?.[0] || null)} />
          </label>
          {(form.image_url || imageFile) && <button type="button" className="badge-remove-image" onClick={() => { setForm({ ...form, image_url: "" }); setImageFile(null); }}><ImageOff /> Quitar imagen</button>}
          <label className="check-row"><input type="checkbox" disabled={modal === "edit" && isTutor} checked={form.is_active} onChange={(event) => setForm({ ...form, is_active: event.target.checked })} /> {modal === "edit" && isTutor ? "Insignia permanente y activa" : "Insignia activa"}</label>
        </fieldset>
        {saveError && <p className="admin-empty" role="alert">No se pudo guardar la insignia. {saveError}</p>}
        <div className="manual-admin-actions">
          <button type="button" className="admin-secondary" disabled={saving} onClick={() => setModal(null)}>Cancelar</button>
          <button className="admin-primary" disabled={saving}>{saving ? "Guardando…" : "Guardar"}</button>
        </div>
      </form>
    </div>}
  </div>;
}

function BadgeImage({ badge }) {
  return badge.image_url ? <img className="badge-admin-image" src={badge.image_url} alt="" /> : <span className="badge-admin-image fallback"><Award /></span>;
}

function stateLabel(state) {
  if (!state) return "Habilitar";
  if (state.status === "eligible" || state.status === "rejected") return "Habilitado";
  if (state.status === "pending") return "Pendiente";
  return "Aprobada";
}
