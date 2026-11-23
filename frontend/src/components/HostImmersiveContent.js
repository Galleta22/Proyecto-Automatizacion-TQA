import React from "react";
import {
  LuMinus as Minus, LuPlus as Plus, LuPause as Pause, LuPlay as Play,
  LuRotateCcw as RotateCcw, LuUndo2 as Undo2, LuTimer as Timer,
  LuUsers as Users, LuTrophy as Trophy,
} from "react-icons/lu";
import "./HostImmersiveContent.css";

export default function HostImmersiveContent({
  editor, games, formatDuration,
}) {
  const { form, setForm, scoreStep, setScoreStep,
    timerRunning, setTimerRunning,
    adjustScore, adjustTeamScore, undoScore,
  } = editor;

  const currentGame = games.find((g) => g.id === form.game_id);

  return (
    <div className="hi-content">
      {/* Game info bar */}
      <div className="hi-game-bar">
        <div className="hi-game-bar-left">
          <Trophy />
          <span className="hi-game-name">{currentGame?.name || "Juego"}</span>
          <div className="hi-scoring-toggle">
            <button className={form.scoring_mode === "individual" ? "active" : ""} onClick={() => editor.setScoringMode("individual")}>Individual</button>
            <button className={form.scoring_mode === "teams" ? "active" : ""} onClick={() => editor.setScoringMode("teams")}>Equipos</button>
          </div>
        </div>
        <div className="hi-game-bar-right">
          <div className="hi-round-display">
            <small>Ronda</small>
            <div className="hi-round-ctrl">
              <button onClick={() => setForm({ ...form, round_number: Math.max(1, form.round_number - 1) })}><Minus /></button>
              <strong>{form.round_number}</strong>
              <button onClick={() => setForm({ ...form, round_number: form.round_number + 1 })}><Plus /></button>
            </div>
          </div>
          <div className="hi-timer-display">
            <Timer />
            <strong>{formatDuration(form.elapsed_seconds)}</strong>
            <button onClick={() => setTimerRunning((v) => !v)}>{timerRunning ? <Pause /> : <Play />}</button>
            <button onClick={() => { setTimerRunning(false); setForm({ ...form, elapsed_seconds: 0 }); }} title="Reiniciar cronómetro" aria-label="Reiniciar cronómetro"><RotateCcw aria-hidden="true" /></button>
          </div>
          <div className="hi-step-display">
            <small>Salto</small>
            {[1, 5, 10].map((s) => (
              <button key={s} className={scoreStep === s ? "active" : ""} onClick={() => setScoreStep(s)}>{s}</button>
            ))}
          </div>
          <button className="hi-undo-btn" disabled={!form.score_history.length} onClick={undoScore}><Undo2 /></button>
        </div>
      </div>

      {/* Scoreboard — Teams */}
      {form.scoring_mode === "teams" && (
        <div className="hi-scoreboard-grid">
          {form.teams.map((team) => (
            <div key={team.id} className="hi-score-card" style={{ "--card-color": team.color }}>
              <div className="hi-score-card-header">{team.name}</div>
              <div className="hi-score-card-value">{team.score}</div>
              <div className="hi-score-card-actions">
                <button onClick={() => adjustTeamScore(team.id, -scoreStep)}>−{scoreStep}</button>
                <button onClick={() => adjustTeamScore(team.id, scoreStep)}>+{scoreStep}</button>
              </div>
              <div className="hi-score-card-meta">{form.players.filter((p) => p.team_id === team.id).length} integrantes</div>
            </div>
          ))}
        </div>
      )}

      {/* Scoreboard — Individual */}
      {form.scoring_mode === "individual" && (
        <div className="hi-scoreboard-grid">
          {form.players.map((player, index) => (
            <div key={player.id} className={`hi-score-card ${form.active_player_id === player.id ? "active-turn" : ""}`} style={{ "--card-color": player.color }}>
              <div className="hi-score-card-header">
                {player.name || `Jugador ${index + 1}`}
                {form.active_player_id === player.id && <span className="hi-turn-badge">TURNO</span>}
              </div>
              <div className="hi-score-card-value">{player.score}</div>
              <div className="hi-score-card-actions">
                <button onClick={() => adjustScore(index, -scoreStep)}>−{scoreStep}</button>
                <button onClick={() => adjustScore(index, scoreStep)}>+{scoreStep}</button>
              </div>
              <div className="hi-score-card-meta">
                <Timer /> {formatDuration(form.turn_times[player.id] || 0)}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Active turn indicator (when in teams mode) */}
      {form.scoring_mode === "teams" && form.turn_order_enabled && (
        <div className="hi-turn-bar">
          Turno: <strong>{form.players.find((p) => p.id === form.active_player_id)?.name || "Sin iniciar"}</strong>
          <time>{formatDuration(form.turn_times[form.active_player_id] || 0)}</time>
        </div>
      )}

      {/* Score history */}
      {form.score_history.length > 0 && (
        <div className="hi-history-bar">
          <span className="hi-history-label">Historial</span>
          <div className="hi-history-scroll">
            {form.score_history.slice(-8).reverse().map((entry) => (
              <span key={entry.id} className="hi-history-entry">
                <i className={entry.delta >= 0 ? "positive" : "negative"}>{entry.delta >= 0 ? `+${entry.delta}` : entry.delta}</i>
                <span>{entry.team_name || entry.player_name}</span>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
