"""
Router de Torneos — CRUD completo + sistema experto de matchmaking suizo
"""

from uuid import UUID
from fractions import Fraction
from math import ceil
from datetime import timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from app.api import deps
from app.core.time import utc_now
from app.models import (
    Game,
    Tournament,
    TournamentJudge,
    TournamentMatch,
    TournamentParticipant,
    TournamentRound,
    User,
)
from app.schemas.tournament import (
    JudgeAdd,
    MatchResult,
    ParticipantAdd,
    TournamentCreate,
    TournamentUpdate,
    TournamentEnrollment,
)
from app.services.swiss_matchmaking import (
    MatchmakingError,
    MatchmakingLimitError,
    SwissPlayer,
    calculate_standings,
    generate_swiss_round,
)

router = APIRouter()


# ── helpers ──────────────────────────────────────────────────────────────────

def _get_tournament(db: Session, tournament_id: UUID, *, lock: bool = False) -> Tournament:
    if lock:
        db.query(Tournament.id).filter(Tournament.id == tournament_id).with_for_update().first()
    tournament = (
        db.query(Tournament)
        .options(
            joinedload(Tournament.game),
            joinedload(Tournament.created_by),
            joinedload(Tournament.participants).joinedload(TournamentParticipant.user),
            joinedload(Tournament.judges).joinedload(TournamentJudge.user),
            joinedload(Tournament.rounds).joinedload(TournamentRound.matches),
        )
        .filter(Tournament.id == tournament_id)
        .first()
    )
    if not tournament:
        raise HTTPException(status_code=404, detail="Torneo no encontrado")
    return tournament


def _serialize_participant(p: TournamentParticipant) -> dict:
    return {
        "id": str(p.id),
        "tournament_id": str(p.tournament_id),
        "user_id": str(p.user_id) if p.user_id else None,
        "display_name": p.display_name,
        "external_name": p.external_name,
        "team_members": p.team_members or [],
        "skill_level": p.skill_level,
        "wins": p.wins,
        "losses": p.losses,
        "draws": p.draws,
        "points": p.points,
        "has_bye": p.has_bye,
        "seed": p.seed,
        "is_active": p.is_active,
    }


def _serialize_match(m: TournamentMatch) -> dict:
    return {
        "id": str(m.id),
        "round_id": str(m.round_id),
        "table_number": m.table_number,
        "table_entries": m.table_entries or [],
        "placements": m.placements or [],
        "participant1_id": str(m.participant1_id) if m.participant1_id else None,
        "participant2_id": str(m.participant2_id) if m.participant2_id else None,
        "participant1_name": m.participant1.display_name if m.participant1 else None,
        "participant2_name": m.participant2.display_name if m.participant2 else "BYE",
        "participant1_skill": m.participant1.skill_level if m.participant1 else None,
        "participant2_skill": m.participant2.skill_level if m.participant2 else None,
        "winner_id": str(m.winner_id) if m.winner_id else None,
        "score_p1": m.score_p1,
        "score_p2": m.score_p2,
        "status": m.status,
        "judge_id": str(m.judge_id) if m.judge_id else None,
        "notes": m.notes or "",
    }


def _serialize_round(r: TournamentRound) -> dict:
    return {
        "id": str(r.id),
        "round_number": r.round_number,
        "status": r.status,
        "started_at": r.started_at.isoformat() if r.started_at else None,
        "completed_at": r.completed_at.isoformat() if r.completed_at else None,
        "decision": r.decision or {},
        "matches": [_serialize_match(m) for m in (r.matches or [])],
    }


def _serialize_tournament(t: Tournament, include_rounds: bool = False) -> dict:
    result = {
        "id": str(t.id),
        "name": t.name,
        "description": t.description or "",
        "game_id": str(t.game_id),
        "game_name": t.game.name if t.game else "",
        "game_image_url": t.game.image_url if t.game else None,
        "created_by_id": str(t.created_by_id) if t.created_by_id else None,
        "created_by_name": t.created_by.username if t.created_by else None,
        "status": t.status,
        "is_public": t.is_public,
        "location": t.location,
        "scheduled_at": t.scheduled_at.replace(tzinfo=timezone.utc).isoformat() if t.scheduled_at else None,
        "competition_format": t.competition_format,
        "elimination": t.elimination,
        "advance_per_table": t.advance_per_table,
        "minimum_entrants": _minimum_entrants(t),
        "table_size": t.table_size,
        "team_size": t.team_size,
        "format": {"multiplayer": "Mesas por puestos", "teams": "Suizo de equipos"}.get(t.competition_format, "Suizo 1 contra 1"),
        "scoring": "Victoria: 1 punto; empate: 0,5; derrota: 0. Desempates: Buchholz, mediano y victorias. Si persiste la igualdad, se comparte posición; el nombre solo ordena la presentación.",
        "max_participants": t.max_participants,
        "current_round": t.current_round,
        "participant_count": len([p for p in (t.participants or []) if p.is_active]),
        "total_participants": len(t.participants or []),
        "judge_count": len(t.judges or []),
        "round_count": len(t.rounds or []),
        "started_at": t.started_at.isoformat() if t.started_at else None,
        "completed_at": t.completed_at.isoformat() if t.completed_at else None,
        "created_at": t.created_at.isoformat() if t.created_at else None,
        "participants": [_serialize_participant(p) for p in (t.participants or [])],
        "judges": [
            {
                "id": str(j.id),
                "user_id": str(j.user_id),
                "display_name": (j.user.preferences or {}).get("nickname") or j.user.username if j.user else "Juez",
                "is_head_judge": j.is_head_judge,
            }
            for j in (t.judges or [])
        ],
    }
    if t.competition_format == "multiplayer":
        result["scoring"] = "Cada mesa registra un orden completo. El primero recibe 1 punto y el último 0; los demás reciben una fracción según su puesto. La clasificación desempata por primeros puestos y comparte posición si persiste la igualdad."
    if t.elimination:
        mode = {"multiplayer": "multijugador", "teams": "por equipos"}.get(t.competition_format, "1 contra 1")
        result["format"] = f"Eliminación {mode}"
        result["scoring"] = (
            f"Avanzan hasta {t.advance_per_table} por mesa preliminar. La última mesa decide el campeonato."
            if t.competition_format == "multiplayer"
            else "El ganador de cada cruce avanza. Si el juego termina empatado, se debe resolver el desempate antes de registrar el ganador."
        )
    if include_rounds:
        if t.elimination and t.rounds:
            final = t.rounds[-1]
            if (final.decision or {}).get("final") and all(m.status == "completed" for m in final.matches):
                champion = next(iter(_advancing_ids(final)), None)
                result["champion"] = next((p.display_name for p in t.participants if str(p.id) == champion), None)
        result["rounds"] = [_serialize_round(r) for r in (t.rounds or [])]
    return result


def _advancing_ids(round_: TournamentRound) -> set[str]:
    quotas = round_.decision["advance"]
    return {
        entrant
        for match in round_.matches
        for entrant in (
            match.placements[:quotas[str(match.table_number)]]
            if match.placements else ([str(match.winner_id)] if match.winner_id else [])
        )
    }


def _eligible_ids(tournament: Tournament) -> set[str] | None:
    if tournament.elimination and tournament.rounds:
        return _advancing_ids(tournament.rounds[-1])
    return None


def _minimum_entrants(tournament: Tournament) -> int:
    if tournament.elimination and tournament.competition_format == "multiplayer":
        return max(2, tournament.game.min_players or 2)
    if tournament.elimination or tournament.competition_format == "teams":
        return 2
    return 4


def _table_sizes(tournament: Tournament, entrants: int) -> list[int]:
    minimum = max(2, tournament.game.min_players or 2)
    count = ceil(entrants / tournament.table_size)
    if not count or entrants < count * minimum:
        raise HTTPException(
            status_code=400,
            detail=f"Con {entrants} participantes no se pueden formar mesas de {minimum} a {tournament.table_size}.",
        )
    base, extra = divmod(entrants, count)
    return [base + int(index < extra) for index in range(count)]


def _validate_elimination_path(tournament: Tournament, entrants: int) -> None:
    while True:
        sizes = _table_sizes(tournament, entrants)
        if len(sizes) == 1:
            return
        entrants = sum(min(tournament.advance_per_table, size - 1) for size in sizes)


def _elimination_standings(tournament: Tournament, rows: list[dict]) -> list[dict]:
    if not tournament.elimination or not tournament.rounds:
        return rows
    progress = {row["id"]: (0, 0) for row in rows}
    for round_ in tournament.rounds:
        for entrant in _advancing_ids(round_):
            progress[entrant] = (round_.round_number, 0)
        if round_.decision.get("final"):
            for match in round_.matches:
                for index, entrant in enumerate(match.placements or [], 1):
                    progress[entrant] = (round_.round_number, -index)
    rows.sort(key=lambda row: progress[row["id"]], reverse=True)
    previous = None
    for index, row in enumerate(rows, 1):
        score = progress[row["id"]]
        if score != previous:
            rank = index
        row.update(rank=rank, tie_break="")
        previous = score
    return rows


def _build_swiss_players(tournament: Tournament) -> list[SwissPlayer]:
    """Construye la lista de SwissPlayer a partir del estado actual del torneo."""
    participant_map: dict[UUID, TournamentParticipant] = {
        p.id: p for p in tournament.participants if p.is_active
    }

    # Construir historial de oponentes pasados
    past_opponents: dict[UUID, set[UUID]] = {pid: set() for pid in participant_map}
    for rnd in tournament.rounds:
        for match in rnd.matches:
            if match.participant1_id and match.participant2_id:
                if match.participant1_id in past_opponents:
                    past_opponents[match.participant1_id].add(match.participant2_id)
                if match.participant2_id in past_opponents:
                    past_opponents[match.participant2_id].add(match.participant1_id)

    players = []
    for pid, participant in participant_map.items():
        players.append(SwissPlayer(
            id=pid,
            name=participant.display_name,
            skill_level=participant.skill_level,
            points=participant.points,
            wins=participant.wins,
            losses=participant.losses,
            draws=participant.draws,
            has_bye=participant.has_bye,
            past_opponents=past_opponents.get(pid, set()),
        ))

    return players


def _placement_points(size: int, position: int) -> Fraction:
    return Fraction(size - 1 - position, size - 1)


def _standings(tournament: Tournament) -> list[dict]:
    if tournament.competition_format != "multiplayer":
        return _elimination_standings(tournament, calculate_standings(_build_swiss_players(tournament)))
    active = {str(p.id): p for p in tournament.participants if p.is_active}
    points = dict.fromkeys(active, Fraction(0))
    firsts = dict.fromkeys(active, 0)
    for round_ in tournament.rounds:
        for match in round_.matches:
            for position, entrant in enumerate(match.placements or []):
                if entrant in active:
                    points[entrant] += _placement_points(len(match.placements), position)
                    firsts[entrant] += int(position == 0)

    ordered = sorted(active, key=lambda key: (-points[key], -firsts[key], active[key].display_name.casefold(), key))
    rows = []
    previous = None
    for index, key in enumerate(ordered, 1):
        score = (points[key], firsts[key])
        rank = rows[-1]["rank"] if score == previous else index
        rows.append({
            "id": key, "name": active[key].display_name, "rank": rank,
            "points": round(float(points[key]), 4), "wins": firsts[key],
        })
        previous = score
    return _elimination_standings(tournament, rows)


def _multiplayer_tables(tournament: Tournament, eligible: set[str] | None, decision: dict) -> list[list[dict]]:
    standings = _standings(tournament)
    roster = {str(p.id): p for p in tournament.participants if p.is_active}
    remaining = [roster[row["id"]] for row in standings if eligible is None or row["id"] in eligible]
    sizes = _table_sizes(tournament, len(remaining))
    meetings = {}
    for round_ in tournament.rounds:
        for match in round_.matches:
            ids = [entry["id"] for entry in (match.table_entries or [])]
            for entrant in ids:
                for opponent in ids:
                    if entrant != opponent:
                        pair = (entrant, opponent)
                        meetings[pair] = meetings.get(pair, 0) + 1

    tables = []
    decision["matches"] = {}
    decision["summary"] = "Mesas equilibradas por cupo, con prioridad a reducir coincidencias anteriores."
    for size in sizes:
        table = [remaining.pop(0)]
        repeats = 0
        for _ in range(size - 1):
            candidate = min(range(len(remaining)), key=lambda i: (
                sum(meetings.get((str(remaining[i].id), str(entrant.id)), 0) for entrant in table), i,
            ))
            selected = remaining.pop(candidate)
            repeats += sum(meetings.get((str(selected.id), str(entrant.id)), 0) for entrant in table)
            table.append(selected)
        decision["matches"][str(len(tables) + 1)] = (
            f"{size} participantes. Coincidencias previas acumuladas entre sus integrantes: {repeats}."
        )
        tables.append([{"id": str(entrant.id), "name": entrant.display_name} for entrant in table])
    return tables


# ── CRUD Torneos ─────────────────────────────────────────────────────────────

# Public discovery never exposes drafts or requires a session to read.
@router.get("/public")
def public_tournaments(db: Session = Depends(deps.get_db)):
    items = db.query(Tournament).filter(Tournament.is_public.is_(True)).order_by(Tournament.created_at.desc()).all()
    return {"items": [_serialize_tournament(t) for t in items]}


@router.get("/public/{tournament_id}")
def public_tournament(tournament_id: UUID, db: Session = Depends(deps.get_db)):
    tournament = _get_tournament(db, tournament_id)
    if not tournament.is_public:
        raise HTTPException(status_code=404, detail="Torneo no publicado")
    result = _serialize_tournament(tournament, include_rounds=True)
    result["standings"] = _standings(tournament)
    return result


@router.post("/public/{tournament_id}/enroll")
def enroll_tournament(tournament_id: UUID, payload: TournamentEnrollment, db: Session = Depends(deps.get_db), user: User = Depends(deps.get_current_user)):
    # The tournament row serializes concurrent enrollments and capacity checks in PostgreSQL.
    tournament = db.query(Tournament).filter(Tournament.id == tournament_id).with_for_update().first()
    if not tournament or not tournament.is_public:
        raise HTTPException(status_code=404, detail="Torneo no publicado")
    if tournament.status != "draft":
        raise HTTPException(status_code=409, detail="Las inscripciones están cerradas")
    if tournament.competition_format == "teams":
        raise HTTPException(status_code=409, detail="La organización registra las plantillas de los equipos")
    existing = db.query(TournamentParticipant).filter_by(tournament_id=tournament.id, user_id=user.id).first()
    if existing and existing.is_active:
        raise HTTPException(status_code=409, detail="Ya estás inscrito en este torneo")
    count = db.query(TournamentParticipant).filter_by(tournament_id=tournament.id, is_active=True).count()
    if count >= tournament.max_participants:
        raise HTTPException(status_code=409, detail="No quedan cupos disponibles")
    if existing:
        existing.is_active = True; existing.skill_level = payload.skill_level
    else:
        db.add(TournamentParticipant(tournament_id=tournament.id, user_id=user.id, skill_level=payload.skill_level, seed=count + 1))
    db.commit()
    return {"detail": "Inscripción confirmada"}


@router.delete("/public/{tournament_id}/enroll")
def withdraw_tournament(tournament_id: UUID, db: Session = Depends(deps.get_db), user: User = Depends(deps.get_current_user)):
    tournament = db.query(Tournament).filter(Tournament.id == tournament_id).with_for_update().first()
    if not tournament or not tournament.is_public:
        raise HTTPException(status_code=404, detail="Torneo no publicado")
    if tournament.status != "draft":
        raise HTTPException(status_code=409, detail="Contacta al organizador para retirarte de un torneo iniciado")
    participant = db.query(TournamentParticipant).filter_by(tournament_id=tournament.id, user_id=user.id).first()
    if participant:
        participant.is_active = False
    db.commit()
    return {"detail": "Inscripción retirada"}


@router.get("/")
def list_tournaments(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=5, le=100),
    all_items: bool = Query(False),
    status: str = Query("", pattern="^(draft|active|completed|cancelled|all)?$"),
    db: Session = Depends(deps.get_db),
    user: User = Depends(deps.require_role("admin", "facilitador")),
):
    query = db.query(Tournament).options(
        joinedload(Tournament.game),
        joinedload(Tournament.created_by),
        joinedload(Tournament.participants),
        joinedload(Tournament.judges),
        joinedload(Tournament.rounds),
    )
    if status and status != "all":
        query = query.filter(Tournament.status == status)
    total = query.count()
    query = query.order_by(Tournament.created_at.desc())
    if not all_items:
        query = query.offset((page - 1) * page_size).limit(page_size)
    tournaments = query.all()

    # Stats
    draft_count = db.query(func.count(Tournament.id)).filter(Tournament.status == "draft").scalar() or 0
    active_count = db.query(func.count(Tournament.id)).filter(Tournament.status == "active").scalar() or 0
    completed_count = db.query(func.count(Tournament.id)).filter(Tournament.status == "completed").scalar() or 0
    cancelled_count = db.query(func.count(Tournament.id)).filter(Tournament.status == "cancelled").scalar() or 0

    pages = max((total + page_size - 1) // page_size, 1) if not all_items else 1
    return {
        "items": [_serialize_tournament(t) for t in tournaments],
        "page": 1 if all_items else page,
        "page_size": total if all_items else page_size,
        "total": total,
        "pages": pages,
        "stats": {
            "draft": draft_count,
            "active": active_count,
            "completed": completed_count,
            "cancelled": cancelled_count,
        },
    }


def _validate_competition(game, format_, table_size, elimination, advance):
    minimum = game.min_players or 2
    if format_ == "multiplayer" and not max(3, minimum) <= table_size <= (game.max_players or table_size):
        raise HTTPException(status_code=422, detail="El tamaño de mesa debe respetar la capacidad del juego")
    if format_ == "multiplayer" and elimination and advance >= table_size:
        raise HTTPException(status_code=422, detail="Deben avanzar menos personas que el tamaño máximo de mesa")
    if format_ == "individual" and elimination and not minimum <= 2 <= (game.max_players or 2):
        raise HTTPException(status_code=422, detail="El juego no admite duelos; usa el formato multijugador")


@router.post("/")
def create_tournament(
    payload: TournamentCreate,
    db: Session = Depends(deps.get_db),
    user: User = Depends(deps.require_role("admin", "facilitador")),
):
    game = db.query(Game).filter(Game.id == payload.game_id).first()
    if not game:
        raise HTTPException(status_code=404, detail="Juego no encontrado")

    _validate_competition(game, payload.competition_format, payload.table_size, payload.elimination, payload.advance_per_table)
    if payload.competition_format == "teams":
        player_count = payload.team_size * 2
        if player_count < (game.min_players or 2) or (game.max_players and player_count > game.max_players):
            raise HTTPException(status_code=422, detail="El juego debe admitir a ambos equipos completos en una mesa")

    tournament = Tournament(
        name=payload.name,
        description=payload.description,
        game_id=payload.game_id,
        created_by_id=user.id,
        max_participants=payload.max_participants,
        competition_format=payload.competition_format,
        elimination=payload.elimination,
        advance_per_table=payload.advance_per_table,
        table_size=payload.table_size,
        team_size=payload.team_size,
        is_public=payload.is_public,
        location=payload.location.strip(),
        scheduled_at=(payload.scheduled_at.astimezone(timezone.utc).replace(tzinfo=None) if payload.scheduled_at and payload.scheduled_at.tzinfo else payload.scheduled_at),
    )
    db.add(tournament)
    db.commit()
    db.refresh(tournament)
    return _serialize_tournament(_get_tournament(db, tournament.id))


@router.get("/{tournament_id}")
def get_tournament(
    tournament_id: UUID,
    db: Session = Depends(deps.get_db),
    user: User = Depends(deps.require_role("admin", "facilitador")),
):
    tournament = _get_tournament(db, tournament_id)
    # Also eagerly load match participants for the detail view
    for rnd in tournament.rounds:
        for match in rnd.matches:
            # Force load relationships
            _ = match.participant1
            _ = match.participant2
            _ = match.winner
    result = _serialize_tournament(tournament, include_rounds=True)
    # Add standings
    result["standings"] = _standings(tournament)
    return result


@router.put("/{tournament_id}")
def update_tournament(
    tournament_id: UUID,
    payload: TournamentUpdate,
    db: Session = Depends(deps.get_db),
    user: User = Depends(deps.require_role("admin", "facilitador")),
):
    tournament = db.query(Tournament).filter(Tournament.id == tournament_id).with_for_update().first()
    if not tournament:
        raise HTTPException(status_code=404, detail="Torneo no encontrado")
    if tournament.status not in ("draft",):
        raise HTTPException(status_code=400, detail="Solo se puede editar un torneo en borrador")

    competition = payload.model_dump(exclude_none=True, include={"elimination", "table_size", "advance_per_table"})
    if competition:
        elimination = competition.get("elimination", tournament.elimination)
        table_size = competition.get("table_size", tournament.table_size)
        advance = competition.get("advance_per_table", tournament.advance_per_table)
        _validate_competition(tournament.game, tournament.competition_format, table_size, elimination, advance)
        for key, value in competition.items():
            setattr(tournament, key, value)

    if payload.name is not None:
        tournament.name = payload.name.strip()
    if payload.description is not None:
        tournament.description = payload.description
    if payload.is_public is not None:
        tournament.is_public = payload.is_public
    if payload.location is not None:
        tournament.location = payload.location.strip()
    if payload.scheduled_at is not None:
        tournament.scheduled_at = payload.scheduled_at.astimezone(timezone.utc).replace(tzinfo=None) if payload.scheduled_at.tzinfo else payload.scheduled_at
    if payload.max_participants is not None:
        if payload.max_participants < len([p for p in tournament.participants if p.is_active]):
            raise HTTPException(status_code=409, detail="La capacidad no puede ser menor al número de inscritos")
        tournament.max_participants = payload.max_participants
    db.commit()
    return _serialize_tournament(_get_tournament(db, tournament_id))


@router.delete("/{tournament_id}")
def delete_tournament(
    tournament_id: UUID,
    db: Session = Depends(deps.get_db),
    user: User = Depends(deps.require_role("admin")),
):
    tournament = db.query(Tournament).filter(Tournament.id == tournament_id).first()
    if not tournament:
        raise HTTPException(status_code=404, detail="Torneo no encontrado")
    db.delete(tournament)
    db.commit()
    return {"detail": "Torneo eliminado"}


# ── Participantes ────────────────────────────────────────────────────────────

@router.post("/{tournament_id}/participants")
def add_participant(
    tournament_id: UUID,
    payload: ParticipantAdd,
    db: Session = Depends(deps.get_db),
    user: User = Depends(deps.require_role("admin", "facilitador")),
):
    tournament = db.query(Tournament).filter(Tournament.id == tournament_id).with_for_update().first()
    if not tournament:
        raise HTTPException(status_code=404, detail="Torneo no encontrado")
    if tournament.status not in ("draft",):
        raise HTTPException(status_code=400, detail="No se pueden agregar participantes a un torneo ya iniciado")

    active_count = db.query(func.count(TournamentParticipant.id)).filter(
        TournamentParticipant.tournament_id == tournament_id,
        TournamentParticipant.is_active.is_(True),
    ).scalar() or 0
    if active_count >= tournament.max_participants:
        raise HTTPException(status_code=400, detail=f"El torneo ya tiene el máximo de {tournament.max_participants} participantes")

    team_members = [name.strip() for name in payload.team_members]
    if tournament.competition_format == "teams":
        if payload.user_id or not payload.external_name or len(team_members) != tournament.team_size:
            raise HTTPException(status_code=422, detail=f"Indica el nombre del equipo y sus {tournament.team_size} integrantes")
        member_keys = {name.casefold() for name in team_members}
        if any(not 2 <= len(name) <= 100 for name in team_members) or len(member_keys) != len(team_members):
            raise HTTPException(status_code=422, detail="Escribe nombres distintos para todos los integrantes")
        for entry in tournament.participants:
            if not entry.is_active:
                continue
            if entry.external_name and entry.external_name.casefold() == payload.external_name.casefold():
                raise HTTPException(status_code=409, detail="Ya hay un equipo con ese nombre")
            if member_keys.intersection(name.casefold() for name in (entry.team_members or [])):
                raise HTTPException(status_code=409, detail="Un integrante ya pertenece a otro equipo")
    elif team_members:
        raise HTTPException(status_code=422, detail="Las plantillas solo se usan en torneos por equipos")

    # Check duplicate
    if payload.user_id:
        existing = db.query(TournamentParticipant).filter(
            TournamentParticipant.tournament_id == tournament_id,
            TournamentParticipant.user_id == payload.user_id,
            TournamentParticipant.is_active.is_(True),
        ).first()
        if existing:
            raise HTTPException(status_code=400, detail="Este usuario ya está inscrito en el torneo")
        target_user = db.query(User).filter(User.id == payload.user_id).first()
        if not target_user:
            raise HTTPException(status_code=404, detail="Usuario no encontrado")

    participant = TournamentParticipant(
        tournament_id=tournament_id,
        user_id=payload.user_id,
        external_name=payload.external_name,
        team_members=team_members or None,
        skill_level=payload.skill_level,
        seed=active_count + 1,
    )
    db.add(participant)
    db.commit()
    db.refresh(participant)
    if participant.user_id:
        participant.user  # Force load
    return _serialize_participant(participant)


@router.delete("/{tournament_id}/participants/{participant_id}")
def remove_participant(
    tournament_id: UUID,
    participant_id: UUID,
    db: Session = Depends(deps.get_db),
    user: User = Depends(deps.require_role("admin", "facilitador")),
):
    closed = db.query(Tournament).filter(Tournament.id == tournament_id).with_for_update().first()
    if not closed:
        raise HTTPException(status_code=404, detail="Torneo no encontrado")
    if closed.status in ("completed", "cancelled"):
        raise HTTPException(status_code=409, detail="El torneo está cerrado; su historial es de solo lectura")
    if closed.status == "active" and (closed.elimination or closed.competition_format != "individual"):
        raise HTTPException(status_code=409, detail="Las inscripciones quedan fijas al iniciar este formato")
    participant = db.query(TournamentParticipant).filter(
        TournamentParticipant.id == participant_id,
        TournamentParticipant.tournament_id == tournament_id,
    ).first()
    if not participant:
        raise HTTPException(status_code=404, detail="Participante no encontrado")

    if closed.status == "active":
        # In active tournament, mark inactive instead of deleting
        participant.is_active = False
        db.commit()
        return {"detail": "Participante retirado del torneo"}

    db.delete(participant)
    db.commit()
    return {"detail": "Participante eliminado"}


# ── Jueces ───────────────────────────────────────────────────────────────────

@router.post("/{tournament_id}/judges")
def add_judge(
    tournament_id: UUID,
    payload: JudgeAdd,
    db: Session = Depends(deps.get_db),
    user: User = Depends(deps.require_role("admin", "facilitador")),
):
    closed = db.query(Tournament).filter(Tournament.id == tournament_id).first()
    if not closed:
        raise HTTPException(status_code=404, detail="Torneo no encontrado")
    if closed.status in ("completed", "cancelled"):
        raise HTTPException(status_code=409, detail="El torneo está cerrado; su historial es de solo lectura")
    tournament = db.query(Tournament).filter(Tournament.id == tournament_id).first()
    if not tournament:
        raise HTTPException(status_code=404, detail="Torneo no encontrado")

    existing = db.query(TournamentJudge).filter(
        TournamentJudge.tournament_id == tournament_id,
        TournamentJudge.user_id == payload.user_id,
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="Este usuario ya es juez del torneo")

    target_user = db.query(User).filter(User.id == payload.user_id).first()
    if not target_user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    if payload.is_head_judge:
        db.query(TournamentJudge).filter_by(tournament_id=tournament_id, is_head_judge=True).update({"is_head_judge": False})

    judge = TournamentJudge(
        tournament_id=tournament_id,
        user_id=payload.user_id,
        is_head_judge=payload.is_head_judge,
    )
    db.add(judge)
    db.commit()
    db.refresh(judge)
    judge.user  # Force load
    return {
        "id": str(judge.id),
        "user_id": str(judge.user_id),
        "display_name": (judge.user.preferences or {}).get("nickname") or judge.user.username,
        "is_head_judge": judge.is_head_judge,
    }


@router.delete("/{tournament_id}/judges/{judge_id}")
def remove_judge(
    tournament_id: UUID,
    judge_id: UUID,
    db: Session = Depends(deps.get_db),
    user: User = Depends(deps.require_role("admin", "facilitador")),
):
    closed = db.query(Tournament).filter(Tournament.id == tournament_id).first()
    if not closed:
        raise HTTPException(status_code=404, detail="Torneo no encontrado")
    if closed.status in ("completed", "cancelled"):
        raise HTTPException(status_code=409, detail="El torneo está cerrado; su historial es de solo lectura")
    judge = db.query(TournamentJudge).filter(
        TournamentJudge.id == judge_id,
        TournamentJudge.tournament_id == tournament_id,
    ).first()
    if not judge:
        raise HTTPException(status_code=404, detail="Juez no encontrado")
    db.delete(judge)
    db.commit()
    return {"detail": "Juez eliminado del torneo"}


# ── Iniciar Torneo / Generar Rondas ─────────────────────────────────────────

@router.post("/{tournament_id}/start")
def start_tournament(
    tournament_id: UUID,
    db: Session = Depends(deps.get_db),
    user: User = Depends(deps.require_role("admin", "facilitador")),
):
    tournament = _get_tournament(db, tournament_id, lock=True)
    if tournament.status != "draft":
        raise HTTPException(status_code=400, detail="El torneo ya fue iniciado o está finalizado")

    active_participants = [p for p in tournament.participants if p.is_active]
    minimum = _minimum_entrants(tournament)
    if len(active_participants) < minimum:
        raise HTTPException(status_code=400, detail=f"Se necesitan al menos {minimum} inscripciones activas para iniciar el torneo")

    if tournament.elimination and tournament.competition_format == "multiplayer":
        try:
            _validate_elimination_path(tournament, len(active_participants))
        except HTTPException as error:
            raise HTTPException(
                status_code=400,
                detail=f"{error.detail} Revisa los inscritos, el tamaño de mesa o cuántos avanzan.",
            ) from error
    tournament.status = "active"
    tournament.started_at = utc_now()

    # Generate first round using swiss matchmaking engine
    return _generate_next_round(db, tournament)


@router.post("/{tournament_id}/next-round")
def next_round(
    tournament_id: UUID,
    db: Session = Depends(deps.get_db),
    user: User = Depends(deps.require_role("admin", "facilitador")),
):
    tournament = _get_tournament(db, tournament_id, lock=True)
    if tournament.status != "active":
        raise HTTPException(status_code=400, detail="El torneo no está activo")

    # Check that all matches of the current round are completed
    if tournament.rounds:
        current = tournament.rounds[-1]
        if tournament.elimination and current.decision.get("final"):
            raise HTTPException(status_code=409, detail="Esta es la final del torneo.")
        incomplete = [m for m in current.matches if m.status != "completed"]
        if incomplete:
            raise HTTPException(
                status_code=400,
                detail=f"Hay {len(incomplete)} partida(s) sin resultado en la ronda actual. Completa todas antes de avanzar.",
            )
        current.status = "completed"
        current.completed_at = utc_now()

    return _generate_next_round(db, tournament)


def _generate_next_round(db: Session, tournament: Tournament) -> dict:
    """Genera la ronda para todos los activos o para quienes clasificaron."""
    next_round_number = tournament.current_round + 1
    eligible = _eligible_ids(tournament)
    decision = {}
    tables = []
    swiss_matches = []
    if tournament.competition_format == "multiplayer":
        tables = _multiplayer_tables(tournament, eligible, decision)
        if tournament.elimination:
            final = len(tables) == 1
            decision.update(final=final, advance={
                str(number): 1 if final else min(tournament.advance_per_table, len(table) - 1)
                for number, table in enumerate(tables, 1)
            })
    else:
        players = _build_swiss_players(tournament)
        if eligible is not None:
            players = [player for player in players if str(player.id) in eligible]
        try:
            swiss_matches = generate_swiss_round(
                players, next_round_number, decision=decision, elimination=tournament.elimination,
            )
        except MatchmakingLimitError as error:
            raise HTTPException(status_code=503, detail=str(error)) from error
        except MatchmakingError as error:
            raise HTTPException(status_code=400, detail=str(error)) from error
        if tournament.elimination:
            decision.update(final=len(players) == 2, advance={
                str(match.table_number): 1 for match in swiss_matches
            })

    # Create round
    new_round = TournamentRound(
        tournament_id=tournament.id,
        round_number=next_round_number,
        decision=decision,
        status="active",
        started_at=utc_now(),
    )
    db.add(new_round)
    db.flush()

    for number, table in enumerate(tables, 1):
        db.add(TournamentMatch(
            round_id=new_round.id, tournament_id=tournament.id, table_number=number,
            table_entries=table, status="pending",
        ))

    # Create matches
    for sm in swiss_matches:
        match = TournamentMatch(
            round_id=new_round.id,
            tournament_id=tournament.id,
            table_number=sm.table_number,
            participant1_id=sm.player1_id,
            participant2_id=sm.player2_id,
            status="pending" if sm.player2_id else "completed",
        )
        # Auto-complete bye matches
        if sm.player2_id is None:
            match.winner_id = sm.player1_id
            match.score_p1 = 1
            match.score_p2 = 0
            # Update participant's bye and points
            participant = db.query(TournamentParticipant).filter(
                TournamentParticipant.id == sm.player1_id
            ).first()
            if participant:
                participant.has_bye = True
                participant.wins += 1
                participant.points += 1
        db.add(match)

    tournament.current_round = next_round_number
    db.commit()

    # Reload and return
    tournament = _get_tournament(db, tournament.id)
    result = _serialize_tournament(tournament, include_rounds=True)
    result["standings"] = _standings(tournament)
    return result


# ── Registrar Resultado ──────────────────────────────────────────────────────

@router.put("/matches/{match_id}/result")
def record_match_result(
    match_id: UUID,
    payload: MatchResult,
    db: Session = Depends(deps.get_db),
    user: User = Depends(deps.require_role("admin", "facilitador")),
):
    tournament_id = db.query(TournamentMatch.tournament_id).filter_by(id=match_id).scalar()
    if not tournament_id:
        raise HTTPException(status_code=404, detail="Partida no encontrada")
    tournament = _get_tournament(db, tournament_id, lock=True)
    match = db.get(TournamentMatch, match_id)
    if not match:
        raise HTTPException(status_code=404, detail="Partida no encontrada")
    if tournament.status != "active":
        raise HTTPException(status_code=409, detail="El torneo no admite nuevos resultados")
    if match.status == "completed":
        raise HTTPException(status_code=400, detail="Esta partida ya tiene resultado registrado")
    if match.table_entries:
        expected = {entry["id"] for entry in match.table_entries}
        placements = [str(entry) for entry in (payload.placements or [])]
        if len(placements) != len(expected) or set(placements) != expected or payload.winner_id:
            raise HTTPException(status_code=422, detail="Ordena a todos los participantes de la mesa una sola vez")
        roster = {str(entry.id): entry for entry in tournament.participants}
        for position, entrant_id in enumerate(placements):
            entrant = roster[entrant_id]
            entrant.points += float(_placement_points(len(placements), position))
            entrant.wins += int(position == 0)
        match.placements = placements
        match.notes = payload.notes
        match.status = "completed"
        db.commit()
        result = _serialize_tournament(tournament, include_rounds=True)
        result["standings"] = _standings(tournament)
        return result
    if payload.placements is not None or not match.participant2_id:
        raise HTTPException(status_code=400, detail="El enfrentamiento requiere ganador o empate")

    if tournament.elimination and not payload.winner_id:
        raise HTTPException(status_code=422, detail="La eliminación requiere un ganador. Resuelve el empate antes de registrar el resultado.")

    # Determine winner
    if payload.winner_id:
        if payload.winner_id not in (match.participant1_id, match.participant2_id):
            raise HTTPException(status_code=400, detail="El ganador debe ser uno de los participantes de esta partida")
        match.winner_id = payload.winner_id
    else:
        match.winner_id = None  # Draw

    match.score_p1 = payload.score_p1
    match.score_p2 = payload.score_p2
    match.notes = payload.notes
    match.status = "completed"

    # Update participant stats
    p1 = match.participant1
    p2 = match.participant2

    if match.winner_id == p1.id:
        p1.wins += 1
        p1.points += 1
        p2.losses += 1
    elif match.winner_id == p2.id:
        p2.wins += 1
        p2.points += 1
        p1.losses += 1
    else:
        # Draw
        p1.draws += 1
        p2.draws += 1
        p1.points += 0.5
        p2.points += 0.5

    db.commit()

    # Return updated tournament
    tournament = _get_tournament(db, match.tournament_id)
    result = _serialize_tournament(tournament, include_rounds=True)
    result["standings"] = _standings(tournament)
    return result


# ── Finalizar Torneo ─────────────────────────────────────────────────────────

@router.post("/{tournament_id}/complete")
def complete_tournament(
    tournament_id: UUID,
    db: Session = Depends(deps.get_db),
    user: User = Depends(deps.require_role("admin", "facilitador")),
):
    tournament = _get_tournament(db, tournament_id, lock=True)
    if tournament.status != "active":
        raise HTTPException(status_code=400, detail="Solo se puede finalizar un torneo activo")

    if tournament.elimination and not (tournament.rounds and tournament.rounds[-1].decision.get("final")):
        raise HTTPException(status_code=409, detail="La eliminación solo puede finalizar después de disputar la final.")

    # Check all matches in all rounds are completed
    for rnd in tournament.rounds:
        for match in rnd.matches:
            if match.status != "completed":
                raise HTTPException(
                    status_code=400,
                    detail=f"La ronda {rnd.round_number} tiene partidas sin completar. Registra todos los resultados primero.",
                )
        if rnd.status != "completed":
            rnd.status = "completed"
            rnd.completed_at = utc_now()

    tournament.status = "completed"
    tournament.completed_at = utc_now()
    db.commit()

    tournament = _get_tournament(db, tournament_id)
    result = _serialize_tournament(tournament, include_rounds=True)
    result["standings"] = _standings(tournament)
    return result


# ── Cancelar Torneo ──────────────────────────────────────────────────────────

@router.post("/{tournament_id}/cancel")
def cancel_tournament(
    tournament_id: UUID,
    db: Session = Depends(deps.get_db),
    user: User = Depends(deps.require_role("admin")),
):
    tournament = db.query(Tournament).filter(Tournament.id == tournament_id).first()
    if not tournament:
        raise HTTPException(status_code=404, detail="Torneo no encontrado")
    if tournament.status == "completed":
        raise HTTPException(status_code=400, detail="No se puede cancelar un torneo ya finalizado")
    tournament.status = "cancelled"
    db.commit()
    return {"detail": "Torneo cancelado"}
