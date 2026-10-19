"""Endpoint 1 — structured quiz / exam generation (Agent.md Phase 3)."""

from __future__ import annotations

import json
import random
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException

from llm import complete
from schemas import (
    GenerateQuizRequest,
    QuizQuestion,
    QuizResult,
    normalise_difficulty,
)

router = APIRouter(prefix="/api/ai", tags=["quiz"])

_SYSTEM = (
    "أنت معلّم فلسطيني خبير في إعداد الاختبارات لرواضي الطفولة المبكرة "
    "(5-7 سنوات) ومراكز التحضير والتوجيهي (8-18 سنة). "
    "أجب دائماً بصيغة JSON صالحة فقط، دون أي نص خارجها، باللغة العربية الفصحى "
    "المبسّطة وبنبرة ودّية مناسبة للطلاب."
)

_USER_TEMPLATE = """أنشئ اختباراً من {count} أسئلة وفق المواصفات التالية:
- المادة: {subject}
- الدرس: {lesson}
- المستوى: {difficulty}
{grade_line}
أعد JSON بهذا الشكل حصراً:
{{"questions": [
  {{"id": 1, "type": "multiple_choice", "question": "...", "options": ["...","...","...","..."], "correctIndex": 0, "answer": null, "explanation": "...", "points": 1}},
  {{"id": 2, "type": "true_false", "question": "...", "options": ["صواب","خطأ"], "correctIndex": 0, "answer": null, "explanation": "...", "points": 1}},
  {{"id": 3, "type": "short_answer", "question": "...", "options": [], "correctIndex": null, "answer": "إجابة نموذجية مختصرة", "explanation": "...", "points": 2}}
]}}
قواعد: أنواع الأسئلة {types}، اجعل correctIndex دائماً مؤشراً صحيحاً داخل options أو null لأسئلة الإجابة القصيرة."""


# --------------------------------------------------------------------------- #
# Deterministic local generator (no network required)
# --------------------------------------------------------------------------- #
_MCQ_STEMS = [
    "ما الفكرة الأساسية التي يتناولها درس «{lesson}» في مادة «{subject}»؟",
    "أيٌّ من الآتي يرتبط مباشرةً بموضوع درس «{lesson}»؟",
    "عند مراجعة درس «{lesson}»، ما التصرّف الذي يُعدّ الأنسب؟",
    "ماذا يتعلّم الطالب غالباً في نهاية درس «{lesson}» من مادة «{subject}»؟",
    "أي عبارة تصف درس «{lesson}» بدقة أكبر؟",
]

_MCQ_OPTIONS = [
    "مناقشة المفاهيم الجديدة خطوة بخطوة",
    "تجاهل التمارين التطبيقية",
    "الحفظ دون فهم أو ربط",
    "التعلّم الجماعي مع تبادل الأفكار",
    "القراءة السريعة دون مراجعة",
    "التطبيق العملي لما شُرح في الدرس",
    "الاكتفاء بالتلخيص دون تدريب",
    "البدء بالأسئلة قبل قراءة الدرس",
]

_TRUE_FALSE = [
    ("مراجعة درس «{lesson}» يومياً يُرسّخ الفهم.", True),
    ("يمكن تجاهل تمارين «{subject}» دون أثر على المستوى.", False),
    ("التعلّم النشط مع تطبيق الأفكار يُحسّن النتائج.", True),
    ("الدراسة اللحظية قبل الاختبار تكفي وحدها.", False),
    ("طرح الأسئلة عند تعذّر الفهم من ممارسات جيدة.", True),
]

_SHORT_ANSWER = [
    (
        "اكتب في سطرين أهمّ ما تعلّمته من درس «{lesson}».",
        "ملخّص موجز يلتقط الفكرة الرئيسة للدرس مع مثال واحد تطبيقي.",
    ),
    (
        "اذكر مثالاً من حياتك اليومية يوضّح فكرة «{lesson}».",
        "مثال شخصي صحيح الربط بمفهوم الدرس ومكتوب بجملة مفيدة.",
    ),
]

_EXPLANATIONS = [
    "لأن الربط بين المفهوم وتطبيقه هو مفتاح الفهم الدائم.",
    "هذا هو التصرّف الذي يبني فهماً متدرّجاً لا حفظاً عابراً.",
    "التكرار المتباعد مع التطبيق يرفع الاحتفاظ بالدرس.",
]


def _mcq(rng: random.Random, subject: str, lesson: str, index: int) -> QuizQuestion:
    stem = _MCQ_STEMS[index % len(_MCQ_STEMS)].format(subject=subject, lesson=lesson)
    correct = "مناقشة المفاهيم الجديدة خطوة بخطوة" if index % 2 == 0 else "التطبيق العملي لما شُرح في الدرس"
    pool = [option for option in _MCQ_OPTIONS if option != correct]
    distractors = rng.sample(pool, 3)
    options = distractors + [correct]
    rng.shuffle(options)
    return QuizQuestion(
        id=index,
        type="multiple_choice",
        question=stem,
        options=options,
        correctIndex=options.index(correct),
        answer=None,
        explanation=_EXPLANATIONS[index % len(_EXPLANATIONS)],
        points=1,
    )


def _true_false(
    rng: random.Random, subject: str, lesson: str, index: int
) -> QuizQuestion:
    template, is_true = _TRUE_FALSE[(index // 2) % len(_TRUE_FALSE)]
    return QuizQuestion(
        id=index,
        type="true_false",
        question=template.format(subject=subject, lesson=lesson),
        options=["صواب", "خطأ"],
        correctIndex=0 if is_true else 1,
        answer=None,
        explanation="راجع الفقرة المرتبطة في الدرس للتأكد من الإجابة.",
        points=1,
    )


def _short_answer(subject: str, lesson: str, index: int) -> QuizQuestion:
    prompt, rubric = _SHORT_ANSWER[index % len(_SHORT_ANSWER)]
    return QuizQuestion(
        id=index,
        type="short_answer",
        question=prompt.format(subject=subject, lesson=lesson),
        options=[],
        correctIndex=None,
        answer=rubric,
        explanation="يُقيَّم وفق وضوح الفكرة وسلامة اللغة.",
        points=2,
    )


def _local_quiz(request: GenerateQuizRequest) -> list[QuizQuestion]:
    """Fully offline generator: stable output for a given request payload."""
    level = normalise_difficulty(request.difficulty)
    rng = random.Random(
        f"{request.subject.lower()}|{request.lesson.lower()}|{level}|{request.questionCount}"
    )

    # A hard exam leans on application and reasoning, an easy one on recall.
    if level == "easy":
        rotation = ["mcq", "mcq", "tf", "mcq", "short"]
    elif level == "hard":
        rotation = ["mcq", "tf", "mcq", "short", "mcq"]
    else:
        rotation = ["mcq", "tf", "mcq", "mcq", "short"]

    questions: list[QuizQuestion] = []
    for offset in range(request.questionCount):
        kind = rotation[offset % len(rotation)]
        index = offset + 1
        if kind == "mcq":
            questions.append(_mcq(rng, request.subject, request.lesson, index))
        elif kind == "tf":
            questions.append(
                _true_false(rng, request.subject, request.lesson, index)
            )
        else:
            questions.append(_short_answer(request.subject, request.lesson, index))

    return questions


def _parse_llm_quiz(payload: str) -> list[QuizQuestion] | None:
    try:
        data = json.loads(payload)
        questions = data.get("questions") if isinstance(data, dict) else None
        if not isinstance(questions, list) or not questions:
            return None
        parsed = [QuizQuestion.model_validate(item) for item in questions]
    except (json.JSONDecodeError, TypeError, ValueError, KeyError):
        return None

    cleaned: list[QuizQuestion] = []
    for position, question in enumerate(parsed, start=1):
        if question.type == "multiple_choice" and question.correctIndex is not None:
            if not (0 <= question.correctIndex < len(question.options)):
                continue
        question.id = position
        cleaned.append(question)
    return cleaned or None


# --------------------------------------------------------------------------- #
# Route
# --------------------------------------------------------------------------- #
@router.post("/generate-quiz", response_model=QuizResult)
async def generate_quiz(request: GenerateQuizRequest) -> QuizResult:
    """Generate a structured quiz (اختبار تفاعلي) for the AI Teacher Studio."""
    difficulty = normalise_difficulty(request.difficulty)
    provider = "local"
    questions: list[QuizQuestion] | None = None

    grade_line = (
        f"- الصف الدراسي: {request.gradeLevel}" if request.gradeLevel else ""
    )
    prompt = _USER_TEMPLATE.format(
        count=request.questionCount,
        subject=request.subject,
        lesson=request.lesson,
        difficulty=request.difficulty,
        grade_line=grade_line,
        types="multiple_choice أو true_false أو short_answer",
    )

    answer = await complete(_SYSTEM, prompt, temperature=0.7, max_tokens=2000)
    if answer:
        questions = _parse_llm_quiz(answer)
        if questions:
            provider = "openai"

    if not questions:
        questions = _local_quiz(request)

    if len(questions) > request.questionCount:
        questions = questions[: request.questionCount]

    if not questions:
        raise HTTPException(
            status_code=500, detail="تعذّر توليد الاختبار، الرجاء المحاولة مجدداً"
        )

    return QuizResult(
        subject=request.subject,
        lesson=request.lesson,
        difficulty=difficulty,
        questionCount=len(questions),
        language=request.language,
        questions=questions,
        provider=provider,
        generatedAt=datetime.now(timezone.utc),
    )
