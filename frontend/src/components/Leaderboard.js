import React, { useEffect, useState } from "react";
import {
    LuTrophy as Trophy, LuChevronLeft as ChevronLeft, LuChevronRight as ChevronRight,
    LuUserRound as UserRound, LuMedal as Medal, LuFlame as Flame,
    LuGamepad2 as Gamepad2, LuZap as Zap,
} from "react-icons/lu";
import { getLeaderboard } from "../services/api";
import UserMiniProfile from "./UserMiniProfile";
import "./Leaderboard.css";

const SORT_OPTIONS = [
    { value: "xp", label: "XP", icon: Zap },
    { value: "sessions_played", label: "Partidas", icon: Gamepad2 },
    { value: "streak", label: "Racha", icon: Flame },
];

const RANK_COLORS = ["#ffd700", "#c0c0c0", "#cd7f32"];

export default function Leaderboard() {
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(true);
    const [retry, setRetry] = useState(0);
    const [data, setData] = useState(null);
    const [sort, setSort] = useState("xp");
    const [page, setPage] = useState(1);
    const [miniProfileUserId, setMiniProfileUserId] = useState(null);

    useEffect(() => {
        let live = true;
        setLoading(true); setError("");
        getLeaderboard(sort, page).then((result) => live && setData(result)).catch((err) => live && setError(err.message)).finally(() => live && setLoading(false));
        return () => { live = false; };
    }, [sort, page, retry]);

    return (
        <div className="leaderboard-page">
            <header className="leaderboard-header">
                <div><Trophy /><span><small>Actividad de la comunidad</small><h1>Ranking de jugadores</h1></span></div>
            </header>
            <div className="leaderboard-sort">
                {SORT_OPTIONS.map((opt) => (
                    <button key={opt.value} aria-pressed={sort === opt.value} className={sort === opt.value ? "active" : ""} onClick={() => { setSort(opt.value); setPage(1); }}>
                        <opt.icon /> {opt.label}
                    </button>
                ))}
            </div>
            <p className="ui-status">XP: actividad acumulada. Partidas: participaciones registradas. Racha: días consecutivos de actividad. Este ranking no mide habilidad competitiva. Criterio actual: {SORT_OPTIONS.find((o) => o.value === sort).label}.</p>
            {loading && <p role="status">Cargando ranking…</p>}
            {error && <p role="alert" className="ui-status error">{error}<button onClick={() => setRetry(retry + 1)}>Reintentar</button></p>}
            <div className="leaderboard-list">
                {data?.items?.map((entry) => (
                    <button key={entry.id} className="leaderboard-row" onClick={() => setMiniProfileUserId(entry.id)}>
                        <span className={`leaderboard-rank ${entry.rank <= 3 ? "top" : ""}`} style={entry.rank <= 3 ? { color: RANK_COLORS[entry.rank - 1] } : {}}>
                            {entry.rank <= 3 ? <><Medal aria-hidden="true"/><span>#{entry.rank}</span></> : `#${entry.rank}`}
                        </span>
                        <div className="leaderboard-avatar">
                            {entry.avatar_url ? <img src={entry.avatar_url} alt="" /> : <UserRound />}
                        </div>
                        <div className="leaderboard-info">
                            <strong>{entry.display_name}</strong>
                            <small>Nivel {entry.level} · {entry.xp} XP</small>
                        </div>
                        <div className="leaderboard-stats">
                            <span><Gamepad2 /> {entry.sessions_played}</span>
                            <span><Flame /> {entry.streak}</span>
                            <span className="leaderboard-xp">{entry.xp} XP</span>
                        </div>
                    </button>
                ))}
                {data?.items?.length === 0 && <p className="leaderboard-empty">Aún no hay jugadores en el ranking.</p>}
            </div>
            {data?.pages > 1 && (
                <div className="leaderboard-pagination">
                    <button disabled={page <= 1} onClick={() => setPage(page - 1)}><ChevronLeft /></button>
                    <span>{data.page} de {data.pages}</span>
                    <button disabled={page >= data.pages} onClick={() => setPage(page + 1)}><ChevronRight /></button>
                </div>
            )}
            {miniProfileUserId && <UserMiniProfile userId={miniProfileUserId} onClose={() => setMiniProfileUserId(null)} />}
        </div>
    );
}
