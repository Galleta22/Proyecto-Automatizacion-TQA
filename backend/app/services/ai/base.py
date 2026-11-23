from abc import ABC, abstractmethod
from typing import Optional


class AIProvider(ABC):
    """Abstract base class for AI providers (Ollama, etc.)."""

    @property
    @abstractmethod
    def name(self) -> str:
        """Human-readable provider name."""
        ...

    @abstractmethod
    def ask(self, prompt: str, system_prompt: Optional[str] = None, **kwargs) -> str:
        """
        Send a prompt to the AI and return the response.
        Override context with kwargs like temperature, max_tokens, etc.
        """
        ...

    @abstractmethod
    def process_rules(self, rules_text: str) -> str:
        """
        Process game rules text: summarize, extract keywords, restructure.
        Returns processed/structured text.
        """
        ...

    def health_check(self) -> bool:
        """Return True if the provider is reachable and configured."""
        return True
