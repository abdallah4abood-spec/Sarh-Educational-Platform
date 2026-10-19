"""Endpoint 4 — parent-portal assistant (Agent.md §5: AI Parent Chatbot).

Answers the questions a Gaza parent actually asks about the platform and the
child's day — morning timings, activities, fees, attendance, pickup and
privacy — from a small curated knowledge base.

Two deliberate design choices:

1. **Grounded before generative.** Every knowledge-base answer is a fixed
   string that states only what the platform really does (no meals are served,
   the morning starts between 7:00 and 8:00, receipts are verified by the
   finance team). A model is asked to *rephrase* that context, never to invent
   a policy, and it is told to defer to support when the question is outside it.
2. **Works with no key at all.** When no provider is configured — or the call
   fails — the matched knowledge-base answer is returned verbatim, so the
   assistant keeps answering on Gaza's constrained connections.
"""

from __future__ import annotations

import json
import re
from datetime import datetime, timezone

from fastapi import APIRouter

from llm import complete
from schemas import ChatReply, ChatRequest

router = APIRouter(prefix="/api/ai", tags=["chat"])

SYSTEM = (
    "أنت مساعد منصة صَرْح التعليمية لأولياء الأمور في قطاع غزة. "
    "أجب بالاعتماد على «معلومات المنصة» المرفقة فقط، وبالعربية الفصحى البسيطة، "
    "بجملة إلى ثلاث جمل، دون وعود ودون اختراع سياسات. "
    "إذا لم تجد الجواب في المعلومات المرفَقة فاعتذر بلطف وأرشد ولي الأمر إلى "
    "صفحة «تواصل معنا» أو رقم الدعم. "
    'أعد JSON فقط بالشكل: {"reply": "نص الجواب", "suggestions": ["سؤال متابعة", "سؤال متابعة"]}'
)


# --------------------------------------------------------------------------- #
# Knowledge base — the only source of policy truth in this endpoint.
# --------------------------------------------------------------------------- #
KNOWLEDGE_BASE: list[dict[str, object]] = [
    {
        "id": "schedule",
        "keywords": [
            "موعد", "مواعيد", "دوام", "تبدا", "تبدأ", "الساعه", "الساعة", "توقيت",
            "صباح", "تنتهي", "الجدول", "ساعه", "ساعات",
            "time", "times", "schedule", "start", "opens", "morning", "hours",
        ],
        "answer": {
            "ar": (
                "الدوام الصباحي في رياض الأطفال والمراكز يبدأ عادة بين السابعة "
                "والثامنة صباحاً، ويحدّد كل مركز موعده الدقيق ونهاية دوامه حسب "
                "برنامجه اليومي. تجد المواعيد المعلنة لكل مركز في صفحته ضمن "
                "«استكشف المراكز»، ويمكنك أيضاً سؤال المعلمة مباشرة عبر بوابة الأهالي."
            ),
            "en": (
                "The morning usually starts between 7:00 and 8:00 AM; each center "
                "sets its exact start and finishing time according to its own daily "
                "programme. The published timings appear on each center's page under "
                "\"Explore centers\", and you can always ask the teacher directly "
                "through the parent portal."
            ),
        },
    },
    {
        "id": "activities",
        "keywords": [
            "نشاط", "انشطه", "أنشطة", "انشطة", "يلعب", "لعب", "برنامج", "فعاليات",
            "وجبه", "وجبات", "طعام", "فطور", "غداء", "اكل", "أكل",
            "activity", "activities", "programme", "program", "play", "meal", "meals", "food", "breakfast",
        ],
        "answer": {
            "ar": (
                "يوم الطفل في المركز تعليمي وترفيهي: حلقات قراءة وحروف، أنشطة "
                "فنية وحركية، وقت لعب منظّم ومهارات اجتماعية. المراكز في غزة لا "
                "تقدّم وجبات، ويقتصر اليوم على الأنشطة والبرنامج التربوي."
            ),
            "en": (
                "A child's day is educational and recreational: reading and letter "
                "circles, art and movement activities, structured play and social "
                "skills. Centers in Gaza do not serve meals — the day is made up of "
                "activities and the educational programme."
            ),
        },
    },
    {
        "id": "fees",
        "keywords": [
            "رسوم", "سعر", "اسعار", "أسعار", "تكلفه", "تكلفة", "دفع", "ادفع",
            "ايصال", "إيصال", "جوال", "تحويل", "بنك", "فاتوره", "فاتورة", "فلوس",
            "fee", "fees", "price", "cost", "pay", "payment", "receipt", "bank", "jawwal",
        ],
        "answer": {
            "ar": (
                "الرسوم يحدّدها كل مركز وتظهر بوضوح في صفحته قبل الحجز. الدفع "
                "حالياً بتحويل بنكي أو عبر جوال باي، وترفع صورة الإيصال في المنصة "
                "ثم يدقّقها فريق المالية ويعتمد الدفعة."
            ),
            "en": (
                "Fees are set by each center and shown clearly on its page before you "
                "book. Payment is currently by bank transfer or Jawwal Pay: you upload "
                "the receipt image in the platform and the finance team verifies and "
                "approves it."
            ),
        },
    },
    {
        "id": "attendance",
        "keywords": [
            "حضور", "حاضر", "غياب", "غايب", "غائب", "تسجيل", "وصل", "شبكه", "شبكة",
            "انترنت", "إنترنت", "بدون اتصال", "مزامنه", "مزامنة",
            "attendance", "present", "absent", "offline", "network", "sync", "internet",
        ],
        "answer": {
            "ar": (
                "تسجّل المعلمة الحضور من جهازها، ويصل لولي الأمر مع وقت الوصول "
                "ومسؤول الاستلام في التغذية اليومية. السجل يعمل حتى بدون إنترنت: "
                "يُحفظ على الجهاز أولاً ثم يُزامن تلقائياً عند عودة الشبكة."
            ),
            "en": (
                "The teacher records attendance on her device, and it reaches the "
                "parent with the arrival time and the pickup person in the daily feed. "
                "The record works offline too: it is saved on the device first and "
                "syncs automatically when the network returns."
            ),
        },
    },
    {
        "id": "pickup",
        "keywords": [
            "استلام", "يسلم", "تسليم", "أخذ", "اخذ", "مسؤول", "مصرح", "مصرّح",
            "pickup", "collect", "authorised", "authorized", "guardian",
        ],
        "answer": {
            "ar": (
                "يُسلَّم الطفل لشخص مصرّح به وموثّق في حساب ولي الأمر، ويظهر اسمه "
                "وموقعه من الطفل في تغذية اليوم. لتغيير الأشخاص المصرّح لهم حدّث "
                "بيانات الحساب أو راسل المركز."
            ),
            "en": (
                "A child is handed over to an authorised person verified in the "
                "parent's account, and that name appears in the day's feed. To change "
                "who is authorised, update your account details or message the center."
            ),
        },
    },
    {
        "id": "progress",
        "keywords": [
            "متابعه", "متابعة", "تقدم", "تقرير", "تقارير", "صور", "ملخص", "علامات",
            "واجبات", "درجات", "اداء", "أداء",
            "progress", "report", "reports", "photos", "summary", "grades", "homework",
        ],
        "answer": {
            "ar": (
                "تجد في بوابة الأهالي تغذية يومية بالصور، برنامج اليوم والأنشطة، "
                "ملاحظة مكتوبة من المعلمة وملخصاً ذكياً واضحاً، إضافة إلى الواجبات "
                "والعلامات في مراكز التحضير والتوجيهي — ويمكنك تصفح الأيام السابقة."
            ),
            "en": (
                "The parent portal shows a daily feed with photos, the day's programme "
                "and activities, a written note from the teacher and a clear AI "
                "summary, plus homework and grades for prep and Tawjihi centers — and "
                "you can browse previous days."
            ),
        },
    },
    {
        "id": "privacy",
        "keywords": [
            "خصوصيه", "خصوصية", "بيانات", "صور طفلي", "امان", "أمان", "حمايه", "حماية",
            "privacy", "data", "security", "safe", "protection",
        ],
        "answer": {
            "ar": (
                "سجلات الحضور والصور لا يراها إلا ولي الأمر والمركز المسؤول عن "
                "الطفل، ولا تُستخدم البيانات لأي إعلانات ولا تُباع لطرف ثالث، "
                "ويمكن لولي الأمر طلب حذف سجلات طفله في أي وقت."
            ),
            "en": (
                "Attendance records and photos are visible only to the parent and the "
                "responsible center. Data is never used for advertising and never sold "
                "to third parties, and a parent can request deletion of their child's "
                "records at any time."
            ),
        },
    },
    {
        "id": "search",
        "keywords": [
            "مركز", "مراكز", "روضه", "روضة", "روضات", "بحث", "ابحث", "قريب", "منطقه",
            "منطقة", "تقييم", "تسجيل", "حجز", "مقعد", "كيف اسجل",
            "center", "centers", "kindergarten", "search", "find", "near", "area",
            "rating", "book", "booking", "register", "enrol", "enroll",
        ],
        "answer": {
            "ar": (
                "من صفحة «استكشف المراكز» تصفّي المراكز حسب المنطقة والمرحلة والسعر "
                "والتقييم، تقرأ تفاصيل البرامج والرسوم، ثم ترسل طلب حجز مع إيصال "
                "الدفع ويتواصل معك المركز للتأكيد."
            ),
            "en": (
                "On \"Explore centers\" you can filter by area, stage, price and "
                "rating, read each programme's details and fees, then send a booking "
                "request with the payment receipt — the center contacts you to confirm."
            ),
        },
    },
    {
        "id": "courses",
        "keywords": [
            "دوره", "دورة", "دورات", "تعلم", "شهاده", "شهادة", "كورس", "كورسات",
            "course", "courses", "learn", "certificate", "training",
        ],
        "answer": {
            "ar": (
                "إلى جانب المراكز، تضم منصة صَرْح دليل دورات معتمدة في البرمجة "
                "والتصميم واللغات وإدارة الأعمال، مع تفاصيل المدرب والتقييم وعدد "
                "الدروس والساعات — تجدها في صفحة «الدورات»."
            ),
            "en": (
                "Alongside the centers, SARH carries an accredited course directory in "
                "programming, design, languages and business administration — with the "
                "instructor, rating, lesson count and hours — under \"Courses\"."
            ),
        },
    },
    {
        "id": "contact",
        "keywords": [
            "تواصل", "دعم", "واتساب", "هاتف", "رقم", "بريد", "شكوى", "استفسار",
            "contact", "support", "whatsapp", "phone", "email", "help", "complaint",
        ],
        "answer": {
            "ar": (
                "يمكنك مراسلة فريق صَرْح من صفحة «تواصل معنا» أو عبر الواتساب "
                "والبريد الإلكتروني المعروضين في تذييل الموقع، وسنجيبك في أقرب وقت."
            ),
            "en": (
                "You can reach the SARH team from the \"Contact us\" page or through "
                "the WhatsApp number and email listed in the site footer, and we will "
                "answer as soon as possible."
            ),
        },
    },
]

# A curated follow-up question per topic, so the chips under an answer are
# real questions a parent would ask next rather than truncated sentences.
SUGGESTED_QUESTIONS: dict[str, dict[str, str]] = {
    "schedule": {
        "ar": "ما هي الأنشطة اليومية داخل المركز؟",
        "en": "What does the daily programme include?",
    },
    "activities": {
        "ar": "كيف أتابع حضور طفلي يوماً بيوم؟",
        "en": "How do I follow my child's attendance day by day?",
    },
    "fees": {
        "ar": "كيف أدفع الرسوم وأرفع الإيصال؟",
        "en": "How do I pay the fees and upload the receipt?",
    },
    "attendance": {
        "ar": "هل يعمل تسجيل الحضور بدون إنترنت؟",
        "en": "Does attendance work without internet?",
    },
    "pickup": {
        "ar": "من المسؤول عن استلام طفلي من المركز؟",
        "en": "Who is authorised to pick up my child?",
    },
    "progress": {
        "ar": "ما الذي يصلني عن تقدم طفلي؟",
        "en": "What do I receive about my child's progress?",
    },
    "privacy": {
        "ar": "من يمكنه رؤية صور وسجلات طفلي؟",
        "en": "Who can see my child's photos and records?",
    },
    "search": {
        "ar": "كيف أبحث عن مركز قريب من منطقتي؟",
        "en": "How do I find a center near my area?",
    },
    "courses": {
        "ar": "ما الدورات المتاحة على المنصة؟",
        "en": "What courses are available on the platform?",
    },
    "contact": {
        "ar": "كيف أتواصل مع فريق صَرْح؟",
        "en": "How do I reach the SARH team?",
    },
}

# Arabic normalisation: strip diacritics/tatweel and unify the letter forms so a
# typed "اوضه؟" or "وجبات" still matches its keyword list.
_DIACRITICS = re.compile(r"[\u0617-\u061A\u064B-\u0652\u0670\u0640]")
_PUNCTUATION = re.compile(r"[^\w\s\u0600-\u06FF]+")


def _normalise(text: str) -> str:
    cleaned = _DIACRITICS.sub("", text).strip().lower()
    cleaned = (
        cleaned.replace("أ", "ا")
        .replace("إ", "ا")
        .replace("آ", "ا")
        .replace("ى", "ي")
        .replace("ة", "ه")
        .replace("ؤ", "و")
        .replace("ئ", "ي")
    )
    return _PUNCTUATION.sub(" ", cleaned)


def _match(message: str) -> dict[str, object] | None:
    """Keyword match against the knowledge base, weighted by hit count."""
    needle = _normalise(message)
    best: tuple[int, dict[str, object]] | None = None

    for entry in KNOWLEDGE_BASE:
        hits = sum(
            1 for keyword in entry["keywords"] if _normalise(str(keyword)) in needle
        )
        if hits and (best is None or hits > best[0]):
            best = (hits, entry)

    return best[1] if best else None


def _suggestions(found: dict[str, object] | None, language: str) -> list[str]:
    """Two follow-up questions from *other* topics — never the current one."""
    picked: list[str] = []
    for entry in KNOWLEDGE_BASE:
        topic = str(entry["id"])
        if found is not None and topic == str(found["id"]):
            continue
        question = SUGGESTED_QUESTIONS.get(topic)
        if question:
            picked.append(question[language])
        if len(picked) == 2:
            break
    return picked


def _fallback(language: str) -> str:
    if language == "en":
        return (
            "I could not find this in the platform's information. The SARH team can "
            "help directly from the \"Contact us\" page or the WhatsApp number and "
            "email in the site footer."
        )
    return (
        "لم أجد هذا في معلومات المنصة. يمكن لفريق صَرْح مساعدتك مباشرة من صفحة "
        "«تواصل معنا» أو عبر رقم الواتساب والبريد الإلكتروني في تذييل الموقع."
    )


@router.post("/chat", response_model=ChatReply)
async def chat(request: ChatRequest) -> ChatReply:
    """Answer a parent's question from the knowledge base, rephrased by the LLM."""
    language = request.language
    found = _match(request.message)

    if found is None:
        # Nothing matched: still send the model a context-free, cautious prompt so
        # it can answer small talk, but never let it invent a policy.
        reply = _fallback(language)
        source = "fallback"
        provider = "local"
        suggestions = _suggestions(None, language)

        answer = await complete(
            SYSTEM,
            f"سؤال ولي الأمر: {request.message}\n\n"
            "لا توجد معلومات مطابقة في قاعدة المعرفة، فلا تخترع سياسة جديدة: "
            "أرشد ولي الأمر إلى التواصل مع الدعم.",
            temperature=0.3,
            max_tokens=300,
        )
        if answer:
            parsed = _parse(answer)
            if parsed:
                reply, suggestions = parsed
                source = "llm"
                provider = "remote"

        return ChatReply(
            reply=reply,
            suggestions=suggestions[:3],
            source=source,
            language=language,
            provider=provider,
            matchedTopic=None,
            generatedAt=datetime.now(timezone.utc),
        )

    answer_text = found["answer"]
    assert isinstance(answer_text, dict)  # noqa: S101 - shape is fixed above
    context = str(answer_text[language])
    grounded_reply = context
    suggestions = _suggestions(found, language)
    source = "knowledge_base"
    provider = "local"

    student_line = (
        f"\nاسم الطفل في الحساب: {request.studentName}" if request.studentName else ""
    )
    prompt = (
        f"سؤال ولي الأمر: {request.message}{student_line}\n\n"
        f"معلومات المنصة: {context}\n\n"
        "أعد صياغة الجواب بالاعتماد على هذه المعلومات وحدها، وأضف سؤالَي متابعة قصيرين."
    )

    answer = await complete(SYSTEM, prompt, temperature=0.4, max_tokens=500)
    if answer:
        parsed = _parse(answer)
        if parsed:
            grounded_reply, suggestions = parsed
            source = "llm"
            provider = "remote"

    return ChatReply(
        reply=grounded_reply,
        suggestions=suggestions[:3],
        source=source,
        language=language,
        provider=provider,
        matchedTopic=str(found["id"]),
        generatedAt=datetime.now(timezone.utc),
    )


def _parse(answer: str) -> tuple[str, list[str]] | None:
    """Read `{reply, suggestions}` out of a model answer, tolerating prose."""
    try:
        data = json.loads(answer)
    except (json.JSONDecodeError, TypeError):
        return None

    if not isinstance(data, dict):
        return None

    reply = str(data.get("reply", "")).strip()
    if not reply:
        return None

    raw = data.get("suggestions")
    points = raw if isinstance(raw, list) else []
    suggestions = [str(point).strip() for point in points if str(point).strip()]
    return reply, suggestions
