"""Pydantic contracts for the SARH (صَرْح) AI microservice endpoints.

Arabic is the default language of every human-facing string (Agent.md §8),
while request fields stay machine-friendly so the Next.js client can post
JSON directly.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal, Optional

from pydantic import BaseModel, Field, field_validator

QuestionType = Literal["multiple_choice", "true_false", "short_answer"]
Difficulty = Literal["easy", "medium", "hard"]
AgeTier = Literal["kindergarten", "center"]

# Arabic ⇄ English difficulty aliases accepted from the UI.
DIFFICULTY_ALIASES: dict[str, Difficulty] = {
    "سهل": "easy",
    "easy": "easy",
    "متوسط": "medium",
    "medium": "medium",
    "صعب": "hard",
    "hard": "hard",
}


def normalise_difficulty(raw: str) -> Difficulty:
    return DIFFICULTY_ALIASES.get(raw.strip().lower(), "medium")


# --------------------------------------------------------------------------- #
# Quiz generation
# --------------------------------------------------------------------------- #
class GenerateQuizRequest(BaseModel):
    subject: str = Field(..., min_length=1, description="اسم المادة")
    lesson: str = Field(..., min_length=1, description="اسم الدرس")
    difficulty: str = Field(default="متوسط", description="سهل / متوسط / صعب")
    questionCount: int = Field(default=5, ge=1, le=20)
    gradeLevel: Optional[str] = Field(default=None, description="الصف الدراسي")
    language: Literal["ar", "en"] = "ar"

    @field_validator("subject", "lesson")
    @classmethod
    def _strip(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("لا يمكن أن يكون الحقل فارغاً")
        return cleaned


class QuizQuestion(BaseModel):
    id: int
    type: QuestionType
    question: str
    options: list[str] = Field(default_factory=list)
    correctIndex: Optional[int] = None
    answer: Optional[str] = None
    explanation: Optional[str] = None
    points: int = 1


class QuizResult(BaseModel):
    subject: str
    lesson: str
    difficulty: Difficulty
    questionCount: int
    language: str = "ar"
    questions: list[QuizQuestion]
    provider: str
    generatedAt: datetime


# --------------------------------------------------------------------------- #
# Receipt OCR
# --------------------------------------------------------------------------- #
class ReceiptOCRResult(BaseModel):
    status: Literal["ok", "no_engine", "unreadable"]
    engine: str
    ocrText: str = ""
    amount: Optional[float] = None
    currency: Optional[str] = None
    transactionId: Optional[str] = None
    payerName: Optional[str] = None
    date: Optional[str] = None
    provider: Optional[str] = None
    confidence: float = 0.0
    fields: dict[str, Any] = Field(default_factory=dict)
    message: Optional[str] = None
    generatedAt: datetime


# --------------------------------------------------------------------------- #
# Daily log summarisation
# --------------------------------------------------------------------------- #
class SummarizeLogRequest(BaseModel):
    studentName: str = Field(..., min_length=1, description="اسم الطالب")
    institutionName: Optional[str] = None
    date: Optional[str] = None
    ageTier: AgeTier = "kindergarten"
    attendance: bool = True
    dayPlan: Optional[str] = None
    activities: list[str] = Field(default_factory=list)
    teacherNotes: str = Field(default="", description="ملاحظات المعلمة اليومية")
    gradeLevel: Optional[str] = None
    language: Literal["ar", "en"] = "ar"

    @field_validator("studentName")
    @classmethod
    def _strip_name(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("اسم الطالب مطلوب")
        return cleaned


class DailyLogSummary(BaseModel):
    summary: str
    highlights: list[str] = Field(default_factory=list)
    tone: str = "warm"
    language: str = "ar"
    ageTier: AgeTier = "kindergarten"
    provider: str
    generatedAt: datetime


# --------------------------------------------------------------------------- #
# Parent-portal assistant
# --------------------------------------------------------------------------- #
class ChatTurn(BaseModel):
    """One earlier message, so a follow-up question keeps its context."""

    role: Literal["user", "assistant"]
    text: str = Field(..., min_length=1, max_length=1000)


class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=600, description="سؤال ولي الأمر")
    language: Literal["ar", "en"] = "ar"
    history: list[ChatTurn] = Field(default_factory=list, max_length=8)
    studentName: Optional[str] = Field(default=None, description="اسم الطفل في الحساب")

    @field_validator("message")
    @classmethod
    def _strip_message(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("لا يمكن أن يكون السؤال فارغاً")
        return cleaned


class ChatReply(BaseModel):
    reply: str
    suggestions: list[str] = Field(default_factory=list)
    source: Literal["knowledge_base", "llm", "fallback"] = "knowledge_base"
    language: str = "ar"
    provider: str
    matchedTopic: Optional[str] = None
    generatedAt: datetime


class HealthResult(BaseModel):
    status: Literal["ok"]
    service: str = "sarh-ai-service"
    version: str = "1.0.0"
    provider: str
    endpoints: list[str]
