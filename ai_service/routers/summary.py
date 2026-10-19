"""Endpoint 3 — daily-log summarisation for parents (Agent.md Phase 3).

Turns raw teacher notes into a warm, plain-Arabic paragraph a parent can read
in seconds (Design.md Prompt 3 — the AI Daily Summary card).
"""

from __future__ import annotations

import json
from datetime import datetime, timezone

from fastapi import APIRouter

from llm import complete
from schemas import DailyLogSummary, SummarizeLogRequest

router = APIRouter(prefix="/api/ai", tags=["summary"])

_SYSTEM = (
    "أنت معلّمة روضة طفولة مبكرة ومرشدة تربوية ودّية، في مركز تعليمي بقطاع غزة "
    "لا يقدّم وجبات ويقتصر يومه على الأنشطة التربوية والترفيهية. اكتب للأهل بلغة عربية "
    "فصحى بسيطة ودافئة، جملة قصيرة مفيدة، بلا مبالغة وبلا مصطلحات معقّدة. "
    "أعد JSON فقط يحوي المفاتيح: summary (نص واحد) و highlights (مصفوفة 3 جمل قصيرة)."
)

_USER_TEMPLATE = """لخّص يوم الطالب التالي لوليّ الأمر:
- الاسم: {name}
{institution_line}{date_line}{grade_line}- المرحلة: {tier}
- الحضور: {attendance}
- برنامج اليوم: {day_plan}
- الأنشطة: {activities}
- ملاحظات المعلمة: {notes}
اجعل النص من 60 إلى 110 كلمة، وابدأ بتحية دافئة، واذكر تقدّماً واحداً على الأقل."""

_KINDERGARTEN_TAILS = [
    "وسيشارككم ما تعلّمه بلحظات يحملها بابتسامة.",
    "ونأمل أن يكمل فضوله وابتسامته غداً أيضاً.",
    "وراجعوا معه ما أحبوه من أنشطة اليوم.",
]

_CENTER_TAILS = [
    "ويمكنكم مساعدة على مراجعة ما فاتّضح أنه يحتاج تعزيزاً.",
    "وننصح بتخصيص وقت قصير لمناقشة ما تعلّمه اليوم.",
    "وراجعوا معه بنود الواجبات قبل نهاية اليوم.",
]


def _local_summary(request: SummarizeLogRequest) -> tuple[str, list[str]]:
    """Deterministic, warm Arabic summary — no network required."""
    activities = [a.strip() for a in request.activities if a.strip()]
    notes = request.teacherNotes.strip()
    name = request.studentName

    if not request.attendance:
        summary = (
            f"أهلاً بكم، نودّ إعلامكم أن {name} لم يحضر اليوم، "
            "وسيبقى المكان محفوظاً له وسنستأنف معه البرنامج في اليوم القادم. "
            "إن كان لديكم أي استفسار فلا تترددوا بالتواصل معنا."
        )
        highlights = [
            "الغياب مسجّل ويُحسب ضمن السجل اليومي",
            "البرنامج الدراسي مستمر كالمعتاد",
            "بانتظار استئناف الحضور غداً",
        ]
        return summary, highlights

    activity_phrase = (
        " وشارك في " + "، ".join(activities[:3]) if activities else " وشارك بفاعلية في أنشطة المجموعة"
    )
    # Centers here run an activity programme and serve no meals, so the day is
    # framed by its schedule and the activities it contained.
    plan_phrase = (
        f" والتزم ببرنامج اليوم ({request.dayPlan})." if request.dayPlan else "."
    )
    notes_phrase = (
        f" كما لاحظنا: {notes.rstrip('۔.!').strip()}." if notes else ""
    )

    tails = (
        _KINDERGARTEN_TAILS if request.ageTier == "kindergarten" else _CENTER_TAILS
    )
    tail = tails[len(name) % len(tails)]

    summary = (
        f"أهلاً بكم، كان يوم {name} موفقاً:{activity_phrase}{plan_phrase}"
        f" حضر بانتظام وساهم في جوّ المجموعة بالبهجة.{notes_phrase} {tail}"
    )

    highlights = [
        f"الحضور: {'حاضر' if request.attendance else 'غائب'} في موعده",
        ("الأنشطة: " + "، ".join(activities[:3])) if activities else "الأنشطة تمت كما خُطط لها",
        notes if notes else "لا توجد ملاحظات سلبية اليوم",
    ]
    return " ".join(summary.split()), highlights


@router.post("/summarize-log", response_model=DailyLogSummary)
async def summarize_log(request: SummarizeLogRequest) -> DailyLogSummary:
    """Generate a parent-facing daily summary from raw teacher notes."""
    provider = "local"
    summary: str | None = None
    highlights: list[str] = []

    day_plan = request.dayPlan or "غير مذكور"
    activities = "، ".join(request.activities) if request.activities else "لا يوجد"
    prompt = _USER_TEMPLATE.format(
        name=request.studentName,
        institution_line=(
            f"- المؤسسة: {request.institutionName}\n" if request.institutionName else ""
        ),
        date_line=f"- التاريخ: {request.date}\n" if request.date else "",
        grade_line=f"- الصف: {request.gradeLevel}\n" if request.gradeLevel else "",
        tier="رياض أطفال (5-7 سنوات)" if request.ageTier == "kindergarten" else "مركز تحضير وتوجيهي (8-18 سنة)",
        attendance="حاضر" if request.attendance else "غائب",
        day_plan=day_plan,
        activities=activities,
        notes=request.teacherNotes or "لا توجد",
    )

    answer = await complete(_SYSTEM, prompt, temperature=0.7, max_tokens=700)
    if answer:
        try:
            data = json.loads(answer)
            text = str(data.get("summary", "")).strip()
            points = data.get("highlights")
            if text and isinstance(points, list):
                summary = text
                highlights = [str(point) for point in points if str(point).strip()]
                provider = "openai"
        except (json.JSONDecodeError, TypeError, AttributeError):
            summary = None

    if not summary:
        summary, highlights = _local_summary(request)

    return DailyLogSummary(
        summary=summary,
        highlights=highlights[:4],
        tone="warm",
        language=request.language,
        ageTier=request.ageTier,
        provider=provider,
        generatedAt=datetime.now(timezone.utc),
    )
