import json
import os

from app.config import CLOUDFLARE_AI_MODEL


def get_default_model_key() -> str:
    return CLOUDFLARE_AI_MODEL


def get_model_options() -> list[dict[str, str]]:
    options = parse_model_options(os.getenv("CLOUDFLARE_AI_MODEL_OPTIONS", ""))
    default_model = get_default_model_key()

    if not any(option["key"] == default_model for option in options):
        options.insert(0, build_model_option(
            default_model,
            label="DeepSeek R1 Distill Qwen 32B" if "deepseek-r1-distill-qwen-32b" in default_model else "",
            description="Backend default model",
        ))

    return dedupe_model_options(options)


def resolve_model_key(value: str | None) -> str | None:
    requested_model = clean_string(value)
    if not requested_model:
        return get_default_model_key()

    allowed_models = {option["key"] for option in get_model_options()}
    if requested_model not in allowed_models:
        return None

    return requested_model


def parse_model_options(raw_value: str) -> list[dict[str, str]]:
    raw_value = clean_string(raw_value)
    if not raw_value:
        return []

    try:
        parsed = json.loads(raw_value)
    except json.JSONDecodeError:
        return []

    if not isinstance(parsed, list):
        return []

    options = []
    for item in parsed:
        option = normalize_model_option(item)
        if option:
            options.append(option)
    return options


def normalize_model_option(item) -> dict[str, str] | None:
    if isinstance(item, str):
        key = clean_string(item)
        return build_model_option(key) if key else None

    if not isinstance(item, dict):
        return None

    key = clean_string(item.get("key") or item.get("model"))
    if not key:
        return None

    return build_model_option(
        key,
        label=clean_string(item.get("label")),
        description=clean_string(item.get("description")),
    )


def build_model_option(key: str, label: str = "", description: str = "") -> dict[str, str]:
    return {
        "key": key,
        "label": label or label_from_model_key(key),
        "description": description,
    }


def dedupe_model_options(options: list[dict[str, str]]) -> list[dict[str, str]]:
    seen = set()
    unique_options = []
    for option in options:
        key = option["key"]
        if key in seen:
            continue
        seen.add(key)
        unique_options.append(option)
    return unique_options


def label_from_model_key(key: str) -> str:
    cleaned = key.replace("@cf/", "")
    parts = cleaned.split("/")
    name = parts[-1] if parts else cleaned
    return name.replace("-", " ").replace("_", " ").title()


def clean_string(value: str | None) -> str:
    return value.strip() if isinstance(value, str) else ""
