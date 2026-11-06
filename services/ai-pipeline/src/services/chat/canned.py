"""
services/chat/canned.py
───────────────────────
Deterministic messages — no model call, no cost. They are streamed as `token` events like any answer so the UI
has ONE code path. Language follows the user's script/language class where it is cheap to do so.
"""

from __future__ import annotations

from src.services.chat.token_estimator import LanguageClass, classify

NO_RESULTS = {
    LanguageClass.ENGLISH: "I couldn't find anything about that in your team's meetings. Try rephrasing, widening the "
                           "date range, or asking about a specific meeting or person.",
    LanguageClass.ROMAN_URDU: "Mujhe aap ki team ki meetings mein is bare mein kuch nahi mila. Sawal dobara likh kar, "
                              "date range barha kar, ya kisi khaas meeting ya shakhs ke bare mein pooch kar dekhein.",
    LanguageClass.URDU_SCRIPT: "مجھے آپ کی ٹیم کی میٹنگز میں اس بارے میں کچھ نہیں ملا۔ سوال دوبارہ لکھ کر یا تاریخ کی حد بڑھا کر دیکھیں۔",
}
NO_RESULTS[LanguageClass.MIXED] = NO_RESULTS[LanguageClass.ENGLISH]

EMPTY_FILTER = ("Your filters (meetings or dates) don't overlap with the period or meetings in your question, so there is "
                "nothing to search. Clear a filter or adjust the dates and try again.")
UNKNOWN_FILTER_IDS = ("None of the meetings you selected could be found, so there is nothing to search. "
                      "Clear the meeting filter and try again.")
CHITCHAT = "Hi! I can answer questions about your team's meetings, commitments and decisions. What would you like to know?"
OUT_OF_SCOPE = ("I can only help with your team's meetings, commitments and decisions. "
                "Try asking what was decided, who owns what, or what is overdue.")
SAFE_REPLACEMENT = "\n\nI can't continue with this answer. Please rephrase your question."
CONTENT_FILTERED = "That request was blocked by the AI provider's safety filter. Please rephrase it."
TRUNCATION_NOTE = "(answer shortened)"


def no_results_for(question: str) -> str:
    return NO_RESULTS[classify(question)]
