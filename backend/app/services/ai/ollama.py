import logging
import requests
import json
from typing import Optional
from app.core.config import settings
from .base import AIProvider

logger = logging.getLogger(__name__)

OLLAMA_BASE_URL = "http://localhost:11434"
DEFAULT_MODEL = "gemma3:latest"
DEFAULT_GENERATION_OPTIONS = {"temperature": 0.3, "num_ctx": 2048, "num_predict": 2048}


class OllamaProvider(AIProvider):
    """AI provider using Ollama for local LLMs (Gemma, Llama, Mistral, etc.)."""

    def __init__(self):
        self.base_url = settings.OLLAMA_BASE_URL or OLLAMA_BASE_URL
        self.model = settings.AI_MODEL or DEFAULT_MODEL
        self._available = None

    @property
    def name(self) -> str:
        return f"Ollama ({self.model})"

    @property
    def generation_options(self) -> dict:
        return DEFAULT_GENERATION_OPTIONS.copy()

    def _call(self, prompt: str, system_prompt: Optional[str] = None, **kwargs) -> Optional[str]:
        try:
            payload = {
                "model": kwargs.get("model", self.model),
                "prompt": prompt,
                "stream": False,
                "options": {
                    "temperature": kwargs.get("temperature", DEFAULT_GENERATION_OPTIONS["temperature"]),
                    "num_ctx": kwargs.get("num_ctx", DEFAULT_GENERATION_OPTIONS["num_ctx"]),
                    "num_predict": kwargs.get("max_tokens", DEFAULT_GENERATION_OPTIONS["num_predict"]),
                }
            }
            if system_prompt:
                payload["system"] = system_prompt

            resp = requests.post(
                f"{self.base_url}/api/generate",
                json=payload,
                timeout=kwargs.get("timeout", 600),
            )

            if resp.status_code != 200:
                logger.warning(f"Ollama returned {resp.status_code}: {resp.text[:200]}")
                return None

            data = resp.json()
            return data.get("response", "").strip()

        except requests.ConnectionError:
            logger.error(f"Cannot connect to Ollama at {self.base_url}")
            return None
        except Exception as e:
            logger.error(f"Ollama error: {e}")
            return None

    def ask(self, prompt: str, system_prompt: Optional[str] = None, **kwargs) -> str:
        result = self._call(prompt, system_prompt, **kwargs)
        if result is None:
            return (
                f"[Ollama no disponible] Asegúrate de que Ollama esté corriendo "
                f"en {self.base_url} y que el modelo '{self.model}' esté descargado. "
                f"Comando: ollama pull {self.model}"
            )
        return result

    def process_rules(self, rules_text: str) -> str:
        prompt = (
            "Procesa el siguiente texto de reglas de juego de mesa y extrae:\n"
            "1. Un resumen en 3-5 líneas\n"
            "2. Palabras clave relevantes (separadas por coma)\n"
            "3. Secciones principales (separadas por línea)\n\n"
            f"Reglas:\n{rules_text}"
        )
        return self.ask(prompt, system_prompt="Eres un asistente especializado en juegos de mesa.")

    def health_check(self) -> bool:
        try:
            resp = requests.get(f"{self.base_url}/api/tags", timeout=5)
            self._available = resp.status_code == 200
            return self._available
        except requests.RequestException:
            self._available = False
            return False
