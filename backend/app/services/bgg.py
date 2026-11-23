import requests
import xml.etree.ElementTree as ET
import time
import logging
from typing import Optional
from app.core.config import settings

logger = logging.getLogger(__name__)

BGG_BASE = "https://boardgamegeek.com/xmlapi2"
BGG_THING_BASE = "https://boardgamegeek.com/boardgame"
USER_AGENT = "Ludisist/1.0 (gestion-cafe-juegos; +https://github.com/ludisist)"


def _get_auth_headers() -> dict:
    """Build auth headers. Requires registering at https://boardgamegeek.com/applications"""
    headers = {"User-Agent": USER_AGENT}
    if settings.BGG_API_TOKEN:
        headers["Authorization"] = f"Bearer {settings.BGG_API_TOKEN}"
    return headers


def _bgg_get(endpoint: str, params: dict = None, retries: int = 3) -> Optional[ET.Element]:
    """Make a request to BGG XML API2 with retry logic."""
    headers = _get_auth_headers()
    url = f"{BGG_BASE}/{endpoint}"

    for attempt in range(retries):
        try:
            resp = requests.get(url, params=params, headers=headers, timeout=15)

            if resp.status_code == 202:
                logger.info(f"BGG returned 202 (processing), retrying in 2s (attempt {attempt+1})")
                time.sleep(2)
                continue

            if resp.status_code == 401:
                logger.error(
                    "BGG returned 401 Unauthorized. "
                    "Register at https://boardgamegeek.com/applications "
                    "and set BGG_API_TOKEN in .env"
                )
                return None

            if resp.status_code != 200:
                logger.warning(f"BGG returned {resp.status_code} for {url}")
                if attempt < retries - 1:
                    time.sleep(1)
                    continue
                return None

            return ET.fromstring(resp.content)

        except requests.RequestException as e:
            logger.error(f"BGG request failed: {e}")
            if attempt < retries - 1:
                time.sleep(2)
                continue
            return None

    return None


def _parse_attr(elem: ET.Element, xpath: str, attr: str, default=None):
    """Safely extract an attribute from XML element."""
    found = elem.find(xpath)
    if found is not None:
        return found.get(attr, default)
    return default


def search_games(query: str, exact: bool = False) -> list[dict]:
    """Search BGG for games matching query."""
    params = {"query": query, "type": "boardgame"}
    if exact:
        params["exact"] = "1"

    root = _bgg_get("search", params)
    if root is None:
        return []

    results = []
    for item in root.findall("item"):
        name_el = item.find("name[@type='primary']")
        if name_el is None: name_el = item.find("name")
        year_el = item.find("yearpublished")

        results.append({
            "bgg_id": int(item.get("id")),
            "name": name_el.get("value") if name_el is not None else "Sin nombre",
            "year": int(year_el.get("value")) if year_el is not None else None,
        })

    return results


def get_game_details(bgg_id: int) -> Optional[dict]:
    """Fetch full details for a BGG game by ID."""
    root = _bgg_get("thing", {"id": bgg_id, "stats": "1"})
    if root is None:
        return None

    item = root.find("item")
    if item is None:
        return None

    name_el = item.find("name[@type='primary']")
    desc_el = item.find("description")
    image_el = item.find("image")
    thumbnail_el = item.find("thumbnail")

    min_players = _parse_attr(item, "minplayers", "value", 1)
    max_players = _parse_attr(item, "maxplayers", "value", 10)
    playing_time = _parse_attr(item, "playingtime", "value", 0)
    min_age = _parse_attr(item, "minage", "value")
    year = _parse_attr(item, "yearpublished", "value")

    complexity_el = item.find("statistics/ratings/averageweight")
    complexity = float(complexity_el.get("value")) if complexity_el is not None else None

    rating_el = item.find("statistics/ratings/average")
    avg_rating = float(rating_el.get("value")) if rating_el is not None else None

    categories = []
    for cat in item.findall("link[@type='boardgamecategory']"):
        categories.append(cat.get("value"))

    mechanics = []
    for mech in item.findall("link[@type='boardgamemechanic']"):
        mechanics.append(mech.get("value"))

    designers = []
    for des in item.findall("link[@type='boardgamedesigner']"):
        designers.append(des.get("value"))

    publishers = []
    for pub in item.findall("link[@type='boardgamepublisher']"):
        publishers.append(pub.get("value"))

    description = ""
    if desc_el is not None and desc_el.text:
        description = desc_el.text.strip()

    return {
        "bgg_id": bgg_id,
        "name": name_el.get("value") if name_el is not None else "Sin nombre",
        "description": description,
        "image_url": image_el.text.strip() if image_el is not None and image_el.text else None,
        "thumbnail_url": thumbnail_el.text.strip() if thumbnail_el is not None and thumbnail_el.text else None,
        "min_players": int(min_players) if min_players else 1,
        "max_players": int(max_players) if max_players else 10,
        "playing_time": int(playing_time) if playing_time else 0,
        "min_age": int(min_age) if min_age else None,
        "year_published": int(year) if year else None,
        "complexity_rating": complexity,
        "average_rating": avg_rating,
        "categories": categories,
        "mechanics": mechanics,
        "designers": designers,
        "publishers": publishers,
        "bgg_url": f"{BGG_THING_BASE}/{bgg_id}",
    }


def search_and_pick_first(query: str) -> Optional[dict]:
    """Search BGG and return the first result's full details."""
    results = search_games(query)
    if not results:
        return None
    return get_game_details(results[0]["bgg_id"])
