"""Runtime configuration for the SARH (صَرْح) AI microservice.

All values are read from environment variables / `.env` so the service can
run identically in development and CI. No secret is ever required: the
service degrades to its deterministic local generators when no LLM key is
configured (offline-first by design).
"""

from __future__ import annotations

import os
from functools import lru_cache

from dotenv import load_dotenv

load_dotenv()


def _split(value: str | None) -> list[str]:
    if not value:
        return []
    return [part.strip() for part in value.split(",") if part.strip()]


@lru_cache(maxsize=1)
def settings() -> dict[str, object]:
    """Return the resolved settings dict (cached for the process lifetime)."""
    default_origins = "http://localhost:3000,http://localhost:5173,http://127.0.0.1:3000"
    return {
        "host": os.getenv("AI_SERVICE_HOST", "0.0.0.0"),
        "port": int(os.getenv("AI_SERVICE_PORT", "8000")),
        "allowed_origins": _split(os.getenv("ALLOWED_ORIGINS", default_origins)),
        "openai_api_key": os.getenv("OPENAI_API_KEY", ""),
        "openai_model": os.getenv("OPENAI_MODEL", "gpt-4o"),
        "anthropic_api_key": os.getenv("ANTHROPIC_API_KEY", ""),
        "anthropic_model": os.getenv("ANTHROPIC_MODEL", "claude-sonnet-4-5"),
        "gemini_api_key": os.getenv("GEMINI_API_KEY", ""),
        "gemini_model": os.getenv("GEMINI_MODEL", "gemini-2.0-flash"),
        "request_timeout": float(os.getenv("AI_REQUEST_TIMEOUT", "45")),
    }


def active_provider() -> str:
    """Name of the configured LLM provider, or `local` when none is set."""
    cfg = settings()
    if cfg["openai_api_key"]:
        return "openai"
    if cfg["anthropic_api_key"]:
        return "anthropic"
    if cfg["gemini_api_key"]:
        return "gemini"
    return "local"
