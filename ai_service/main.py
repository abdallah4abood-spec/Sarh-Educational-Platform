"""SARH (صَرْح) — Python FastAPI AI microservice (Agent.md Phase 3).

Run:
    uvicorn main:app --host 0.0.0.0 --port 8000

Endpoints:
    POST /api/ai/generate-quiz   → structured quiz JSON
    POST /api/ai/ocr-receipt     → receipt field extraction
    POST /api/ai/summarize-log   → warm parent-facing daily summary
    POST /api/ai/chat            → parent-portal assistant answer
    GET  /api/ai/health          → service status
"""

from __future__ import annotations

import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware

from config import active_provider, settings
from routers import chat, ocr, quiz, summary
from schemas import HealthResult

logging.basicConfig(
    level=logging.INFO, format="%(asctime)s | %(levelname)s | %(name)s | %(message)s"
)
log = logging.getLogger("sarh.ai")

cfg = settings()

app = FastAPI(
    title="SARH AI Microservice",
    description=(
        "خدمة الذكاء الاصطناعي لمنصة صَرْح: توليد الاختبارات، استخراج إيصالات "
        "الدفع، تلخيص السجلات اليومية لوليّ الأمر، والمساعد الذكي في بوابة الأهالي."
    ),
    version="1.0.0",
    docs_url="/docs",
    openapi_url="/openapi.json",
)

app.add_middleware(GZipMiddleware, minimum_size=1024)
app.add_middleware(
    CORSMiddleware,
    allow_origins=list(cfg["allowed_origins"]),  # type: ignore[arg-type]
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(quiz.router)
app.include_router(ocr.router)
app.include_router(summary.router)
app.include_router(chat.router)

ENDPOINTS = [
    "/api/ai/generate-quiz",
    "/api/ai/ocr-receipt",
    "/api/ai/summarize-log",
    "/api/ai/chat",
]


@app.get("/", include_in_schema=False)
def root() -> dict[str, object]:
    return {
        "service": "SARH AI Microservice",
        "docs": "/docs",
        "health": "/api/ai/health",
        "endpoints": ENDPOINTS,
    }


@app.get("/api/ai/health", response_model=HealthResult, tags=["health"])
def health() -> HealthResult:
    """Liveness probe used by the Next.js client and by docker/K8s."""
    return HealthResult(
        status="ok",
        provider=active_provider(),
        endpoints=ENDPOINTS,
    )


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "main:app",
        host=str(cfg["host"]),
        port=int(cfg["port"]),  # type: ignore[arg-type]
        reload=False,
    )
