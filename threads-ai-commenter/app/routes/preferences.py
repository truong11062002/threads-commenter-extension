from fastapi import APIRouter, Depends, Query
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_session
from app.models import DevicePreference

router = APIRouter()

MAX_PREFERENCE_LENGTH = 4000


class PreferenceUpdateRequest(BaseModel):
    deviceId: str = ""
    userVoice: str | None = None
    viralStrategy: str | None = None
    useViralStrategy: bool = True


@router.get("/api/preferences")
def get_preferences(
    deviceId: str = Query(""),
    session: Session = Depends(get_session),
):
    device_id = clean_string(deviceId)
    if not device_id:
        return missing_device_id_response()

    preference = find_preference(session, device_id)
    return {
        "ok": True,
        "preferences": serialize_preferences(device_id, preference),
    }


@router.put("/api/preferences")
def update_preferences(
    body: PreferenceUpdateRequest,
    session: Session = Depends(get_session),
):
    device_id = clean_string(body.deviceId)
    if not device_id:
        return missing_device_id_response()

    preference = find_preference(session, device_id)
    if preference is None:
        preference = DevicePreference(device_id=device_id)
        session.add(preference)

    preference.user_voice = clean_preference_text(body.userVoice)
    preference.viral_strategy = clean_preference_text(body.viralStrategy)
    preference.use_viral_strategy = body.useViralStrategy

    session.commit()
    session.refresh(preference)

    return {
        "ok": True,
        "preferences": serialize_preferences(device_id, preference),
    }


def find_preference(session: Session, device_id: str) -> DevicePreference | None:
    return session.query(DevicePreference).filter_by(device_id=device_id).one_or_none()


def serialize_preferences(device_id: str, preference: DevicePreference | None) -> dict:
    if preference is None:
        return {
            "deviceId": device_id,
            "userVoice": "",
            "viralStrategy": "",
            "useViralStrategy": True,
        }

    return {
        "deviceId": preference.device_id,
        "userVoice": preference.user_voice or "",
        "viralStrategy": preference.viral_strategy or "",
        "useViralStrategy": bool(preference.use_viral_strategy),
    }


def clean_string(value: str | None) -> str:
    return value.strip() if isinstance(value, str) else ""


def clean_preference_text(value: str | None) -> str | None:
    cleaned = clean_string(value)
    if not cleaned:
        return None
    return cleaned[:MAX_PREFERENCE_LENGTH]


def missing_device_id_response() -> JSONResponse:
    return JSONResponse(
        status_code=400,
        content={
            "ok": False,
            "error": {
                "code": "MISSING_DEVICE_ID",
                "message": "Device ID is required.",
            },
        },
    )
