import re

import httpx
from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.config import (
    CLOUDFLARE_ACCOUNT_ID,
    CLOUDFLARE_AI_BASE_URL,
    CLOUDFLARE_AI_MAX_TOKENS,
    CLOUDFLARE_AI_MODEL,
    CLOUDFLARE_AI_TEMPERATURE,
    CLOUDFLARE_AI_TIMEOUT_SECONDS,
    CLOUDFLARE_API_TOKEN,
    GENERATION_ENABLED,
    MAX_POST_TEXT_LENGTH,
)
from app.database import get_session
from app.model_catalog import resolve_model_key
from app.models import DevicePreference, GenerationLog

router = APIRouter()

ALLOWED_TONES = [
    "simple",
    "friendly",
    "funny",
    "insightful",
    "curious",
    "relatable",
    "contrarian",
    "supportive",
    "expert",
    "visionary",
    "analytical",
    "meme",
]
MAX_PREFERENCE_LENGTH = 4000

TONE_GUIDANCE = {
    "simple": "Clear reply",
    "friendly": "Warm reply",
    "funny": "Meme energy",
    "insightful": "Smart take",
    "curious": "Ask one specific question",
    "relatable": "Shared pain",
    "contrarian": "Hot take",
    "supportive": "Encourage",
    "expert": "Authority",
    "visionary": "Big picture",
    "analytical": "Data angle",
    "meme": "Internet energy",
}

DEFAULT_USER_VOICE = (
    "positive energy, grounded and encouraging\n"
    "congratulate people when they share a win or make progress\n"
    "share small personal experiences when relevant\n"
    "show openness to connect, collaborate, or learn from each other\n"
    "keep the reply useful and human, not salesy\n"
    "occasionally add a small light joke when it fits naturally"
)

DEFAULT_VIRAL_STRATEGY = (
    "Use X-style ranking signals as inspiration for Threads replies: replies, likes, repost/share intent, profile clicks, dwell, and follow intent.\n"
    "Avoid negative signals: spammy repetition, copied wording, generic praise, rage bait, blocks, mutes, reports, and not-interested reactions.\n"
    "0 to 300 followers: earn trust and profile clicks with relatable observations, tiny personal experiences, and clear niche identity.\n"
    "300 to 1000 followers: build recognizable angles with sharper observations, useful disagreement, or concrete non-question observations.\n"
    "1000 to 5000 followers: become a concise signal source with pattern recognition, simple frameworks, or lived lessons.\n"
    "Make every reply useful to the reader with a small insight, validation, practical angle, or lived observation.\n"
    "Keep the energy positive, grounded, and constructive without sounding fake or motivational.\n"
    "Build personal branding by quietly showing values, taste, niche, and a consistent way of seeing the world.\n"
    "Every reply must be specific to the post, human, and easy to scan."
)


class GenerateRequest(BaseModel):
    postText: str
    authorName: str
    authorUsername: str
    pageUrl: str | None = None
    tone: str
    deviceId: str
    model: str | None = None
    userVoice: str | None = None
    viralStrategy: str | None = None
    useViralStrategy: bool | None = None


@router.post("/api/comments/generate")
def generate_comment(
    body: GenerateRequest,
    session: Session = Depends(get_session),
):
    if not GENERATION_ENABLED:
        return JSONResponse(status_code=503, content={"ok": False, "error": {"code": "GENERATION_DISABLED", "message": "Generation disabled"}})

    if len(body.postText) < 5 or len(body.postText) > MAX_POST_TEXT_LENGTH:
        return JSONResponse(status_code=400, content={"ok": False, "error": {"code": "INVALID_POST_TEXT", "message": f"Post text must be 5-{MAX_POST_TEXT_LENGTH} chars."}})

    if body.tone not in ALLOWED_TONES:
        return JSONResponse(status_code=400, content={"ok": False, "error": {"code": "INVALID_TONE", "message": "Unsupported tone."}})

    body.deviceId = clean_string(body.deviceId)
    if not body.deviceId:
        return JSONResponse(status_code=400, content={"ok": False, "error": {"code": "MISSING_DEVICE_ID", "message": "Device ID is required."}})

    model_key = resolve_model_key(body.model)
    if model_key is None:
        return JSONResponse(status_code=400, content={"ok": False, "error": {"code": "INVALID_MODEL", "message": "Unsupported model."}})

    save_request_preferences(session, body)
    preferences = get_effective_preferences(session, body)
    comment = _call_cloudflare_ai(body, preferences["userVoice"], preferences["viralStrategy"], model_key)

    log_entry = GenerationLog(
        device_id=body.deviceId,
        tone=body.tone,
        page_url=body.pageUrl,
        input_chars=len(body.postText),
        output_chars=len(comment),
    )
    session.add(log_entry)
    session.commit()

    return {
        "ok": True,
        "comment": comment,
    }


def save_request_preferences(session: Session, body: GenerateRequest) -> None:
    has_voice = body.userVoice is not None
    has_strategy = body.viralStrategy is not None
    has_strategy_toggle = body.useViralStrategy is not None
    if not has_voice and not has_strategy and not has_strategy_toggle:
        return

    preference = session.query(DevicePreference).filter_by(device_id=body.deviceId).one_or_none()
    if preference is None:
        preference = DevicePreference(device_id=body.deviceId)
        session.add(preference)

    if has_voice:
        preference.user_voice = clean_preference_text(body.userVoice)
    if has_strategy:
        preference.viral_strategy = clean_preference_text(body.viralStrategy)
    if has_strategy_toggle:
        preference.use_viral_strategy = bool(body.useViralStrategy)
    elif has_strategy:
        preference.use_viral_strategy = True

    session.commit()


def get_effective_preferences(session: Session, body: GenerateRequest) -> dict[str, str]:
    preference = session.query(DevicePreference).filter_by(device_id=body.deviceId).one_or_none()

    request_voice = clean_string(body.userVoice)
    request_strategy = clean_string(body.viralStrategy)

    user_voice = request_voice
    if not user_voice and preference and preference.user_voice:
        user_voice = preference.user_voice.strip()
    if not user_voice:
        user_voice = DEFAULT_USER_VOICE

    viral_strategy = request_strategy if body.useViralStrategy is not False else ""
    if body.viralStrategy is None and preference and preference.use_viral_strategy and preference.viral_strategy:
        viral_strategy = preference.viral_strategy.strip()
    elif body.viralStrategy is None and preference and not preference.use_viral_strategy:
        viral_strategy = ""
    elif not viral_strategy and body.viralStrategy is None:
        viral_strategy = DEFAULT_VIRAL_STRATEGY

    return {
        "userVoice": user_voice,
        "viralStrategy": viral_strategy,
    }


def _call_cloudflare_ai(body: GenerateRequest, user_voice: str, viral_strategy: str, model_key: str) -> str:
    system_prompt = """You are a real person replying on Threads from your phone.

LENGTH:
- 1 sentence. Sometimes 2 short ones if needed. 5-20 words total max.

STYLE:
- All lowercase. Casual, direct, slightly imperfect.
- No hashtags, markdown, bullet points, headings, or quotation marks.
- Max 1 emoji if it fits. Write in the same language as the post.

FLEXIBLE REPLY APPROACH — pick what fits the post naturally:
- React with a personal take or lived experience
- Add a quick observation or insight
- Agree/disagree with a specific reason
- Share a relatable moment
- Drop a short opinion or hot take
- For curious tone only: ask one specific follow-up question
- Validate or hype someone's win
- Make a joke or reference if it lands

QUESTION POLICY:
- Only ask a question when the selected tone is curious.
- For every other tone, do not ask a question and do not end with a question mark.
- If the selected tone is not curious, write a statement, observation, reaction, or useful angle instead.

TONE:
- Blunt, relatable, not trying to sound smart.
- Leave thoughts slightly open or unfinished.
- Never toxic, never desperate for attention.
- You MAY use internet slang naturally: lol, lmao, btw, tbh, imo, fyi, idk, ikr, nvm, smh, fr, ngl, tbf, fomo, yolo, goat, irl, tldr, gg, fwiw, lmk, afaik, rn.
- For startup/maker posts, you MAY use: mvp, saas, mrr, pmf, gtm, lfg, wip, ship, indie, solopreneur.
- Do NOT force slang. Only when natural.

BANNED:
- "that's a great point", "i completely agree", "this is such an important reminder", "in today's world", "exactly", "honestly", "definitely", "absolutely", "dive into", "love this", "so true", "thanks for sharing"
- Do not explain your strategy. Return ONLY the comment text.
- Do not include reasoning, analysis, or <think> tags."""

    strategy_section = f"\nGrowth strategy:\n{viral_strategy}\n" if viral_strategy else ""
    tone_guidance = TONE_GUIDANCE.get(body.tone, body.tone)
    question_policy = (
        "Question policy: because the tone is curious, write exactly one specific question."
        if body.tone == "curious"
        else "Question policy: do not ask a question for this tone.\nDo not end the reply with a question mark."
    )
    user_prompt = (
        f"Author: {body.authorName} ({body.authorUsername})\n"
        f"Tone: {body.tone} - {tone_guidance}\n"
        f"{question_policy}\n"
        f"Voice:\n{user_voice}\n"
        f"{strategy_section}\n"
        f"Post:\n\"\"\"\n{body.postText}\n\"\"\"\n\n"
        "Reply (pick the most natural reply type for this post, 5-20 words, lowercase):"
    )

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_prompt},
    ]
    response = httpx.post(
        _cloudflare_ai_url(model_key),
        headers={
            "Authorization": f"Bearer {CLOUDFLARE_API_TOKEN}",
        },
        json={
            "messages": messages,
            "temperature": CLOUDFLARE_AI_TEMPERATURE,
            "max_tokens": CLOUDFLARE_AI_MAX_TOKENS,
        },
        timeout=CLOUDFLARE_AI_TIMEOUT_SECONDS,
    )
    response.raise_for_status()
    payload = response.json()
    if payload.get("success") is False:
        error_details = payload.get("errors") or payload.get("messages")
        raise RuntimeError(f"Cloudflare AI request failed: {error_details}")

    text = payload.get("result", {}).get("response")
    if not isinstance(text, str):
        raise RuntimeError("Cloudflare AI response did not include result.response")

    text = clean_generated_comment(text)
    if not text:
        raise RuntimeError("Cloudflare AI returned an empty response")
    return text


def _cloudflare_ai_url(model_key: str | None = None) -> str:
    if not CLOUDFLARE_ACCOUNT_ID or not CLOUDFLARE_API_TOKEN:
        raise RuntimeError(
            "Cloudflare AI is not configured. Set CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN."
        )
    selected_model = clean_string(model_key) or CLOUDFLARE_AI_MODEL
    return (
        f"{CLOUDFLARE_AI_BASE_URL.rstrip('/')}"
        f"/{CLOUDFLARE_ACCOUNT_ID}/ai/run/{selected_model}"
    )


def clean_generated_comment(text: str) -> str:
    text = re.sub(r"<think>.*?</think>", "", text, flags=re.IGNORECASE | re.DOTALL).strip()
    text = re.sub(r"<think>.*", "", text, flags=re.IGNORECASE | re.DOTALL).strip()
    if text.startswith('"') and text.endswith('"'):
        text = text[1:-1].strip()
    return text


def clean_string(value: str | None) -> str:
    return value.strip() if isinstance(value, str) else ""


def clean_preference_text(value: str | None) -> str | None:
    cleaned = clean_string(value)
    if not cleaned:
        return None
    return cleaned[:MAX_PREFERENCE_LENGTH]
