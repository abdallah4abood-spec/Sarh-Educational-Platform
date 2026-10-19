"""Endpoint 2 — receipt OCR / payment reconciliation (Agent.md Phase 3).

Accepts an uploaded receipt image and/or pre-extracted text and returns the
structured values the Super Admin Financial Hub compares against the database
(Amount, Transaction ID, Payer Name, Date).

Three engines are tried, in order:
  1. Vision LLM (OpenAI / Anthropic / Gemini) when an API key is configured.
  2. Local Tesseract OCR via `pytesseract` when the binary is installed.
  3. `raw_text` supplied by the caller (the client may run OCR itself).

When none is available the response is still a valid, typed payload carrying
`status="no_engine"` and an Arabic message, instead of a crash.
"""

from __future__ import annotations

import io
import json
import re
from datetime import datetime, timezone
from typing import Any, Optional

import httpx
from fastapi import APIRouter, File, Form, UploadFile

from config import settings
from schemas import ReceiptOCRResult

router = APIRouter(prefix="/api/ai", tags=["ocr"])

# --------------------------------------------------------------------------- #
# Field extraction
# --------------------------------------------------------------------------- #
_AMOUNT_PATTERNS = [
    re.compile(r"(?:المبلغ|الإجمالي|القيمة|المدفوع)\s*[:\-]?\s*([0-9][0-9.,]{0,15})", re.I),
    re.compile(r"\b(?:amount|total|paid|value)\s*[:\-]?\s*([0-9][0-9.,]{0,15})", re.I),
    re.compile(r"([0-9][0-9.,]{0,15})\s*(?:₪|NIS|ILS|شيكل|shekel)", re.I),
    re.compile(r"(?:₪|NIS|ILS)\s*([0-9][0-9.,]{0,15})", re.I),
]

_TRANSACTION_PATTERNS = [
    re.compile(r"(?:رقم العملية|رقم المرجع|رقم الحوالة|المرجع)\s*[:\-]?\s*([A-Za-z0-9\-]{6,32})", re.I),
    re.compile(r"\b(?:transaction|trans|reference|ref|trace|approval|rrn)\s*(?:id|no|#)?\s*[:#\-]?\s*([A-Za-z0-9\-]{6,32})", re.I),
    re.compile(r"\b(\d{10,24})\b"),
]

_PAYER_PATTERNS = [
    re.compile(r"(?:الدافع|اسم العميل|اسم المرسل|المشترك|الاسم)\s*[:\-]?\s*([^\n]{3,60})", re.I),
    re.compile(r"\b(?:payer|paid by|customer|from|name)\s*[:\-]?\s*([^\n]{3,60})", re.I),
]

_DATE_PATTERNS = [
    re.compile(r"\b(\d{4}-\d{2}-\d{2})\b"),
    re.compile(r"\b(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})\b"),
    re.compile(
        r"\b(\d{1,2}\s*(?:يناير|فبراير|مارس|أبريل|ابريل|مايو|يونيو|يوليو|أغسطس|اغسطس|سبتمبر|أكتوبر|اكتوبر|نوفمبر|ديسمبر)\s*\d{4})\b",
        re.I,
    ),
]

_CURRENCY_PATTERNS = [
    (re.compile(r"₪|\bNIS\b|\bILS\b|شيكل", re.I), "ILS"),
    (re.compile(r"\bUSD\b|\$", re.I), "USD"),
    (re.compile(r"\bEUR\b|€", re.I), "EUR"),
    (re.compile(r"\bJOD\b", re.I), "JOD"),
]

_PROVIDER_KEYWORDS = [
    ("جواز|jawwal|جوّال", "Jawwal Pay"),
    ("بنك|bank|transfer|حوالة", "Bank Transfer"),
    ("فيزا|visa", "Visa"),
    ("ماستركارد|mastercard", "Mastercard"),
    ("paypal|باي بال", "PayPal"),
    ("فودافون|vodafone|cash", "Mobile Wallet"),
    ("أكسيس|akicia|OMT", "OMT"),
    ("ريدني|redee|الريدني", "Redee"),
]


def _first(patterns: list[re.Pattern[str]], text: str) -> str | None:
    for pattern in patterns:
        match = pattern.search(text)
        if match:
            return match.group(1).strip().strip(",:;-")
    return None


def _clean_name(value: str | None) -> str | None:
    if not value:
        return None
    cleaned = re.sub(r"\s{2,}", " ", value).strip()
    return cleaned[:60] if len(cleaned) >= 3 else None


def extract_receipt_fields(text: str) -> dict[str, Any]:
    """Pull the reconciliation fields out of OCR'd receipt text."""
    amount_raw = _first(_AMOUNT_PATTERNS, text)
    amount: float | None = None
    if amount_raw:
        digits = re.sub(r"[^\d.]", "", amount_raw.replace(",", ""))
        if digits:
            try:
                amount = float(digits)
            except ValueError:
                amount = None

    currency: str | None = None
    for pattern, code in _CURRENCY_PATTERNS:
        if pattern.search(text):
            currency = code
            break
    if currency is None and amount is not None:
        currency = "ILS"

    provider: str | None = None
    lowered = text.lower()
    for needle, label in _PROVIDER_KEYWORDS:
        if re.search(needle, lowered):
            provider = label
            break

    fields = {
        "amount": amount,
        "currency": currency,
        "transactionId": _first(_TRANSACTION_PATTERNS, text),
        "payerName": _clean_name(_first(_PAYER_PATTERNS, text)),
        "date": _first(_DATE_PATTERNS, text),
        "provider": provider,
    }

    found = sum(1 for key in ("amount", "transactionId", "payerName", "date") if fields[key])
    fields["confidence"] = round(min(0.98, 0.35 + 0.16 * found), 2)
    fields["missing"] = [
        key
        for key in ("amount", "transactionId", "payerName", "date")
        if not fields[key]
    ]
    return fields


# --------------------------------------------------------------------------- #
# OCR engines
# --------------------------------------------------------------------------- #
def _tesseract_text(image_bytes: bytes) -> tuple[Optional[str], str | None]:
    """Return (text, engine_name) or (None, error_reason)."""
    try:
        import pytesseract
        from PIL import Image
    except Exception:  # noqa: BLE001 - optional dependency
        return None, "pytesseract_not_installed"

    try:
        image = Image.open(io.BytesIO(image_bytes))
        text = pytesseract.image_to_string(image, lang="ara+eng")
    except Exception:  # noqa: BLE001 - missing binary or unreadable image
        return None, "tesseract_unavailable"

    return (text.strip() or None), None


async def _vision_text(
    image_bytes: bytes, content_type: str
) -> tuple[Optional[str], str | None]:
    """Transcribe the receipt with a vision-capable model (GPT-4o).

    The image is sent as a proper base64 `image_url` content part. Returns
    `(None, reason)` when no vision-capable provider is configured.
    """
    import base64

    cfg = settings()
    if not cfg["openai_api_key"]:
        return None, "vision_unavailable"

    mime = content_type or "image/jpeg"
    payload = base64.b64encode(image_bytes).decode("ascii")

    async with httpx.AsyncClient(timeout=float(cfg["request_timeout"])) as client:  # type: ignore[arg-type]
        try:
            response = await client.post(
                "https://api.openai.com/v1/chat/completions",
                headers={"Authorization": f"Bearer {cfg['openai_api_key']}"},
                json={
                    "model": cfg["openai_model"],
                    "temperature": 0.0,
                    "max_tokens": 900,
                    "response_format": {"type": "json_object"},
                    "messages": [
                        {
                            "role": "system",
                            "content": (
                                "انقل نص إيصال الدفع الظاهر في الصورة حرفياً مع "
                                "الأرقام ومعرّفات العمليات، وأعد JSON فقط: "
                                "{\"text\": \"...\"}."
                            ),
                        },
                        {
                            "role": "user",
                            "content": [
                                {
                                    "type": "text",
                                    "text": "استخرج نص هذا الإيصال.",
                                },
                                {
                                    "type": "image_url",
                                    "image_url": {
                                        "url": f"data:{mime};base64,{payload}"
                                    },
                                },
                            ],
                        },
                    ],
                },
            )
            response.raise_for_status()
            content = response.json()["choices"][0]["message"]["content"]
        except Exception:  # noqa: BLE001 - fall through to the local engine
            return None, "vision_failed"

    try:
        text = str(json.loads(content).get("text", "")).strip()
        return (text or None), None
    except (json.JSONDecodeError, TypeError, AttributeError):
        return content.strip() or None, None


# --------------------------------------------------------------------------- #
# Route
# --------------------------------------------------------------------------- #
@router.post("/ocr-receipt", response_model=ReceiptOCRResult)
async def ocr_receipt(
    file: Optional[UploadFile] = File(default=None),
    raw_text: Optional[str] = Form(default=None),
) -> ReceiptOCRResult:
    """Extract amount / transaction id / payer / date from a payment receipt."""
    now = datetime.now(timezone.utc)
    image_bytes = b""
    if file is not None:
        image_bytes = await file.read()

    ocr_text = (raw_text or "").strip()
    engine = "client_text" if ocr_text else "none"

    if not ocr_text and image_bytes:
        text, error = await _vision_text(image_bytes, file.content_type if file else "")
        if text:
            ocr_text, engine = text, "vision"
        else:
            text, error = _tesseract_text(image_bytes)
            if text:
                ocr_text, engine = text, "tesseract"
            elif error:
                engine = "none"

    if not ocr_text:
        return ReceiptOCRResult(
            status="no_engine",
            engine=engine,
            message=(
                "تعذّر قراءة الصورة: ثبّت Tesseract أو أضف OPENAI_API_KEY، "
                "أو أعد الحقول عبر الحقل raw_text."
            ),
            generatedAt=now,
        )

    fields = extract_receipt_fields(ocr_text)
    if not any(fields[key] for key in ("amount", "transactionId", "payerName", "date")):
        return ReceiptOCRResult(
            status="unreadable",
            engine=engine,
            ocrText=ocr_text,
            message="لم يتم العثور على حقول دفعة واضحة في النص المستخرج.",
            generatedAt=now,
        )

    return ReceiptOCRResult(
        status="ok",
        engine=engine,
        ocrText=ocr_text,
        amount=fields["amount"],
        currency=fields["currency"],
        transactionId=fields["transactionId"],
        payerName=fields["payerName"],
        date=fields["date"],
        provider=fields["provider"],
        confidence=fields["confidence"],
        fields=fields,
        generatedAt=now,
    )
