"""Emparejamiento suizo con restricciones y preferencias de Ludisist."""

from __future__ import annotations

from dataclasses import dataclass, field
from time import perf_counter
from typing import Optional
from uuid import UUID


SKILL_INDEX: dict[str, int] = {
    "principiante": 0,
    "intermedio": 1,
    "avanzado": 2,
    "experto": 3,
}

MAX_SEARCH_STATES = 50_000
SEARCH_TIMEOUT_SECONDS = 1.0


@dataclass
class SwissPlayer:
    """Representación interna de un participante para el motor experto."""
    id: UUID
    name: str
    skill_level: str
    points: float = 0.0
    wins: int = 0
    losses: int = 0
    draws: int = 0
    has_bye: bool = False
    past_opponents: set[UUID] = field(default_factory=set)

    @property
    def skill_index(self) -> int:
        return SKILL_INDEX.get(self.skill_level, 1)


@dataclass
class SwissMatch:
    """Un emparejamiento generado por el motor."""
    player1_id: UUID
    player2_id: Optional[UUID]  # None = bye
    table_number: int


class MatchmakingError(Exception):
    """Error cuando no es posible generar emparejamientos válidos."""


class MatchmakingLimitError(MatchmakingError):
    """La búsqueda se interrumpió antes de demostrar si había una solución."""


def _find_pairings_backtrack(players, max_dist, effort, deadline):
    """Busca el primer emparejamiento válido y memoriza estados sin solución."""
    candidates = []
    for player in players:
        compatible = [
            index for index, other in enumerate(players)
            if player.id != other.id
            and other.id not in player.past_opponents
            and player.id not in other.past_opponents
            and abs(player.skill_index - other.skill_index) <= max_dist
        ]
        compatible.sort(key=lambda index: (
            abs(player.points - players[index].points),
            abs(player.skill_index - players[index].skill_index),
        ))
        candidates.append(compatible)

    failed = set()

    def search(remaining):
        if not remaining:
            return []
        if remaining in failed:
            return None
        effort["states"] += 1
        if effort["states"] > MAX_SEARCH_STATES or perf_counter() >= deadline:
            raise MatchmakingLimitError(
                "La búsqueda alcanzó su límite antes de confirmar si existe una ronda válida. "
                "La ronda sigue pendiente y puedes reintentar."
            )

        first_bit = remaining & -remaining
        first = first_bit.bit_length() - 1
        pool = remaining ^ first_bit
        for candidate in candidates[first]:
            candidate_bit = 1 << candidate
            if pool & candidate_bit:
                result = search(pool ^ candidate_bit)
                if result is not None:
                    return [(players[first], players[candidate]), *result]
                effort["backtracks"] += 1
        failed.add(remaining)
        return None

    return search((1 << len(players)) - 1)


def generate_swiss_round(
    players: list[SwissPlayer],
    round_number: int = 1,
    *,
    decision: dict | None = None,
    elimination: bool = False,
) -> list[SwissMatch]:
    """Completa una ronda respetando el historial y el límite de búsqueda."""
    if len(players) < 2:
        raise MatchmakingError("Se necesitan al menos 2 jugadores activos para generar una ronda.")

    started = perf_counter()
    deadline = started + SEARCH_TIMEOUT_SECONDS
    effort = {"states": 0, "backtracks": 0}
    ordered = sorted(players, key=lambda p: (-p.points, -p.skill_index, p.id))
    bye_candidates = [None]
    if len(players) % 2:
        bye_candidates = sorted(players, key=lambda p: (
            p.has_bye, -p.skill_index if elimination else p.points, p.skill_index, p.id,
        ))

    for bye in bye_candidates:
        if perf_counter() >= deadline:
            raise MatchmakingLimitError("La búsqueda superó su tiempo límite. Puedes reintentar.")
        remaining = [p for p in ordered if p is not bye]
        for distance in (1, 2, 3):
            pairings = _find_pairings_backtrack(remaining, distance, effort, deadline)
            if pairings is None:
                continue

            matches = [
                SwissMatch(first.id, second.id, number)
                for number, (first, second) in enumerate(pairings, 1)
            ]
            explanations = {
                str(number): (
                    f"Diferencia de puntos: {abs(first.points - second.points):g}. "
                    f"Diferencia de nivel: {abs(first.skill_index - second.skill_index)}. "
                    "Cruce nuevo compatible con la ronda completa."
                )
                for number, (first, second) in enumerate(pairings, 1)
            }
            summary = f"Ronda válida con hasta {distance} nivel(es) de diferencia."
            if distance > 1:
                summary += " Los límites de habilidad más estrictos no permitieron completar estos cruces."
            if bye is not None:
                matches.append(SwissMatch(bye.id, None, 0))
                if bye.has_bye:
                    explanations["0"] = "Pase repetido: ningún candidato sin pase previo permitió completar la ronda."
                elif elimination:
                    explanations["0"] = "Pase automático: se prioriza evitar repetir el pase y, después, el mayor nivel declarado."
                else:
                    explanations["0"] = "Descanso: se prioriza evitar repetirlo y, después, la menor puntuación disponible."
            if decision is not None:
                decision.update(effort, elapsed_ms=round((perf_counter() - started) * 1000, 2),
                                skill_distance=distance, summary=summary, matches=explanations)
            return matches

    raise MatchmakingError(
        "No existe una ronda completa sin repetir oponentes, incluso después de evaluar "
        "todos los descansos posibles y todas las diferencias de nivel."
    )


def calculate_standings(players: list[SwissPlayer]) -> list[dict]:
    """
    Calcula la clasificación con la política de desempate de Ludisist:
    1. Puntos totales
    2. Buchholz (suma de puntos de todos los oponentes enfrentados)
    3. Buchholz Mediano (suma de puntos de oponentes excluyendo el mejor y el peor)
    4. Victorias totales
    La habilidad solo se usa en emparejamientos, no para resolver posiciones finales.
    """
    player_by_id = {p.id: p for p in players}

    scored_players = []
    for p in players:
        # Calcular puntos de los oponentes enfrentados
        opp_points = [
            player_by_id[opp_id].points
            for opp_id in p.past_opponents
            if opp_id in player_by_id
        ]
        buchholz = round(sum(opp_points), 2)

        if len(opp_points) >= 3:
            sorted_opp = sorted(opp_points)
            median_buchholz = round(sum(sorted_opp[1:-1]), 2)
        else:
            median_buchholz = buchholz

        scored_players.append({
            "player": p,
            "buchholz": buchholz,
            "median_buchholz": median_buchholz,
        })

    # Criterios de ordenamiento suizo
    scored_players.sort(
        key=lambda item: (
            -item["player"].points,
            -item["buchholz"],
            -item["median_buchholz"],
            -item["player"].wins,
            item["player"].name.lower(),
        )
    )

    standings = []
    previous_key = None
    shared_rank = 0
    for rank, item in enumerate(scored_players, start=1):
        p = item["player"]
        sporting_key = (p.points, item["buchholz"], item["median_buchholz"], p.wins)
        if sporting_key != previous_key:
            shared_rank = rank
        previous_key = sporting_key
        neighbors = [row for i,row in enumerate(scored_players) if i != rank-1 and row["player"].points == p.points]
        neighbor = next((row for row in neighbors if (row["player"].points,row["buchholz"],row["median_buchholz"],row["player"].wins) == sporting_key), neighbors[0] if neighbors else None)
        reason = ""
        if neighbor and p.points == neighbor["player"].points:
            if item["buchholz"] != neighbor["buchholz"]: reason = "Desempate por Buchholz"
            elif item["median_buchholz"] != neighbor["median_buchholz"]: reason = "Desempate por Buchholz mediano"
            elif p.wins != neighbor["player"].wins: reason = "Desempate por victorias"
            else: reason = "Empate técnico: posición compartida"
        standings.append({
            "rank": shared_rank,
            "tie_break": reason,
            "id": str(p.id),
            "player_id": str(p.id),
            "name": p.name,
            "skill_level": p.skill_level,
            "points": p.points,
            "wins": p.wins,
            "losses": p.losses,
            "draws": p.draws,
            "buchholz": item["buchholz"],
            "median_buchholz": item["median_buchholz"],
            "has_bye": p.has_bye,
            "opponents_faced": len(p.past_opponents),
        })

    return standings
