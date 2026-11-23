import { useEffect, useState } from "react";
import { confirmAction } from "./confirmAction";

const OVERLAYS = ".modal-overlay, .admin-modal-backdrop, .profile-modal-backdrop, .session-modal-backdrop, .match-modal-backdrop, .mini-profile-backdrop, .game-detail-overlay, .manual-upload-backdrop, .manual-modal-backdrop, .match-backdrop";
const focusable = (root) => [...root.querySelectorAll('a[href], button, input:not([type="hidden"]), select, textarea, [tabindex="0"]')].filter((e) => !e.disabled && e.getClientRects().length);

// Compatibilidad de overlays existentes. Los componentes nuevos deben usar <dialog>.
export default function UXInfrastructure() {
  const [requestError,setRequestError] = useState("");
  useEffect(() => {
    const showError=(event)=>setRequestError(event.detail || "No se pudo cargar la información. Vuelve a intentarlo.");
    window.addEventListener("ludisist:request-error",showError);
    const records = new Map(); let top = null; let oldOverflow = null; let counter = 0;
    const bypass = new WeakSet();
    const sync = () => {
      document.querySelectorAll('label:not([for])').forEach((label)=>{
        if(label.querySelector('input,select,textarea')) return;
        const sibling=label.nextElementSibling;
        const field=sibling?.matches('input,select,textarea')?sibling:sibling?.querySelector('input,select,textarea');
        if(field&&!field.labels?.length){if(!field.id)field.id=`legacy-field-${++counter}`;label.htmlFor=field.id;}
      });
      document.querySelectorAll('button[title]:not([aria-label])').forEach((button)=>{if(!button.textContent.trim())button.setAttribute("aria-label",button.title);});
      const overlays = [...document.querySelectorAll(OVERLAYS)].filter((e) => e.getClientRects().length);
      for (const [overlay, record] of records) {
        if (!overlays.includes(overlay)) {
          records.delete(overlay);
          if (record.origin?.isConnected && (!top || !top.isConnected)) record.origin.focus();
        }
      }
      for (const overlay of overlays) {
        if (records.has(overlay)) continue;
        const panel = overlay.firstElementChild; if (!panel) continue;
        const title = panel.querySelector("h1, h2, h3");
        if (title && !title.id) title.id = `overlay-title-${++counter}`;
        panel.setAttribute("role", "dialog"); panel.setAttribute("aria-modal", "true"); panel.tabIndex = -1;
        if (title) panel.setAttribute("aria-labelledby", title.id); else panel.setAttribute("aria-label", "Ventana de Ludisist");
        records.set(overlay, { origin: document.activeElement, panel, dirty: false });
        panel.querySelectorAll('button').forEach((button) => {
          if (!button.textContent.trim() && !button.getAttribute("aria-label") && button.querySelector('svg')) {
            const title = button.getAttribute("title");
            if (title) button.setAttribute("aria-label", title);
            else if (button.querySelector('.lucide-x')) button.setAttribute("aria-label", "Cerrar ventana");
          }
        });
        (focusable(panel)[0] || panel).focus();
      }
      top = overlays[overlays.length - 1] || null;
      const locked = overlays.length || document.querySelector('dialog[open]');
      if (locked && oldOverflow === null) { oldOverflow = document.body.style.overflow; document.body.style.overflow = "hidden"; }
      if (!locked && oldOverflow !== null) { document.body.style.overflow = oldOverflow; oldOverflow = null; }
    };
    const observer = new MutationObserver(sync); observer.observe(document.body, { childList: true, subtree: true }); sync();
    const onInput = (event) => {
      const overlay = event.target.closest(OVERLAYS);
      if (overlay && records.has(overlay) && event.target.closest('form, .scoreboard-modal')) records.get(overlay).dirty = true;
    };
    const onClick = async (event) => {
      if (document.querySelector('dialog[open]') || !top) return;
      const record = records.get(top); if (!record?.dirty) return;
      if (event.type === "mousedown" && event.target !== top) return;
      if (record.confirming) {event.preventDefault();event.stopPropagation();return;}
      const button = event.target.closest("button");
      const isDismiss = event.target === top || (button && (/cancelar|cerrar|volver|descartar/i.test((button.textContent || "") + (button.getAttribute("aria-label") || "") + (button.title || "")) || button.querySelector('.lucide-x'))) || event.target.closest('a[href]');
      if (!isDismiss || bypass.has(event.target)) { bypass.delete(event.target); return; }
      event.preventDefault(); event.stopPropagation();
      record.confirming = true;
      if (await confirmAction("Tienes cambios pendientes. ¿Quieres salir y descartar los cambios que aún no se guardaron?", { title:"Cambios sin guardar", confirmLabel:"Descartar y salir" })) {
        record.dirty = false; bypass.add(event.target); event.target.dispatchEvent(new MouseEvent(event.type, {bubbles:true,cancelable:true}));
      }
      record.confirming = false;
    };
    const onKey = (event) => {
      if (document.querySelector('dialog[open]') || !top) return;
      const record = records.get(top); if (!record) return;
      if (event.key === "Escape") {
        event.preventDefault(); event.stopImmediatePropagation();
        const close = record.panel.querySelector('button[aria-label*="Cerrar"], button[title*="Cerrar"], button:has(.lucide-x)');
        if (close) close.click(); else top.click();
      }
      if (event.key === "Tab") {
        const items = focusable(record.panel); const index = items.indexOf(document.activeElement);
        if (!items.length) { event.preventDefault(); record.panel.focus(); }
        else if ((event.shiftKey && index <= 0) || (!event.shiftKey && (index < 0 || index === items.length-1))) { event.preventDefault(); items[event.shiftKey ? items.length-1 : 0].focus(); }
      }
    };
    const onUnload = (event) => { if ([...records.values()].some((r) => r.dirty)) { event.preventDefault(); event.returnValue = ""; } };
    const onSaved = () => {for(const [overlay,record] of records) if(overlay.querySelector('.autosave-status')?.textContent?.startsWith('Guardado')) record.dirty=false;};
    document.addEventListener("ludisist:form-saved",onSaved);
    document.addEventListener("mousedown", onClick, true);
    document.addEventListener("input", onInput, true); document.addEventListener("change", onInput, true);
    document.addEventListener("click", onClick, true); document.addEventListener("keydown", onKey, true); window.addEventListener("beforeunload", onUnload);
    return () => { window.removeEventListener("ludisist:request-error",showError); observer.disconnect(); document.removeEventListener("mousedown",onClick,true); document.removeEventListener("ludisist:form-saved",onSaved); document.removeEventListener("input", onInput, true); document.removeEventListener("change", onInput, true); document.removeEventListener("click", onClick, true); document.removeEventListener("keydown", onKey, true); window.removeEventListener("beforeunload", onUnload); if (oldOverflow !== null) document.body.style.overflow = oldOverflow; };
  }, []);
  return requestError ? <aside className="ui-global-error" role="alert"><strong>No se pudo actualizar la información</strong><p>{requestError}</p><button onClick={()=>window.location.reload()}>Reintentar carga</button><button onClick={()=>setRequestError("")}>Cerrar aviso</button></aside> : null;
}
