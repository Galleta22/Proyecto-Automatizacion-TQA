from typing import List, Optional
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.orm import Session
from app.api import deps
from app.models import Game, User, GameSession, GameRule, CafeInventory, UserRecommendation, AIInteraction, UserGameSession, Table, GameCategoryMapping, GameRating
from app.schemas.game import GameCreate, GameUpdate
from app.api.routers.audit import log_action
from app.services import bgg as bgg_service
from app.services.game_coverage import MISSING_GAME_IMAGE, MISSING_QUICK_RULES, PUBLISHED_QUICK_RULE

router = APIRouter()

def serialize_favorite(recommendation: UserRecommendation) -> dict:
    game = recommendation.game
    return {
        "id": str(game.id),
        "name": game.name,
        "image_url": game.image_url,
        "playing_time": game.playing_time,
        "min_players": game.min_players,
        "max_players": game.max_players,
        "complexity_rating": game.complexity_rating,
    }

@router.get("/favorites", response_model=List[dict])
def list_favorite_games(
    db: Session = Depends(deps.get_db),
    user: User = Depends(deps.get_current_user),
):
    favorites = (
        db.query(UserRecommendation)
        .filter(
            UserRecommendation.user_id == user.id,
            UserRecommendation.recommendation_type == "favorite",
        )
        .order_by(UserRecommendation.generated_at.desc())
        .all()
    )
    return [serialize_favorite(favorite) for favorite in favorites]

@router.post("/{game_id}/favorite", response_model=dict)
def add_favorite_game(
    game_id: str,
    db: Session = Depends(deps.get_db),
    user: User = Depends(deps.get_current_user),
):
    game = db.query(Game).filter(Game.id == game_id).first()
    if not game:
        raise HTTPException(status_code=404, detail="Juego no encontrado")

    favorite = db.query(UserRecommendation).filter(
        UserRecommendation.user_id == user.id,
        UserRecommendation.game_id == game.id,
        UserRecommendation.recommendation_type == "favorite",
    ).first()
    if not favorite:
        favorite = UserRecommendation(
            user_id=user.id,
            game_id=game.id,
            recommendation_type="favorite",
            score=1.0,
            reason="Marcado como favorito por el usuario",
            was_accepted=True,
        )
        db.add(favorite)
        db.commit()

    return {"favorite": True, "game_id": str(game.id)}

@router.delete("/{game_id}/favorite", response_model=dict)
def remove_favorite_game(
    game_id: str,
    db: Session = Depends(deps.get_db),
    user: User = Depends(deps.get_current_user),
):
    favorite = db.query(UserRecommendation).filter(
        UserRecommendation.user_id == user.id,
        UserRecommendation.game_id == game_id,
        UserRecommendation.recommendation_type == "favorite",
    ).first()
    if favorite:
        db.delete(favorite)
        db.commit()
    return {"favorite": False, "game_id": game_id}

@router.get("/", response_model=List[dict] | dict)
def list_games(
    paginated: bool = Query(False),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=5, le=100),
    all_items: bool = Query(False),
    q: str = Query("", max_length=100),
    sort: str = Query("name_asc"),
    coverage: Optional[str] = Query(None, pattern="^(all|without_images|without_rules)$"),
    db: Session = Depends(deps.get_db),
    user: Optional[User] = Depends(deps.get_optional_user),
):
    games_query = db.query(Game)
    if q.strip():
        games_query = games_query.filter(Game.name.ilike(f"%{q.strip()}%"))
    if coverage == "without_images":
        games_query = games_query.filter(MISSING_GAME_IMAGE)
    elif coverage == "without_rules":
        games_query = games_query.filter(MISSING_QUICK_RULES)
    total = games_query.count()
    sort_options = {
        "name_asc": Game.name.asc(), "name_desc": Game.name.desc(),
        "complexity_asc": Game.complexity_rating.asc(), "complexity_desc": Game.complexity_rating.desc(),
        "duration_asc": Game.playing_time.asc(), "duration_desc": Game.playing_time.desc(),
        "players_asc": Game.min_players.asc(), "players_desc": Game.max_players.desc(),
        "created_desc": Game.created_at.desc(), "updated_desc": Game.updated_at.desc(),
    }
    games_query = games_query.order_by(sort_options.get(sort, Game.name.asc()), Game.name.asc())
    if paginated and not all_items:
        games_query = games_query.offset((page - 1) * page_size).limit(page_size)
    juegos = games_query.all()
    quick_rule_counts = {}
    if coverage is not None and juegos:
        quick_rule_counts = dict(
            db.query(GameRule.game_id, func.count(GameRule.id))
            .filter(PUBLISHED_QUICK_RULE, GameRule.game_id.in_([game.id for game in juegos]))
            .group_by(GameRule.game_id)
            .all()
        )
    private_rule_counts = {}
    if coverage is not None and juegos and user:
        private_rule_counts = dict(
            db.query(GameRule.game_id, func.count(GameRule.id))
            .filter(
                GameRule.visibility == "private",
                GameRule.added_by_id == user.id,
                GameRule.game_id.in_([game.id for game in juegos]),
            )
            .group_by(GameRule.game_id)
            .all()
        )
    rating_rows = (
        db.query(
            GameRating.game_id,
            func.avg(GameRating.rating).label("average"),
            func.count(GameRating.id).label("count"),
        )
        .group_by(GameRating.game_id)
        .all()
    )
    rating_summary = {
        str(row.game_id): {
            "rating_average": round(float(row.average), 1),
            "rating_count": int(row.count),
        }
        for row in rating_rows
    }
    user_ratings = {}
    if user:
        user_ratings = {
            str(rating.game_id): rating.rating
            for rating in db.query(GameRating).filter(GameRating.user_id == user.id).all()
        }
    # Map SQLAlchemy model to dict to ensure compatibility with frontend
    items = [
        {
            "id": str(j.id), # Convert UUID to string
            "name": j.name,
            "description": j.description,
            "min_players": j.min_players,
            "max_players": j.max_players,
            "playing_time": j.playing_time,
            "complexity_rating": j.complexity_rating,
            "game_metadata": j.game_metadata,
            "image_url": j.image_url,
            "bgg_id": j.bgg_id,
            "created_at": j.created_at.isoformat() if j.created_at else None,
            "updated_at": j.updated_at.isoformat() if j.updated_at else None,
            **rating_summary.get(str(j.id), {"rating_average": 0, "rating_count": 0}),
            "user_rating": user_ratings.get(str(j.id)),
            **({
                "quick_rule_count": quick_rule_counts.get(j.id, 0),
                "private_quick_rule_count": private_rule_counts.get(j.id, 0),
            } if coverage is not None else {}),
        }
        for j in juegos
    ]
    if not paginated:
        return items
    pages = 1 if all_items else max((total + page_size - 1) // page_size, 1)
    return {"items": items, "page": 1 if all_items else page, "page_size": total if all_items else page_size, "total": total, "pages": pages, "all_items": all_items}


@router.get("/random", response_model=dict)
def random_game(
    db: Session = Depends(deps.get_db),
    user: Optional[User] = Depends(deps.get_optional_user),
):
    game = db.query(Game).filter(Game.is_active == True).order_by(func.random()).first()
    if not game:
        raise HTTPException(status_code=404, detail="No hay juegos disponibles en el catálogo.")
    avg_rating, count = (
        db.query(func.avg(GameRating.rating), func.count(GameRating.id))
        .filter(GameRating.game_id == game.id)
        .one()
    )
    return {
        "id": str(game.id),
        "name": game.name,
        "description": game.description,
        "image_url": game.image_url,
        "min_players": game.min_players,
        "max_players": game.max_players,
        "playing_time": game.playing_time,
        "complexity_rating": game.complexity_rating,
        "categories": [{"id": c.id, "name": c.name} for c in game.categories],
        "rating_average": round(float(avg_rating), 1) if avg_rating else 0,
        "rating_count": int(count),
    }

@router.get("/{game_id}", response_model=dict)
def get_game(
    game_id: str,
    db: Session = Depends(deps.get_db),
    user: Optional[User] = Depends(deps.get_optional_user),
):
    try:
        game_uuid = UUID(game_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="Juego no encontrado.") from None
    game = db.get(Game, game_uuid)
    if not game:
        raise HTTPException(status_code=404, detail="Juego no encontrado.")
    avg_rating, count = (
        db.query(func.avg(GameRating.rating), func.count(GameRating.id))
        .filter(GameRating.game_id == game.id)
        .one()
    )
    user_rating = None
    if user:
        rating = db.query(GameRating).filter(GameRating.game_id == game.id, GameRating.user_id == user.id).first()
        if rating:
            user_rating = rating.rating
    return {
        "id": str(game.id),
        "name": game.name,
        "description": game.description,
        "image_url": game.image_url,
        "min_players": game.min_players,
        "max_players": game.max_players,
        "playing_time": game.playing_time,
        "complexity_rating": game.complexity_rating,
        "game_metadata": game.game_metadata,
        "bgg_id": game.bgg_id,
        "categories": [{"id": c.id, "name": c.name} for c in game.categories],
        "rating_average": round(float(avg_rating), 1) if avg_rating else 0,
        "rating_count": int(count),
        "user_rating": user_rating,
    }

def rating_response(db: Session, game_id, user_id) -> dict:
    average, count = (
        db.query(func.avg(GameRating.rating), func.count(GameRating.id))
        .filter(GameRating.game_id == game_id)
        .one()
    )
    own = db.query(GameRating).filter(
        GameRating.game_id == game_id,
        GameRating.user_id == user_id,
    ).first()
    return {
        "game_id": str(game_id),
        "rating_average": round(float(average), 1) if average is not None else 0,
        "rating_count": int(count or 0),
        "user_rating": own.rating if own else None,
    }


@router.put("/{game_id}/rating", response_model=dict)
def rate_game(
    game_id: str,
    rating: int = Query(..., ge=1, le=5),
    db: Session = Depends(deps.get_db),
    user: User = Depends(deps.get_current_user),
):
    game = db.query(Game).filter(Game.id == game_id).first()
    if not game:
        raise HTTPException(status_code=404, detail="Juego no encontrado")

    user_rating = db.query(GameRating).filter(
        GameRating.user_id == user.id,
        GameRating.game_id == game.id,
    ).first()
    if user_rating:
        user_rating.rating = rating
        action = "UPDATE_GAME_RATING"
    else:
        user_rating = GameRating(user_id=user.id, game_id=game.id, rating=rating)
        db.add(user_rating)
        action = "CREATE_GAME_RATING"
    db.commit()

    log_action(db, user, action, "Game", game.id, game.name, {"rating": rating})
    return rating_response(db, game.id, user.id)


@router.delete("/{game_id}/rating", response_model=dict)
def remove_game_rating(
    game_id: str,
    db: Session = Depends(deps.get_db),
    user: User = Depends(deps.get_current_user),
):
    game = db.query(Game).filter(Game.id == game_id).first()
    if not game:
        raise HTTPException(status_code=404, detail="Juego no encontrado")

    user_rating = db.query(GameRating).filter(
        GameRating.user_id == user.id,
        GameRating.game_id == game.id,
    ).first()
    if user_rating:
        db.delete(user_rating)
        db.commit()
        log_action(db, user, "DELETE_GAME_RATING", "Game", game.id, game.name, {})

    return rating_response(db, game.id, user.id)

@router.post("/", response_model=dict)
def create_game(game: GameCreate, db: Session = Depends(deps.get_db), user: User = Depends(deps.require_role("admin", "facilitador"))):
    # Auto-generate slug if not provided
    slug = game.slug if game.slug else game.name.lower().replace(" ", "-")

    db_game = db.query(Game).filter(Game.name == game.name).first()
    if db_game:
        raise HTTPException(status_code=400, detail="El juego ya existe")

    nuevo = Game(
        name=game.name,
        slug=slug,
        description=game.description,
        min_players=game.min_players,
        max_players=game.max_players,
        playing_time=game.playing_time,
        complexity_rating=game.complexity_rating,
        image_url=game.image_url,
        game_metadata=game.game_metadata
    )
    db.add(nuevo)
    db.commit()
    db.refresh(nuevo)

    # Log the action
    log_action(db, user, "CREATE", "Game", nuevo.id, nuevo.name, {
        "min_players": nuevo.min_players,
        "max_players": nuevo.max_players,
        "playing_time": nuevo.playing_time
    })

    return {
        "id": str(nuevo.id),
        "name": nuevo.name,
        "description": nuevo.description,
        "image_url": nuevo.image_url,
        "playing_time": nuevo.playing_time
    }

@router.put("/{game_id}", response_model=dict)
def update_game(game_id: UUID, update: GameUpdate, db: Session = Depends(deps.get_db), user: User = Depends(deps.require_role("admin", "facilitador"))):
    # Ensure game_id is handled as string (UUID)
    game = db.query(Game).filter(Game.id == game_id).first()
    if not game:
        raise HTTPException(status_code=404, detail="Juego no encontrado")

    from app.models import ContentRevision
    # Store old values for audit
    old_values = {var: getattr(game, var) for var in update.dict(exclude_unset=True).keys()}

    db.add(ContentRevision(entity_type="game", entity_id=game.id, entity_name=game.name, user_id=user.id, before=old_values, after=update.model_dump(exclude_unset=True)))

    for var, value in update.dict(exclude_unset=True).items():
        setattr(game, var, value)

    db.commit()
    db.refresh(game)

    # Log the update with old/new values
    log_action(db, user, "UPDATE", "Game", game.id, game.name, {
        "old_values": old_values,
        "new_values": update.dict(exclude_unset=True)
    })

    return {
        "id": str(game.id),
        "name": game.name
    }

@router.delete("/{game_id}", response_model=dict)
def delete_game(game_id: str, db: Session = Depends(deps.get_db), user: User = Depends(deps.require_role("admin"))):
    from sqlalchemy import text

    game = db.query(Game).filter(Game.id == game_id).first()
    if not game:
        raise HTTPException(status_code=404, detail="Juego no encontrado")

    # Store game name before deletion for audit
    game_name = game.name

    try:
        # Use raw SQL to bypass ORM cascade conflicts
        # 1. Get session IDs first
        sessions = db.execute(text("SELECT id FROM game_sessions WHERE game_id = :gid"), {"gid": game_id}).fetchall()
        session_ids = [str(s[0]) for s in sessions]

        if session_ids:
            session_id_list = ",".join([f"'{sid}'" for sid in session_ids])

            # 2. Delete AI interactions for sessions
            db.execute(text(f"DELETE FROM ai_interactions WHERE session_id IN ({session_id_list})"))

            # 3. Delete user-session associations
            db.execute(text(f"DELETE FROM user_game_session WHERE session_id IN ({session_id_list})"))

            # 4. Clear table references
            db.execute(text(f"UPDATE tables SET current_session_id = NULL WHERE current_session_id IN ({session_id_list})"))

            # 5. Delete sessions
            db.execute(text(f"DELETE FROM game_sessions WHERE id IN ({session_id_list})"))

        # 6. Delete rules
        db.execute(text("DELETE FROM game_rules WHERE game_id = :gid"), {"gid": game_id})

        # 7. Delete inventory
        db.execute(text("DELETE FROM cafe_inventory WHERE game_id = :gid"), {"gid": game_id})

        # 8. Delete recommendations
        db.execute(text("DELETE FROM user_recommendations WHERE game_id = :gid"), {"gid": game_id})

        # 9. Delete AI interactions directly linked to game
        db.execute(text("DELETE FROM ai_interactions WHERE game_id = :gid"), {"gid": game_id})

        # 10. Delete category mappings
        db.execute(text("DELETE FROM game_category_mapping WHERE game_id = :gid"), {"gid": game_id})

        # 11. Finally delete the game
        db.execute(text("DELETE FROM games WHERE id = :gid"), {"gid": game_id})

        db.commit()

        # Log the deletion
        log_action(db, user, "DELETE", "Game", game_id, game_name, {
            "sessions_deleted": len(session_ids)
        })

    except Exception as e:
        db.rollback()
        print(f"Error deleting game: {e}")
        raise HTTPException(status_code=500, detail=f"Error al eliminar: {str(e)}")

    return {"detail": "Juego eliminado"}


# ==================== BGG INTEGRATION ====================

@router.get("/bgg/search", response_model=List[dict])
def bgg_search(query: str = Query(..., min_length=2), exact: bool = Query(False)):
    """Search BoardGameGeek for games by name."""
    results = bgg_service.search_games(query, exact=exact)
    if not results:
        raise HTTPException(status_code=404, detail="No se encontraron juegos en BGG")
    return results


@router.get("/bgg-detail/{bgg_id}", response_model=dict)
def bgg_detail(bgg_id: int):
    """Get full BGG game details for preview."""
    details = bgg_service.get_game_details(bgg_id)
    if not details:
        raise HTTPException(status_code=404, detail="Juego no encontrado en BGG")
    return details


@router.post("/bgg-import/{bgg_id}", response_model=dict)
def bgg_import(
    bgg_id: int,
    db: Session = Depends(deps.get_db),
    user: User = Depends(deps.require_role("admin", "facilitador"))
):
    """Import a game from BoardGameGeek by its BGG ID."""
    details = bgg_service.get_game_details(bgg_id)
    if not details:
        raise HTTPException(status_code=404, detail="Juego no encontrado en BGG")

    # Check if already exists by bgg_id
    existing = db.query(Game).filter(Game.bgg_id == bgg_id).first()
    if existing:
        raise HTTPException(status_code=400, detail=f"El juego ya existe como '{existing.name}'")

    # Check if name already exists
    existing_name = db.query(Game).filter(Game.name == details["name"]).first()
    if existing_name:
        raise HTTPException(status_code=400, detail=f"Ya existe un juego con el nombre '{details['name']}'")

    slug = details["name"].lower().replace(" ", "-").replace(":", "").replace("'", "")
    slug = slug.replace("é", "e").replace("í", "i").replace("ó", "o").replace("ú", "u").replace("ñ", "n")

    game = Game(
        name=details["name"],
        slug=slug,
        description=details["description"][:2000] if details["description"] else "",
        bgg_id=details["bgg_id"],
        min_players=details["min_players"],
        max_players=details["max_players"],
        playing_time=details["playing_time"],
        min_age=details["min_age"],
        complexity_rating=details["complexity_rating"] or 1.0,
        image_url=details["image_url"],
        game_metadata={
            "bgg_id": details["bgg_id"],
            "thumbnail_url": details["thumbnail_url"],
            "categories": details["categories"],
            "mechanics": details["mechanics"],
            "designers": details["designers"],
            "publishers": details["publishers"],
            "year_published": details["year_published"],
            "average_rating": details["average_rating"],
            "bgg_url": details["bgg_url"],
        }
    )
    db.add(game)
    db.commit()
    db.refresh(game)

    log_action(db, user, "BGG_IMPORT", "Game", game.id, game.name, {
        "bgg_id": bgg_id,
        "categories": details["categories"],
        "mechanics": details["mechanics"],
    })

    return {
        "id": str(game.id),
        "name": game.name,
        "image_url": game.image_url,
        "bgg_id": game.bgg_id,
    }


@router.post("/{game_id}/bgg-sync", response_model=dict)
def bgg_sync(
    game_id: str,
    db: Session = Depends(deps.get_db),
    user: User = Depends(deps.require_role("admin", "facilitador"))
):
    """Sync game metadata from BoardGameGeek using the game's bgg_id."""
    game = db.query(Game).filter(Game.id == game_id).first()
    if not game:
        raise HTTPException(status_code=404, detail="Juego no encontrado")

    # Use bgg_id if available, otherwise search by name
    bgg_id = game.bgg_id
    if not bgg_id:
        result = bgg_service.search_and_pick_first(game.name)
        if not result:
            raise HTTPException(status_code=404, detail="No se encontró el juego en BGG. Asigna un bgg_id manualmente.")
        bgg_id = result["bgg_id"]

    details = bgg_service.get_game_details(bgg_id)
    if not details:
        raise HTTPException(status_code=404, detail=f"No se pudieron obtener datos de BGG para ID {bgg_id}")

    old_image = game.image_url
    old_metadata = dict(game.game_metadata or {})

    game.bgg_id = details["bgg_id"]
    game.image_url = details["image_url"] or game.image_url
    if not old_metadata.get("description_reviewed"):
        game.description = details["description"][:2000] if details["description"] else game.description
    game.min_players = details["min_players"]
    game.max_players = details["max_players"]
    game.playing_time = details["playing_time"]
    game.min_age = details["min_age"]
    game.complexity_rating = details["complexity_rating"] or game.complexity_rating

    # Merge metadata
    merged_meta = dict(old_metadata)
    merged_meta.update({
        "bgg_id": details["bgg_id"],
        "thumbnail_url": details["thumbnail_url"],
        "categories": details["categories"],
        "mechanics": details["mechanics"],
        "designers": details["designers"],
        "publishers": details["publishers"],
        "year_published": details["year_published"],
        "average_rating": details["average_rating"],
        "bgg_url": details["bgg_url"],
    })
    game.game_metadata = merged_meta

    db.commit()
    db.refresh(game)

    log_action(db, user, "BGG_SYNC", "Game", game.id, game.name, {
        "bgg_id": bgg_id,
        "image_updated": old_image != game.image_url,
    })

    return {
        "id": str(game.id),
        "name": game.name,
        "image_url": game.image_url,
        "bgg_id": game.bgg_id,
        "metadata_updated": True,
    }


@router.post("/bgg-sync-selected", response_model=dict)
def bgg_sync_selected(
    payload: dict,
    db: Session = Depends(deps.get_db),
    user: User = Depends(deps.require_role("admin", "facilitador"))
):
    """Sync multiple games from BGG. Accepts game_ids and optional only_empty."""
    game_ids = payload.get("game_ids", [])
    only_empty = bool(payload.get("only_empty", False))
    if not game_ids:
        raise HTTPException(status_code=400, detail="No se proporcionaron IDs de juegos")

    results = {"success": [], "errors": []}
    for gid in game_ids:
        try:
            game_uuid = UUID(str(gid))
        except (TypeError, ValueError):
            results["errors"].append({"id": str(gid), "error": "ID de juego no válido"})
            continue
        game = db.query(Game).filter(Game.id == game_uuid).first()
        if not game:
            results["errors"].append({"id": gid, "error": "Juego no encontrado"})
            continue
        if not game.bgg_id:
            results["errors"].append({"id": gid, "name": game.name, "error": "Sin bgg_id asignado"})
            continue
        try:
            details = bgg_service.get_game_details(game.bgg_id)
            if not details:
                results["errors"].append({"id": gid, "name": game.name, "error": "No se pudieron obtener datos de BGG"})
                continue
            old_meta = dict(game.game_metadata or {})
            updated_fields = []

            def assign(field, value):
                current = getattr(game, field)
                if value is None or value == "":
                    return
                if only_empty and current not in {None, "", 0}:
                    return
                if current != value:
                    setattr(game, field, value)
                    updated_fields.append(field)

            assign("image_url", details["image_url"])
            if not old_meta.get("description_reviewed"):
                assign("description", details["description"][:2000] if details["description"] else None)
            assign("min_players", details["min_players"])
            assign("max_players", details["max_players"])
            assign("playing_time", details["playing_time"])
            assign("min_age", details["min_age"])
            assign("complexity_rating", details["complexity_rating"])
            merged_meta = dict(old_meta)
            incoming_meta = {
                "bgg_id": details["bgg_id"],
                "thumbnail_url": details["thumbnail_url"],
                "categories": details["categories"],
                "mechanics": details["mechanics"],
                "designers": details["designers"],
                "publishers": details["publishers"],
                "year_published": details["year_published"],
                "average_rating": details["average_rating"],
                "bgg_url": details["bgg_url"],
            }
            if only_empty:
                for key, value in incoming_meta.items():
                    if key not in merged_meta or merged_meta[key] in (None, "", 0, []):
                        merged_meta[key] = value
            else:
                merged_meta.update(incoming_meta)
            game.game_metadata = merged_meta
            db.commit()
            results["success"].append({
                "id": gid,
                "name": game.name,
                "bgg_id": game.bgg_id,
                "updated_fields": updated_fields,
            })
        except Exception as e:
            db.rollback()
            results["errors"].append({"id": gid, "name": game.name, "error": str(e)})

    log_action(db, user, "BGG_SYNC_SELECTED", "Game", None,
               f"Synced {len(results['success'])} games, {len(results['errors'])} errors", {"only_empty": only_empty})

    return results


@router.post("/{game_id}/translate-description", response_model=dict)
def translate_description(
    game_id: str,
    db: Session = Depends(deps.get_db),
    user: User = Depends(deps.require_role("admin", "facilitador")),
):
    """Translate a game's description to Spanish using AI."""
    from app.services.ai.factory import get_provider

    game = db.query(Game).filter(Game.id == game_id).first()
    if not game:
        raise HTTPException(status_code=404, detail="Juego no encontrado")

    if not game.description:
        raise HTTPException(status_code=400, detail="El juego no tiene descripción")

    provider = get_provider()
    prompt = (
        f"Traduce al español el siguiente texto de descripción de un juego de mesa. "
        f"Responde SOLO con la traducción, sin añadir nada más:\n\n{game.description}"
    )
    translated = provider.ask(prompt, system_prompt="Eres un traductor experto. Traduce siempre al español.")
    if not translated or translated.startswith("[Ollama no disponible"):
        raise HTTPException(status_code=503, detail=f"Error del proveedor AI: {translated}")

    game.description = translated[:2000]
    db.commit()
    db.refresh(game)

    log_action(db, user, "TRANSLATE_DESC", "Game", game.id, game.name, {})

    return {"id": str(game.id), "name": game.name, "description": game.description}
