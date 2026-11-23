import { ReportManual } from "./ContentReview";
import React, { useEffect, useState } from "react";
import { LuBookOpen as BookOpen, LuDownload as Download, LuFileText as FileText, LuX as X } from "react-icons/lu";
import { Link } from "react-router-dom";
import { getGameManuals, downloadGameManual, viewGameManual } from "../services/api";
import "./GameManualsModal.css";

export default function GameManualsModal({ game, onClose }) {
    const [manuals, setManuals] = useState([]);
    const [loading, setLoading] = useState(true);
    const [viewingManual, setViewingManual] = useState(null);
    const [pdfUrl, setPdfUrl] = useState(null);
    const [pdfError, setPdfError] = useState(false);

    useEffect(() => {
        if (!game) return;
        let active = true;
        setLoading(true);
        getGameManuals(game.id)
            .then((data) => { if (active) setManuals(data); })
            .catch(() => { if (active) setManuals([]); })
            .finally(() => { if (active) setLoading(false); });
        return () => { active = false; };
    }, [game]);

    useEffect(() => {
        if (!viewingManual) {
            if (pdfUrl) URL.revokeObjectURL(pdfUrl);
            setPdfUrl(null);
            setPdfError(false);
            return;
        }
        let active = true;
        setPdfError(false);
        viewGameManual(viewingManual)
            .then((url) => { if (active) setPdfUrl(url); })
            .catch(() => { if (active) setPdfError(true); });
        return () => { active = false; if (pdfUrl) URL.revokeObjectURL(pdfUrl); };
    }, [viewingManual]); // eslint-disable-line react-hooks/exhaustive-deps

    if (!game) return null;

    return (
        <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
            <div className="modal-content game-manuals-modal">
                <button className="modal-close" onClick={onClose}><X /></button>

                {viewingManual ? (
                    <div className="manuals-pdf-viewer">
                        <div className="manuals-pdf-header">
                            <button className="btn btn-secondary btn-sm" onClick={() => { setViewingManual(null); setPdfUrl(null); setPdfError(false); }}>
                                ← Volver
                            </button>
                            <h3>{viewingManual.title}</h3>
                            <button className="btn btn-primary btn-sm" onClick={() => downloadGameManual(viewingManual)}>
                                <Download /> Descargar
                            </button>
                        </div>
                        {pdfError ? (
                            <div className="manuals-pdf-error">
                                <FileText />
                                <p>No se pudo cargar el reglamento.</p>
                                <button className="btn btn-primary btn-sm" onClick={() => downloadGameManual(viewingManual)}>
                                    <Download /> Descargar archivo
                                </button>
                            </div>
                        ) : pdfUrl ? (
                            <iframe src={pdfUrl} className="manuals-pdf-frame" title={viewingManual.title} />
                        ) : (
                            <div className="manuals-pdf-loading">Cargando…</div>
                        )}
                    </div>
                ) : (
                    <>
                        <div className="manuals-header">
                            <BookOpen />
                            <h2>Reglamentos digitales</h2>
                            <p className="manuals-subtitle">Manuales y documentos de {game.name}</p>
                        </div>

                        {loading ? (
                            <p className="manuals-loading">Cargando reglamentos…</p>
                        ) : manuals.length === 0 ? (
                            <div className="manuals-empty">
                                <FileText />
                                <h3>No hay reglamentos disponibles</h3>
                                <p>Este juego aún no tiene reglamentos digitales cargados.</p>
                                <Link to="/reglas?section=manuals" className="btn btn-primary" onClick={onClose}>
                                    Ver todos los reglamentos
                                </Link>
                            </div>
                        ) : (
                            <div className="manuals-list">
                                {manuals.map((manual) => (
                                    <div key={manual.id} className="manual-entry" onClick={() => setViewingManual(manual)}>
                                        <FileText />
                                        <div className="manual-entry-info">
                                            <strong>{manual.title}</strong><ReportManual manual={manual}/>
                                            <span>{manual.original_filename}{manual.version ? ` · v${manual.version}` : ""} · {Math.round(manual.file_size / 1024)} KB</span>
                                        </div>
                                        <button className="btn btn-secondary btn-sm" title="Descargar" onClick={(e) => { e.stopPropagation(); downloadGameManual(manual); }}>
                                            <Download />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}
