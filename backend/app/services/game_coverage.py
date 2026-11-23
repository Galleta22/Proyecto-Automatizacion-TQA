from sqlalchemy import func

from app.models import Game, GameRule

MISSING_GAME_IMAGE = func.coalesce(func.trim(Game.image_url), "") == ""
PUBLISHED_QUICK_RULE = GameRule.visibility == "global"
MISSING_QUICK_RULES = ~Game.rules.any(PUBLISHED_QUICK_RULE)
