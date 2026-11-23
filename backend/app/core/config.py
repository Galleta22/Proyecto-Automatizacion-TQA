import os
from dotenv import load_dotenv

load_dotenv()

class Settings:
    SECRET_KEY: str = os.getenv("SECRET_KEY", "")
    ALGORITHM: str = os.getenv("ALGORITHM", "HS256")
    ACCESS_TOKEN_EXPIRE_MINUTES: int = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", 60))
    BGG_API_TOKEN: str = os.getenv("BGG_API_TOKEN", "")
    AI_PROVIDER: str = os.getenv("AI_PROVIDER", "ollama")
    AI_MODEL: str = os.getenv("AI_MODEL", "gemma4")
    OLLAMA_BASE_URL: str = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
    EMAIL_DELIVERY_MODE: str = os.getenv("EMAIL_DELIVERY_MODE", "console")
    SMTP_HOST: str = os.getenv("SMTP_HOST", "")
    SMTP_PORT: int = int(os.getenv("SMTP_PORT", 587))
    SMTP_USERNAME: str = os.getenv("SMTP_USERNAME", "")
    SMTP_PASSWORD: str = os.getenv("SMTP_PASSWORD", "")
    SMTP_FROM: str = os.getenv("SMTP_FROM", "noreply@ludisist.local")
    SMTP_USE_TLS: bool = os.getenv("SMTP_USE_TLS", "true").lower() in {"1", "true", "yes"}
    FRONTEND_URL: str = os.getenv("FRONTEND_URL", "http://127.0.0.1:3000")

settings = Settings()

if len(settings.SECRET_KEY) < 32 or settings.SECRET_KEY.lower() in {
    "supersecretkey",
    "supersecretkey_change_this_in_production",
}:
    raise RuntimeError(
        "SECRET_KEY debe configurarse con una clave aleatoria de al menos 32 caracteres."
    )
