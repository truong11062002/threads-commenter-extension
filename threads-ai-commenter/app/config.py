import os
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL: str = os.environ["DATABASE_URL"]
CLOUDFLARE_ACCOUNT_ID: str = os.environ.get("CLOUDFLARE_ACCOUNT_ID", "")
CLOUDFLARE_API_TOKEN: str = os.environ.get("CLOUDFLARE_API_TOKEN", "")
CLOUDFLARE_AI_MODEL: str = os.getenv(
    "CLOUDFLARE_AI_MODEL",
    "@cf/deepseek-ai/deepseek-r1-distill-qwen-32b",
)
CLOUDFLARE_AI_BASE_URL: str = os.getenv(
    "CLOUDFLARE_AI_BASE_URL",
    "https://api.cloudflare.com/client/v4/accounts",
)
CLOUDFLARE_AI_MAX_TOKENS: int = int(os.getenv("CLOUDFLARE_AI_MAX_TOKENS", "1024"))
CLOUDFLARE_AI_TEMPERATURE: float = float(os.getenv("CLOUDFLARE_AI_TEMPERATURE", "0.7"))
CLOUDFLARE_AI_TIMEOUT_SECONDS: float = float(os.getenv("CLOUDFLARE_AI_TIMEOUT_SECONDS", "30"))

MAX_POST_TEXT_LENGTH: int = int(os.getenv("MAX_POST_TEXT_LENGTH", "4000"))
GENERATION_ENABLED: bool = os.getenv("GENERATION_ENABLED", "true").lower() == "true"
ALLOWED_EXTENSION_ORIGIN: str | None = os.getenv("ALLOWED_EXTENSION_ORIGIN")
