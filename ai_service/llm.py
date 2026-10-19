"""Thin multi-provider LLM client with offline-first fallback.

Agent.md §2 allows OpenAI (GPT-4o), Anthropic Claude or Google Gemini.
`complete()` dispatches to whichever provider has an API key configured and
returns `None` when no key is present (or when the call fails), letting the
callers fall back to their deterministic local generators instead of
crashing — the service must stay useful on Gaza's constrained network.
"""

from __future__ import annotations

import logging

import httpx

from config import settings

log = logging.getLogger("sarh.llm")


async def complete(
    system: str,
    user: str,
    *,
    temperature: float = 0.6,
    max_tokens: int = 1600,
) -> str | None:
    """Return the model's text answer, or `None` when no LLM is reachable."""
    cfg = settings()
    timeout = float(cfg["request_timeout"])  # type: ignore[arg-type]

    try:
        if cfg["openai_api_key"]:
            return await _openai(cfg, system, user, temperature, max_tokens, timeout)
        if cfg["anthropic_api_key"]:
            return await _anthropic(cfg, system, user, temperature, max_tokens, timeout)
        if cfg["gemini_api_key"]:
            return _gemini(cfg, system, user, temperature, max_tokens)
    except Exception:  # noqa: BLE001 - provider failures must never 500 the API
        log.exception("LLM request failed, falling back to local generator")
        return None

    return None


async def _openai(
    cfg: dict[str, object],
    system: str,
    user: str,
    temperature: float,
    max_tokens: int,
    timeout: float,
) -> str | None:
    async with httpx.AsyncClient(timeout=timeout) as client:
        response = await client.post(
            "https://api.openai.com/v1/chat/completions",
            headers={"Authorization": f"Bearer {cfg['openai_api_key']}"},
            json={
                "model": cfg["openai_model"],
                "temperature": temperature,
                "max_tokens": max_tokens,
                "response_format": {"type": "json_object"},
                "messages": [
                    {"role": "system", "content": system},
                    {"role": "user", "content": user},
                ],
            },
        )
        response.raise_for_status()
        return response.json()["choices"][0]["message"]["content"]


async def _anthropic(
    cfg: dict[str, object],
    system: str,
    user: str,
    temperature: float,
    max_tokens: int,
    timeout: float,
) -> str | None:
    async with httpx.AsyncClient(timeout=timeout) as client:
        response = await client.post(
            "https://api.anthropic.com/v1/messages",
            headers={
                "x-api-key": str(cfg["anthropic_api_key"]),
                "anthropic-version": "2023-06-01",
            },
            json={
                "model": cfg["anthropic_model"],
                "max_tokens": max_tokens,
                "temperature": temperature,
                "system": system,
                "messages": [{"role": "user", "content": user}],
            },
        )
        response.raise_for_status()
        blocks = response.json().get("content", [])
        return "".join(block.get("text", "") for block in blocks)


def _gemini(
    cfg: dict[str, object],
    system: str,
    user: str,
    temperature: float,
    max_tokens: int,
) -> str | None:
    # Gemini's SDK is intentionally not required; call the REST API directly.
    import json
    import urllib.request

    url = (
        f"https://generativelanguage.googleapis.com/v1beta/models/"
        f"{cfg['gemini_model']}:generateContent?key={cfg['gemini_api_key']}"
    )
    payload = json.dumps(
        {
            "systemInstruction": {"parts": [{"text": system}]},
            "contents": [{"parts": [{"text": user}]}],
            "generationConfig": {
                "temperature": temperature,
                "maxOutputTokens": max_tokens,
            },
        }
    ).encode("utf-8")

    request = urllib.request.Request(
        url, data=payload, headers={"Content-Type": "application/json"}
    )
    with urllib.request.urlopen(request, timeout=30) as handle:  # noqa: S310
        body = json.loads(handle.read().decode("utf-8"))

    candidates = body.get("candidates") or []
    if not candidates:
        return None
    parts = candidates[0].get("content", {}).get("parts", [])
    return "".join(part.get("text", "") for part in parts)
