import logging
from typing import Optional
from app.core.config import settings
from .base import AIProvider

logger = logging.getLogger(__name__)

_PROVIDER_CACHE: Optional[AIProvider] = None


def get_provider() -> AIProvider:
    """
    Factory: returns the configured AI provider.
    Cache the instance so config is read once per app lifetime.
    """
    global _PROVIDER_CACHE
    if _PROVIDER_CACHE is not None:
        return _PROVIDER_CACHE

    from .ollama import OllamaProvider
    _PROVIDER_CACHE = OllamaProvider()
    logger.info(f"AI provider: Ollama ({_PROVIDER_CACHE.model})")

    return _PROVIDER_CACHE


def reset_provider():
    """Force factory to re-read config on next call. Useful for tests or runtime config change."""
    global _PROVIDER_CACHE
    _PROVIDER_CACHE = None
