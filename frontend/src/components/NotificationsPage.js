import { confirmAction } from "../ui/confirmAction";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { LuBell as Bell, LuCheckCheck as CheckAll, LuTrash2 as Trash2, LuX as X } from "react-icons/lu";
import { deleteAllReadNotifications, deleteNotification, getNotifications, markAllNotificationsRead, markNotificationRead } from "../services/api";
import AdminPagination from "./admin/AdminPagination";
import "./NotificationsPage.css";

const NOTIF_TYPES = [
  { value: "", label: "Todos los tipos" },
  { value: "manual_report", label: "Avisos de manuales" },
  { value: "manual_report_resolved", label: "Manuales revisados" },
  { value: "table_join_request", label: "Solicitudes" },
  { value: "table_request_approved", label: "Aprobadas" },
  { value: "table_request_rejected", label: "Rechazadas" },
  { value: "table_cancelled", label: "Mesas canceladas" },
  { value: "table_finished", label: "Mesas finalizadas" },
  { value: "badge_request", label: "Insignias" },
  { value: "badge_approved", label: "Insignia aprobada" },
  { value: "badge_assigned", label: "Insignia asignada" },
  { value: "badge_revoked", label: "Insignia revocada" },
  { value: "badge_rejected", label: "Insignia rechazada" },
];

export default function NotificationsPage({ onClose }) {
  const navigate = useNavigate();
  const dialogRef = useRef(null);
  const close = () => onClose ? onClose() : navigate("/", { replace: true });
  useEffect(() => {
    const dialog = dialogRef.current;
    const previousOverflow = document.body.style.overflow;
    dialog.showModal();
    document.body.style.overflow = "hidden";
    return () => { dialog.close(); document.body.style.overflow = previousOverflow; };
  }, []);
  const [data, setData] = useState({ items: [], unread: 0, total: 0, pages: 1, page: 1 });
  const [loading,setLoading] = useState(true);
  const [error,setError] = useState("");
  const [busy,setBusy] = useState(false);
  const [page, setPage] = useState(1);
  const [typeFilter, setTypeFilter] = useState("");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const pageSize = 20;

  const load = useCallback(() => {
    setLoading(true);setError("");
    const params = new URLSearchParams({ page: String(page), page_size: String(pageSize) });
    if (typeFilter) params.set("type_filter", typeFilter);
    if (unreadOnly) params.set("unread_only", "true");
    return getNotifications(`?${params}`).then((result) => { setData(result); if (page > Math.max(1, result.pages)) setPage(Math.max(1, result.pages)); }).catch((err) => setError(err.message)).finally(()=>setLoading(false));
  }, [page, typeFilter, unreadOnly]);

  useEffect(() => { load(); }, [load]);

  const mutate = async (operation) => {
    if(busy) return false; setBusy(true);setError("");
    try {await operation();window.dispatchEvent(new Event("ludisist:notification"));await load();return true;}
    catch(err){setError(err.message);return false;}finally{setBusy(false);}
  };
  const open = async (notification) => {
    if (!notification.is_read && !(await mutate(()=>markNotificationRead(notification.id)))) return;
    if(notification.link){close();navigate(notification.link);}
  };
  const markAll = () => mutate(markAllNotificationsRead);
  const del = (id) => mutate(()=>deleteNotification(id));
  const delAllRead = async () => {if(await confirmAction("¿Eliminar todas las notificaciones leídas?")) await mutate(deleteAllReadNotifications);};

  return createPortal(
    <dialog ref={dialogRef} className="notifications-popup" aria-labelledby="notifications-title" onCancel={(e) => { e.preventDefault(); close(); }} onClick={(e) => { if (e.target === e.currentTarget) close(); }}>
    <div className="notifications-page">
      <div className="notifications-header">
        <div className="notifications-title-row"><div className="notifications-title"><Bell /><h1 id="notifications-title">Notificaciones</h1></div><button type="button" className="notifications-close" aria-label="Cerrar notificaciones" onClick={close}><X /></button></div>
        <div className="notifications-actions">
          <select aria-label="Filtrar por tipo" className="toolbar-select" value={typeFilter} onChange={(e) => { setTypeFilter(e.target.value); setPage(1); }}>
            {NOTIF_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
          <label className="notif-unread-toggle"><input type="checkbox" checked={unreadOnly} onChange={(e) => { setUnreadOnly(e.target.checked); setPage(1); }} /> Solo no leídas</label>
          {data.unread > 0 && <button disabled={busy} className="toolbar-btn" onClick={markAll}><CheckAll /> Marcar leídas</button>}
          <button disabled={busy || data.total === 0 || unreadOnly || !data.items.some((n)=>n.is_read)} className="toolbar-btn" onClick={delAllRead}><Trash2 /> Eliminar leídas</button>
        </div>
      </div>

      <div className="notifications-stats"><span><strong>{data.unread}</strong> sin leer en tu cuenta · <strong>{data.total}</strong> coinciden con los filtros</span></div>



      {loading && <p role="status">Cargando notificaciones…</p>}
      {error && <div role="alert" className="ui-status error">{error}<button onClick={load}>Reintentar</button></div>}
      <div className="notifications-list-full">
        {data.items.map((n) => (
          <div className={`notif-card ${n.is_read ? "" : "unread"}`} key={n.id}>
            <div className="notif-card-body" onClick={() => open(n)} role="button" tabIndex={0} onKeyDown={(e) => e.key === "Enter" && open(n)}>
              <div className="notif-card-header">
                <strong>{n.title}</strong>
                <time>{formatDate(n.created_at)}</time>
              </div>
              <p>{n.message}</p>
              <span className="notif-type-tag">{typeLabel(n.type)}</span>
            </div>
            <button disabled={busy} aria-label={`Eliminar notificación: ${n.title}`} className="notif-card-delete" onClick={() => del(n.id)} title="Eliminar"><X /></button>
          </div>
        ))}
        {!loading && !error && !data.items.length && <div className="notif-empty"><p>No hay notificaciones{typeFilter ? " de este tipo" : ""}{unreadOnly ? " sin leer" : ""}.</p></div>}
      </div>

      {data.pages > 1 && <AdminPagination page={data.page} pages={data.pages} total={data.total} onChange={setPage} />}
    </div>
    </dialog>, document.body
  );
}

function typeLabel(type) {
  const found = NOTIF_TYPES.find((t) => t.value === type);
  return found?.label || type;
}

function formatDate(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat("es-BO", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}
