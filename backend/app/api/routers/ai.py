from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import or_
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from app.api import deps
from app.models import User, AIInteraction, Game, GameRule
from app.services.ai.factory import get_provider

router = APIRouter()


class AIQueryRequest(BaseModel):
    query: str
    game_id: Optional[str] = None
    session_id: Optional[str] = None


class AIProcessRulesRequest(BaseModel):
    game_id: str


@router.post("/query", response_model=dict)
def ai_query(
    req: AIQueryRequest,
    db: Session = Depends(deps.get_db),
    user: User = Depends(deps.get_current_user),
):
    """Ask a question to the AI with optional game context."""
    provider = get_provider()
    if not provider.health_check():
        raise HTTPException(status_code=503, detail="El asistente no está disponible. Consulta los manuales e inténtalo más tarde")
    context = {}

    # Build context from game rules if game_id provided
    if req.game_id:
        game = db.query(Game).filter(Game.id == req.game_id).first()
        if game:
            rules = db.query(GameRule).filter(
                GameRule.game_id == req.game_id,
                or_(GameRule.visibility == "global", GameRule.added_by_id == user.id),
            ).all()
            if rules:
                rules_text = "\n".join(
                    f"[{r.rule_type}] {r.title}: {r.content}" for r in rules
                )
                context["game_name"] = game.name
                context["rules_count"] = len(rules)
                prompt = (
                    f"Contexto: Juego '{game.name}' con {len(rules)} reglas.\n\n"
                    f"Reglas del juego:\n{rules_text}\n\n"
                    f"Pregunta del usuario: {req.query}"
                )
            else:
                prompt = (
                    f"Contexto: Juego '{game.name}' (sin reglas cargadas aún).\n\n"
                    f"Pregunta del usuario: {req.query}"
                )
            context["game_id"] = req.game_id
        else:
            raise HTTPException(status_code=404, detail="Juego no encontrado")
    else:
        prompt = req.query

    # Call provider
    import time
    start = time.time()
    response = provider.ask(prompt, system_prompt="Eres un asistente experto en juegos de mesa. Responde siempre en español, de forma clara y concisa.")
    if not response or response.startswith("[Ollama no disponible]"):
        raise HTTPException(status_code=503, detail="Ollama no pudo generar una respuesta. Comprueba el modelo e inténtalo nuevamente.")
    elapsed = int((time.time() - start) * 1000)

    # Log the interaction
    interaction = AIInteraction(
        user_id=user.id,
        game_id=req.game_id,
        session_id=req.session_id,
        query=req.query,
        response=response,
        context=context,
        response_time_ms=elapsed,
        model_used=provider.name,
    )
    db.add(interaction)
    db.commit()

    return {
        "response": response,
        "model": provider.name,
        "response_time_ms": elapsed,
    }


@router.post("/process-rules", response_model=dict)
def ai_process_rules(
    req: AIProcessRulesRequest,
    db: Session = Depends(deps.get_db),
    user: User = Depends(deps.require_role("admin", "facilitador")),
):
    """Process game rules through AI to extract keywords and summaries."""
    game = db.query(Game).filter(Game.id == req.game_id).first()
    if not game:
        raise HTTPException(status_code=404, detail="Juego no encontrado")

    rules = db.query(GameRule).filter(GameRule.game_id == req.game_id, GameRule.visibility == "global").all()
    if not rules:
        raise HTTPException(status_code=400, detail="El juego no tiene reglas para procesar")

    provider = get_provider()
    if not provider.health_check():
        raise HTTPException(status_code=503, detail="Ollama no está disponible.")
    results = []

    for rule in rules:
        processed = provider.process_rules(rule.content)
        if not processed or processed.startswith("[Ollama no disponible]"):
            raise HTTPException(status_code=503, detail="Ollama no pudo procesar las reglas.")
        rule.ai_processed_content = processed
        results.append({"rule_id": str(rule.id), "title": rule.title, "processed": processed})

    db.commit()

    return {
        "game_id": req.game_id,
        "game_name": game.name,
        "rules_processed": len(results),
        "results": results,
    }


@router.get("/provider", response_model=dict)
def ai_provider_info(user: User = Depends(deps.get_current_user)):
    """Get current AI provider configuration info."""
    provider = get_provider()
    return {
        "provider": provider.name,
        "healthy": provider.health_check(),
        "generation_options": provider.generation_options,
    }
