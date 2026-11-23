import React, { useRef, useState, useEffect, useCallback } from "react";
import { LuMinus as Minus, LuGripVertical as Grip } from "react-icons/lu";
import "./FloatingPanel.css";

function loadPos(id, defaultPosition) {
  try {
    const saved = sessionStorage.getItem(`fp_pos_${id}`);
    if (!saved) return null;
    const p = JSON.parse(saved);
    if (!p || typeof p !== "object") return null;
    const { left, top } = p;
    if (typeof left === "number" && typeof top === "number" && isFinite(left) && isFinite(top)) {
      if (left >= -100 && left <= window.innerWidth + 100 && top >= -100 && top <= window.innerHeight + 100) {
        return { left, top };
      }
    }
    return null;
  } catch { return null; }
}

function defaultPos(defaultPosition, index) {
  const baseTop = 84 + (index || 0) * 60;
  return defaultPosition === "left"
    ? { left: 20, top: baseTop }
    : { left: window.innerWidth - 300, top: baseTop };
}

export default function FloatingPanel({
  id, title, icon: Icon, children, mode = "expanded",
  onModeChange, defaultPosition = "right", compactWidth,
  stackIndex = 0,
}) {
  const [pos, setPos] = useState(() => loadPos(id) || defaultPos(defaultPosition, stackIndex));
  const containerRef = useRef(null);
  const dragRef = useRef(null);
  const bodyRef = useRef(null);
  const sizeW = compactWidth || 280;

  const getClamped = useCallback((x, y, w, h) => {
    return {
      x: Math.max(16, Math.min(x, window.innerWidth - w - 16)),
      y: Math.max(72, Math.min(y, window.innerHeight - (h || 300) - 16)),
    };
  }, []);

  const savePos = useCallback((p) => {
    try { sessionStorage.setItem(`fp_pos_${id}`, JSON.stringify(p)); } catch {}
  }, [id]);

  useEffect(() => {
    if (mode !== "expanded") return;
    const el = bodyRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const c = containerRef.current;
      if (!c) return;
      const r = c.getBoundingClientRect();
      const clamped = getClamped(r.left, r.top, r.width || sizeW, r.height);
      if (clamped.x !== r.left || clamped.y !== r.top) {
        c.style.left = `${clamped.x}px`;
        c.style.top = `${clamped.y}px`;
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [mode, getClamped, sizeW]);

  useEffect(() => {
    if (mode !== "expanded") return;
    const onResize = () => {
      const el = containerRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const clamped = getClamped(r.left, r.top, r.width || sizeW, r.height);
      if (clamped.x !== r.left || clamped.y !== r.top) {
        el.style.left = `${clamped.x}px`;
        el.style.top = `${clamped.y}px`;
      }
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [mode, getClamped, sizeW]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || mode !== "expanded") return;
    const p = loadPos(id, defaultPosition) || defaultPos(defaultPosition, stackIndex);
    el.style.left = `${p.left}px`;
    el.style.top = `${p.top}px`;
    setPos(p);
  }, [id, mode, defaultPosition, stackIndex]);

  const handleMouseDown = (e) => {
    if (e.pointerType === "touch" && !e.target.closest(".fp-header")) return;
    if (e.target.closest("button, input, select, textarea, iframe")) return;
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const offsetX = e.clientX - rect.left;
    const offsetY = e.clientY - rect.top;
    dragRef.current = { offsetX, offsetY, w: rect.width || sizeW, h: rect.height || 0 };

    const onMove = (ev) => {
      const d = dragRef.current;
      if (!d) return;
      const x = ev.clientX - d.offsetX;
      const y = ev.clientY - d.offsetY;
      const clamped = getClamped(x, y, d.w, d.h);
      el.style.left = `${clamped.x}px`;
      el.style.top = `${clamped.y}px`;
    };

    const onUp = () => {
      if (dragRef.current) {
        const el2 = containerRef.current;
        if (el2) {
          const r = el2.getBoundingClientRect();
          const sp = { left: r.left, top: r.top };
          setPos(sp);
          savePos(sp);
        }
      }
      dragRef.current = null;
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
    };

    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
  };

  if (mode !== "expanded") return null;

  return (
    <div
      ref={containerRef}
      className="floating-panel"
      style={{ left: pos.left, top: pos.top, width: sizeW }}
      onPointerDown={handleMouseDown}
    >
      <div className="fp-header">
        <div className="fp-header-left">
          <Icon />
          <span className="fp-title">{title}</span>
        </div>
        <div className="fp-header-right">
          <button className="fp-drag-control" title="Mover panel con las flechas; Inicio restablece posición" aria-label={`Mover panel ${title}`} onKeyDown={(e)=>{
            if(!["ArrowLeft","ArrowRight","ArrowUp","ArrowDown","Home"].includes(e.key))return;e.preventDefault();
            const rect=containerRef.current.getBoundingClientRect();const initial=defaultPos(defaultPosition,stackIndex);const delta={ArrowLeft:[-24,0],ArrowRight:[24,0],ArrowUp:[0,-24],ArrowDown:[0,24]}[e.key];const next=e.key==="Home"?initial:{left:rect.left+delta[0],top:rect.top+delta[1]};const clamped=getClamped(next.left,next.top,rect.width,rect.height);const value={left:clamped.x,top:clamped.y};setPos(value);savePos(value);
          }}><Grip/></button>
          <button className="fp-minimize-btn" onClick={() => onModeChange?.("minimized")} title="Minimizar">
            <Minus />
          </button>
        </div>
      </div>
      <div ref={bodyRef} className="fp-body">
        {children}
      </div>
    </div>
  );
}
