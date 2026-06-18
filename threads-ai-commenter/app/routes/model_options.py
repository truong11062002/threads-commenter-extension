from fastapi import APIRouter

from app.model_catalog import get_default_model_key, get_model_options

router = APIRouter()


@router.get("/api/models")
def get_models():
    return {
        "ok": True,
        "defaultModel": get_default_model_key(),
        "models": get_model_options(),
    }
