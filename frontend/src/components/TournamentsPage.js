import React, { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import QRCode from "qrcode";
import { uxRequest } from "../services/uxApi";
import { getToken, parseJwt } from "../services/auth";
import { confirmAction } from "../ui/confirmAction";

const statusLabel={draft:"Inscripciones abiertas",active:"En curso",completed:"Finalizado",cancelled:"Cancelado"};
export function ShareTournament({ tournament }) {
  const [base,setBase]=useState(process.env.REACT_APP_PUBLIC_URL || window.location.origin); const [image,setImage]=useState(""); const [error,setError]=useState("");
  let link="";try {const url=new URL(base);if(!["http:","https:"].includes(url.protocol)||url.username||url.password)throw new Error();link=`${url.origin}/torneos/${tournament.id}`;}catch{}
  useEffect(()=>{let live=true;setImage("");if(!link)return undefined;QRCode.toDataURL(link,{width:220,margin:2,errorCorrectionLevel:"M"}).then((data)=>live&&setImage(data)).catch(()=>setError("No se pudo generar el código"));return()=>{live=false;};},[link]);
  return <details className="tournament-share"><summary>Compartir inscripción por QR o enlace</summary><p>El QR abre los detalles. Cada persona inicia sesión y confirma su inscripción.</p><label>Dirección pública de la web<input type="url" value={base} onChange={(e)=>setBase(e.target.value)}/></label>{!link&&<p role="alert">Escribe una dirección HTTP o HTTPS válida.</p>}{/localhost|127\.0\.0\.1/.test(base)&&<p className="ui-status">Para escanear desde otro teléfono, usa el dominio publicado o la IP de este equipo accesible en la misma red. localhost apunta al propio teléfono.</p>}{image&&<img className="tournament-qr" src={image} alt={`QR de inscripción a ${tournament.name}`}/>}<p><a href={link}>{link}</a></p><p>También puedes grabar este mismo enlace en una etiqueta NFC. El código no confirma presencia física.</p>{error&&<p role="alert">{error}</p>}</details>;
}
export default function TournamentsPage() {
  const { id } = useParams();
  const endpoint = id ? `/tournaments/public/${id}` : "/tournaments/public";
  return <TournamentView key={endpoint} id={id} endpoint={endpoint} />;
}

function TournamentView({ id, endpoint }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [skill, setSkill] = useState("principiante");
  const currentUser=parseJwt(getToken());
  const load = useCallback(async () => {
    setError("");
    try {
      setData(await uxRequest(endpoint));
    } catch (err) {
      setError(err.message);
    }
  }, [endpoint]);

  useEffect(() => {
    load();
  }, [load]);
  const enrolled=data?.participants?.some((p)=>p.user_id===currentUser?.user_id&&p.is_active);
  const enroll=async()=>{if(busy)return;setBusy(true);setError("");try{if(enrolled&&!(await confirmAction("¿Retirar tu inscripción antes del inicio?")))return;await uxRequest(`/tournaments/public/${id}/enroll`,{method:enrolled?"DELETE":"POST",...(!enrolled?{body:JSON.stringify({skill_level:skill})}:{})});await load();}catch(err){setError(err.message);}finally{setBusy(false);}};
  return <section className="tournaments-public"><header className="module-heading"><div><h1>{id?(data?.name||"Detalle del torneo"):"Torneos públicos"}</h1><p>Conoce el formato y reserva tu lugar antes de empezar.</p></div>{id&&<Link to="/torneos">Todos los torneos</Link>}</header>
    {error&&<div role="alert" className="ui-status error">{error}<button onClick={load}>Reintentar</button></div>}
    {!data&&!error&&<p role="status">Cargando torneos…</p>}
    {!id&&data&&<div className="public-tournament-grid">{data.items.map((t)=><article key={t.id}><h2><Link to={`/torneos/${t.id}`}>{t.name}</Link></h2><p>{t.game_name} · {statusLabel[t.status]}</p><p>{t.participant_count}/{t.max_participants} participantes</p><p>{t.location||"Lugar por confirmar"}</p>{t.scheduled_at&&<time>{new Date(t.scheduled_at).toLocaleString("es-BO")}</time>}<Link className="btn btn-primary" to={`/torneos/${t.id}`}>Ver detalles e inscripción</Link></article>)}{!data.items.length&&<p className="ui-status">Aún no hay torneos publicados. Los borradores solo los ve la organización.</p>}</div>}
    {id&&data&&<><p className="tournament-state">{statusLabel[data.status]}</p><dl className="tournament-facts"><div><dt>Juego</dt><dd>{data.game_name}</dd></div><div><dt>Formato</dt><dd>{data.format}</dd></div><div><dt>Cupos</dt><dd>{data.participant_count}/{data.max_participants}</dd></div><div><dt>Lugar</dt><dd>{data.location||"Por confirmar"}</dd></div><div><dt>Fecha</dt><dd>{data.scheduled_at?new Date(data.scheduled_at).toLocaleString("es-BO"):"Por confirmar"}</dd></div></dl><p>{data.description||"Consulta a la organización para más detalles."}</p><p>{data.scoring}</p>
      {data.status==="draft"&&data.competition_format==="teams"?<p className="ui-status">La organización registra los equipos y sus plantillas.</p>:data.status==="draft"?<section className="enrollment"><h2>{enrolled?"Ya estás inscrito":"Inscribirme al torneo"}</h2>{!getToken()?<Link className="btn btn-primary" to={`/login?next=${encodeURIComponent(`/torneos/${id}`)}`}>Iniciar sesión para inscribirme</Link>:<>{data.competition_format!=="multiplayer"&&<><label>Tu experiencia en este juego<select value={skill} onChange={(e)=>setSkill(e.target.value)} disabled={enrolled}><option value="principiante">Estoy aprendiendo</option><option value="intermedio">Conozco las reglas y he jugado</option><option value="avanzado">Juego con frecuencia</option><option value="experto">Tengo experiencia competitiva</option></select></label><p>Se utiliza para formar los cruces junto con los puntos y el historial del torneo.</p></>}<button className="btn-primary" onClick={enroll} disabled={busy||(!enrolled&&data.participant_count>=data.max_participants)}>{busy?"Procesando…":enrolled?"Retirar inscripción":data.participant_count>=data.max_participants?"Sin cupos":"Confirmar inscripción"}</button></>}</section>:<p className="ui-status">Las inscripciones están cerradas.</p>}
      <h2>Participantes</h2><ul>{data.participants.filter((p)=>p.is_active).map((p)=><li key={p.id}>{p.display_name}{p.team_members?.length>0&&<span> · {p.team_members.join(", ")}</span>}</li>)}</ul>
      {data.champion && <p><strong>Campeón: {data.champion}</strong></p>}
      {data.rounds?.length > 0 && <section>
        <h2>Rondas</h2>
        {[...data.rounds].reverse().map((round) => (
          <details key={round.id}>
            <summary>{round.decision?.final ? "Final" : `Ronda ${round.round_number}`}</summary>
            {round.decision?.summary && <p>{round.decision.summary}</p>}
            <ul>{round.matches.map((match) => (
              <li key={match.id}>
                {match.table_entries?.length ? <>
                  Mesa {match.table_number}
                  {round.decision?.advance && !round.decision.final && ` · Clasifican ${round.decision.advance[match.table_number]}`}
                  {match.placements?.length ? <ol>{match.placements.map((entrant, index) => (
                    <li key={entrant}>
                      {match.table_entries.find((entry) => entry.id === entrant)?.name}
                      {index < round.decision?.advance?.[match.table_number] && (round.decision.final ? " · Campeón" : " · Clasifica")}
                    </li>
                  ))}</ol> : <ul>{match.table_entries.map((entry) => <li key={entry.id}>{entry.name}</li>)}</ul>}
                </> : <>
                  {match.participant1_name} {match.participant2_id ? `contra ${match.participant2_name}` : "· Pase automático"}
                  {match.status === "completed" && match.participant2_id && (match.winner_id
                    ? ` · Gana ${match.winner_id === match.participant1_id ? match.participant1_name : match.participant2_name}`
                    : " · Empate")}
                </>}
                {round.decision?.matches?.[match.table_number] && <p>{round.decision.matches[match.table_number]}</p>}
              </li>
            ))}</ul>
          </details>
        ))}
      </section>}
      {data.standings?.length>0&&<><h2>Clasificación</h2><ol>{data.standings.map((p)=><li key={p.id} value={p.rank}>{p.name}: {p.points} puntos · {p.wins} {data.competition_format==="multiplayer"?"primeros puestos":"victorias"}</li>)}</ol></>}
    </>}
  </section>;
}
