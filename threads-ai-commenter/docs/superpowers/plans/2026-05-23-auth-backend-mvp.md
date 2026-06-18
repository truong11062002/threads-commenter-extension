# Auth Backend MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add JWT-based authentication (Neon Auth), per-user quota tracking, and admin endpoints to the Threads AI Commenter backend.

**Architecture:** Replace the anonymous IP/install-ID quota system with authenticated user-based quotas. The backend verifies Neon Auth JWTs by fetching the JWKS endpoint, then checks user ban status and daily generation limits before calling OpenAI. Admin endpoints are protected by a role check.

**Tech Stack:** FastAPI, SQLModel, PostgreSQL (Neon), PyJWT + cryptography (for RS256 JWT verification), OpenAI SDK, python-dotenv

---

## File Structure

| File | Responsibility |
|------|---------------|
| `app/__init__.py` | Package marker |
| `app/config.py` | Settings loaded from env vars |
| `app/database.py` | Engine creation, session dependency |
| `app/models.py` | SQLModel table definitions (UserLimit, UserUsage, GenerationLog) |
| `app/auth.py` | JWT verification via JWKS, `get_current_user` dependency |
| `app/routes/__init__.py` | Package marker |
| `app/routes/me.py` | `GET /api/me` |
| `app/routes/comments.py` | `POST /api/comments/generate` |
| `app/routes/usage.py` | `GET /api/usage` |
| `app/routes/admin.py` | `GET /api/admin/users`, `POST /api/admin/users/:userId/ban` |
| `app/main.py` | FastAPI app assembly (mounts routers, startup event) |
| `main.py` | Thin entrypoint that imports from `app.main` (keeps existing deploy working) |
| `tests/__init__.py` | Package marker |
| `tests/conftest.py` | Shared fixtures (test client, mock JWT, test DB session) |
| `tests/test_auth.py` | Tests for JWT verification logic |
| `tests/test_me.py` | Tests for `/api/me` |
| `tests/test_comments.py` | Tests for `/api/comments/generate` (authenticated) |
| `tests/test_usage.py` | Tests for `/api/usage` |
| `tests/test_admin.py` | Tests for admin endpoints |

---

## Task 1: Add Dependencies

**Files:**
- Modify: `pyproject.toml`

- [ ] **Step 1: Add PyJWT and cryptography to dependencies**

```toml
[project]
name = "threads-ai-commenter"
version = "0.2.0"
requires-python = ">=3.12"
dependencies = [
    "fastapi[standard]>=0.136.1",
    "sqlmodel>=0.0.24",
    "psycopg2-binary>=2.9.10",
    "openai>=1.55.0",
    "python-dotenv>=1.0.1",
    "pyjwt[crypto]>=2.9.0",
    "httpx>=0.27.0",
]

[project.optional-dependencies]
dev = [
    "pytest>=8.0",
    "pytest-asyncio>=0.23",
]
```

- [ ] **Step 2: Install dependencies**

Run: `cd /Users/charles/truongnn/threads-ai-commenter && uv sync`
Expected: All packages install successfully.

- [ ] **Step 3: Commit**

```bash
git add pyproject.toml uv.lock
git commit -m "feat: add pyjwt, httpx, and test dependencies for auth backend"
```

---

## Task 2: Create App Package with Config and Database Modules

**Files:**
- Create: `app/__init__.py`
- Create: `app/config.py`
- Create: `app/database.py`

- [ ] **Step 1: Create `app/__init__.py`**

```python
```

(Empty file — package marker only.)

- [ ] **Step 2: Create `app/config.py`**

```python
import os
from dotenv import load_dotenv

load_dotenv()


DATABASE_URL: str = os.environ["DATABASE_URL"]
OPENAI_API_KEY: str = os.environ["OPENAI_API_KEY"]
OPENAI_MODEL: str = os.getenv("OPENAI_MODEL", "gpt-4o-mini")

NEON_AUTH_BASE_URL: str = os.environ["NEON_AUTH_BASE_URL"]
JWKS_URL: str = f"{NEON_AUTH_BASE_URL}/.well-known/jwks.json"

DAILY_FREE_LIMIT: int = int(os.getenv("DAILY_FREE_LIMIT", "20"))
MAX_POST_TEXT_LENGTH: int = int(os.getenv("MAX_POST_TEXT_LENGTH", "4000"))
GENERATION_ENABLED: bool = os.getenv("GENERATION_ENABLED", "true").lower() == "true"
ALLOWED_EXTENSION_ORIGIN: str | None = os.getenv("ALLOWED_EXTENSION_ORIGIN")
```

- [ ] **Step 3: Create `app/database.py`**

```python
from sqlmodel import Session, SQLModel, create_engine

from app.config import DATABASE_URL

engine = create_engine(DATABASE_URL)


def create_db_and_tables():
    SQLModel.metadata.create_all(engine)


def get_session():
    with Session(engine) as session:
        yield session
```

- [ ] **Step 4: Commit**

```bash
git add app/__init__.py app/config.py app/database.py
git commit -m "feat: create app package with config and database modules"
```

---

## Task 3: Define Database Models

**Files:**
- Create: `app/models.py`
- Test: `tests/__init__.py`
- Test: `tests/test_models.py`

- [ ] **Step 1: Write `tests/__init__.py`**

```python
```

- [ ] **Step 2: Write the failing test in `tests/test_models.py`**

```python
from datetime import date, datetime, timezone

from app.models import UserUsage, UserLimit, GenerationLog


def test_user_usage_defaults():
    usage = UserUsage(user_id="user_abc", usage_date=date(2026, 5, 23))
    assert usage.user_id == "user_abc"
    assert usage.generations_count == 0


def test_user_limit_defaults():
    limit = UserLimit(user_id="user_abc")
    assert limit.daily_limit == 20
    assert limit.is_banned is False
    assert limit.ban_reason is None


def test_generation_log_creation():
    log = GenerationLog(
        user_id="user_abc",
        tone="insightful",
        page_url="https://www.threads.net/@user/post/abc",
        input_chars=100,
        output_chars=50,
    )
    assert log.user_id == "user_abc"
    assert log.tone == "insightful"
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd /Users/charles/truongnn/threads-ai-commenter && uv run pytest tests/test_models.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.models'`

- [ ] **Step 4: Create `app/models.py`**

```python
from datetime import date, datetime, timezone
from typing import Optional

from sqlmodel import Field, SQLModel


class UserUsage(SQLModel, table=True):
    __tablename__ = "app_user_usage"

    id: int | None = Field(default=None, primary_key=True)
    user_id: str = Field(index=True)
    usage_date: date = Field(index=True)
    generations_count: int = Field(default=0)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class UserLimit(SQLModel, table=True):
    __tablename__ = "app_user_limits"

    user_id: str = Field(primary_key=True)
    daily_limit: int = Field(default=20)
    is_banned: bool = Field(default=False)
    ban_reason: Optional[str] = Field(default=None)
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class GenerationLog(SQLModel, table=True):
    __tablename__ = "app_generation_logs"

    id: int | None = Field(default=None, primary_key=True)
    user_id: str = Field(index=True)
    tone: str
    page_url: Optional[str] = Field(default=None)
    input_chars: int
    output_chars: int
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd /Users/charles/truongnn/threads-ai-commenter && uv run pytest tests/test_models.py -v`
Expected: 3 tests PASS

- [ ] **Step 6: Commit**

```bash
git add app/models.py tests/__init__.py tests/test_models.py
git commit -m "feat: add SQLModel tables for user usage, limits, and generation logs"
```

---

## Task 4: JWT Verification (Auth Module)

**Files:**
- Create: `app/auth.py`
- Test: `tests/test_auth.py`
- Test: `tests/conftest.py`

- [ ] **Step 1: Create `tests/conftest.py` with JWT fixtures**

```python
import json
import time
from datetime import datetime, timezone, timedelta

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.backends import default_backend
from fastapi.testclient import TestClient
from sqlmodel import Session, SQLModel, create_engine
from sqlmodel.pool import StaticPool

from app.database import get_session


@pytest.fixture(scope="session")
def rsa_keypair():
    private_key = rsa.generate_private_key(
        public_exponent=65537,
        key_size=2048,
        backend=default_backend(),
    )
    public_key = private_key.public_key()
    return private_key, public_key


@pytest.fixture(scope="session")
def jwks_json(rsa_keypair):
    _, public_key = rsa_keypair
    from jwt.algorithms import RSAAlgorithm
    jwk = json.loads(RSAAlgorithm.to_jwk(public_key))
    jwk["kid"] = "test-key-1"
    jwk["use"] = "sig"
    jwk["alg"] = "RS256"
    return {"keys": [jwk]}


@pytest.fixture
def make_token(rsa_keypair):
    private_key, _ = rsa_keypair

    def _make(user_id: str = "user_123", email: str = "test@example.com", name: str = "Test User", expired: bool = False):
        now = datetime.now(timezone.utc)
        exp = now - timedelta(hours=1) if expired else now + timedelta(hours=1)
        payload = {
            "sub": user_id,
            "email": email,
            "name": name,
            "iat": int(now.timestamp()),
            "exp": int(exp.timestamp()),
        }
        return jwt.encode(payload, private_key, algorithm="RS256", headers={"kid": "test-key-1"})

    return _make


@pytest.fixture
def test_engine():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    SQLModel.metadata.create_all(engine)
    return engine


@pytest.fixture
def test_session(test_engine):
    with Session(test_engine) as session:
        yield session


@pytest.fixture
def client(test_engine, jwks_json, monkeypatch):
    from app.main import app
    from app import auth

    def override_get_session():
        with Session(test_engine) as session:
            yield session

    app.dependency_overrides[get_session] = override_get_session

    monkeypatch.setattr(auth, "_cached_jwks", jwks_json)
    monkeypatch.setattr(auth, "_jwks_fetched_at", time.time())

    with TestClient(app) as c:
        yield c

    app.dependency_overrides.clear()
```

- [ ] **Step 2: Write failing test in `tests/test_auth.py`**

```python
from app.auth import verify_token


def test_verify_valid_token(make_token, jwks_json, monkeypatch):
    from app import auth
    monkeypatch.setattr(auth, "_cached_jwks", jwks_json)
    monkeypatch.setattr(auth, "_jwks_fetched_at", __import__("time").time())

    token = make_token(user_id="user_abc", email="abc@test.com", name="Abc")
    payload = verify_token(token)
    assert payload["sub"] == "user_abc"
    assert payload["email"] == "abc@test.com"


def test_verify_expired_token(make_token, jwks_json, monkeypatch):
    from app import auth
    monkeypatch.setattr(auth, "_cached_jwks", jwks_json)
    monkeypatch.setattr(auth, "_jwks_fetched_at", __import__("time").time())

    token = make_token(expired=True)
    import pytest
    with pytest.raises(Exception):
        verify_token(token)


def test_verify_invalid_signature(jwks_json, monkeypatch):
    from app import auth
    monkeypatch.setattr(auth, "_cached_jwks", jwks_json)
    monkeypatch.setattr(auth, "_jwks_fetched_at", __import__("time").time())

    import pytest
    with pytest.raises(Exception):
        verify_token("invalid.token.value")
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd /Users/charles/truongnn/threads-ai-commenter && uv run pytest tests/test_auth.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.auth'`

- [ ] **Step 4: Create `app/auth.py`**

```python
import time
from typing import Any

import httpx
import jwt
from fastapi import Depends, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlmodel import Session

from app.config import JWKS_URL
from app.database import get_session

_cached_jwks: dict | None = None
_jwks_fetched_at: float = 0
_JWKS_CACHE_TTL = 3600  # 1 hour

security = HTTPBearer()


def _fetch_jwks() -> dict:
    global _cached_jwks, _jwks_fetched_at
    now = time.time()
    if _cached_jwks and (now - _jwks_fetched_at) < _JWKS_CACHE_TTL:
        return _cached_jwks
    response = httpx.get(JWKS_URL, timeout=10)
    response.raise_for_status()
    _cached_jwks = response.json()
    _jwks_fetched_at = now
    return _cached_jwks


def _get_signing_key(token: str) -> Any:
    jwks = _fetch_jwks()
    unverified_header = jwt.get_unverified_header(token)
    kid = unverified_header.get("kid")
    for key_data in jwks.get("keys", []):
        if key_data.get("kid") == kid:
            from jwt.algorithms import RSAAlgorithm
            return RSAAlgorithm.from_jwk(key_data)
    raise HTTPException(status_code=401, detail="Signing key not found")


def verify_token(token: str) -> dict:
    key = _get_signing_key(token)
    payload = jwt.decode(token, key, algorithms=["RS256"])
    return payload


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
) -> dict:
    try:
        payload = verify_token(credentials.credentials)
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")
    return payload
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd /Users/charles/truongnn/threads-ai-commenter && uv run pytest tests/test_auth.py -v`
Expected: 3 tests PASS

- [ ] **Step 6: Commit**

```bash
git add app/auth.py tests/conftest.py tests/test_auth.py
git commit -m "feat: add JWT verification module with JWKS caching"
```

---

## Task 5: Routes — GET /api/me

**Files:**
- Create: `app/routes/__init__.py`
- Create: `app/routes/me.py`
- Test: `tests/test_me.py`

- [ ] **Step 1: Create `app/routes/__init__.py`**

```python
```

- [ ] **Step 2: Write failing test in `tests/test_me.py`**

```python
from app.models import UserLimit, UserUsage
from datetime import date, datetime, timezone


def test_get_me_returns_user_and_quota(client, make_token, test_engine):
    from sqlmodel import Session
    with Session(test_engine) as session:
        session.add(UserLimit(user_id="user_123", daily_limit=20, is_banned=False))
        session.add(UserUsage(user_id="user_123", usage_date=date.today(), generations_count=3))
        session.commit()

    token = make_token(user_id="user_123", email="test@example.com", name="Test User")
    resp = client.get("/api/me", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    data = resp.json()
    assert data["ok"] is True
    assert data["user"]["id"] == "user_123"
    assert data["user"]["email"] == "test@example.com"
    assert data["user"]["role"] == "user"
    assert data["user"]["banned"] is False
    assert data["quota"]["limit"] == 20
    assert data["quota"]["usedToday"] == 3
    assert data["quota"]["remainingToday"] == 17


def test_get_me_new_user_has_default_quota(client, make_token):
    token = make_token(user_id="new_user", email="new@example.com", name="New")
    resp = client.get("/api/me", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    data = resp.json()
    assert data["quota"]["usedToday"] == 0
    assert data["quota"]["remainingToday"] == 20


def test_get_me_no_auth_returns_401(client):
    resp = client.get("/api/me")
    assert resp.status_code == 403  # HTTPBearer returns 403 when missing
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd /Users/charles/truongnn/threads-ai-commenter && uv run pytest tests/test_me.py -v`
Expected: FAIL — import error or route not found

- [ ] **Step 4: Create `app/routes/me.py`**

```python
from datetime import date

from fastapi import APIRouter, Depends
from sqlmodel import Session, select

from app.auth import get_current_user
from app.config import DAILY_FREE_LIMIT
from app.database import get_session
from app.models import UserLimit, UserUsage

router = APIRouter()


@router.get("/api/me")
def get_me(
    user: dict = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    user_id = user["sub"]
    email = user.get("email", "")
    name = user.get("name", "")

    limit_record = session.get(UserLimit, user_id)
    if not limit_record:
        limit_record = UserLimit(user_id=user_id, daily_limit=DAILY_FREE_LIMIT)
        session.add(limit_record)
        session.commit()
        session.refresh(limit_record)

    today = date.today()
    usage_record = session.exec(
        select(UserUsage).where(UserUsage.user_id == user_id, UserUsage.usage_date == today)
    ).first()
    used_today = usage_record.generations_count if usage_record else 0

    role = "admin" if email in _get_admin_emails() else "user"

    return {
        "ok": True,
        "user": {
            "id": user_id,
            "email": email,
            "name": name,
            "role": role,
            "banned": limit_record.is_banned,
        },
        "quota": {
            "limit": limit_record.daily_limit,
            "usedToday": used_today,
            "remainingToday": max(0, limit_record.daily_limit - used_today),
        },
    }


def _get_admin_emails() -> set:
    import os
    raw = os.getenv("ADMIN_EMAILS", "")
    return {e.strip() for e in raw.split(",") if e.strip()}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd /Users/charles/truongnn/threads-ai-commenter && uv run pytest tests/test_me.py -v`
Expected: FAIL — app doesn't include this router yet (we need `app/main.py`)

- [ ] **Step 6: Create `app/main.py` (minimal, to wire routes)**

```python
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from app.database import create_db_and_tables
from app.routes.me import router as me_router
from app.routes.comments import router as comments_router
from app.routes.usage import router as usage_router
from app.routes.admin import router as admin_router

app = FastAPI(title="Threads AI Commenter Backend", version="2.0.0")


@app.on_event("startup")
def on_startup():
    create_db_and_tables()


app.include_router(me_router)
app.include_router(comments_router)
app.include_router(usage_router)
app.include_router(admin_router)
```

Note: This will fail until we create the other route files. Create stubs for now:

- [ ] **Step 7: Create stub route files**

Create `app/routes/comments.py`:
```python
from fastapi import APIRouter

router = APIRouter()
```

Create `app/routes/usage.py`:
```python
from fastapi import APIRouter

router = APIRouter()
```

Create `app/routes/admin.py`:
```python
from fastapi import APIRouter

router = APIRouter()
```

- [ ] **Step 8: Run test to verify it passes**

Run: `cd /Users/charles/truongnn/threads-ai-commenter && uv run pytest tests/test_me.py -v`
Expected: 3 tests PASS

- [ ] **Step 9: Commit**

```bash
git add app/routes/ app/main.py tests/test_me.py
git commit -m "feat: add GET /api/me endpoint with user profile and quota"
```

---

## Task 6: Routes — POST /api/comments/generate (Authenticated)

**Files:**
- Modify: `app/routes/comments.py`
- Test: `tests/test_comments.py`

- [ ] **Step 1: Write failing test in `tests/test_comments.py`**

```python
from datetime import date
from unittest.mock import patch, MagicMock

from app.models import UserLimit, UserUsage
from sqlmodel import Session


def test_generate_comment_success(client, make_token, test_engine):
    with Session(test_engine) as session:
        session.add(UserLimit(user_id="user_123", daily_limit=20, is_banned=False))
        session.add(UserUsage(user_id="user_123", usage_date=date.today(), generations_count=3))
        session.commit()

    token = make_token()
    body = {
        "postText": "Just launched my startup after 8 months of building",
        "tone": "insightful",
        "userVoice": "casual, concise",
        "viralStrategy": "invite thoughtful replies",
        "pageUrl": "https://www.threads.net/@user/post/abc",
    }

    mock_response = MagicMock()
    mock_response.choices = [MagicMock()]
    mock_response.choices[0].message.content = "great insight here"

    with patch("app.routes.comments.OpenAI") as mock_openai:
        mock_openai.return_value.chat.completions.create.return_value = mock_response
        resp = client.post(
            "/api/comments/generate",
            json=body,
            headers={"Authorization": f"Bearer {token}"},
        )

    assert resp.status_code == 200
    data = resp.json()
    assert data["ok"] is True
    assert data["comment"] == "great insight here"
    assert data["quota"]["usedToday"] == 4
    assert data["quota"]["remainingToday"] == 16


def test_generate_comment_banned_user(client, make_token, test_engine):
    with Session(test_engine) as session:
        session.add(UserLimit(user_id="user_123", daily_limit=20, is_banned=True, ban_reason="abuse"))
        session.commit()

    token = make_token()
    body = {"postText": "Hello world testing", "tone": "simple"}
    resp = client.post(
        "/api/comments/generate",
        json=body,
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 403
    assert resp.json()["ok"] is False


def test_generate_comment_quota_exceeded(client, make_token, test_engine):
    with Session(test_engine) as session:
        session.add(UserLimit(user_id="user_123", daily_limit=20, is_banned=False))
        session.add(UserUsage(user_id="user_123", usage_date=date.today(), generations_count=20))
        session.commit()

    token = make_token()
    body = {"postText": "Hello world testing", "tone": "simple"}
    resp = client.post(
        "/api/comments/generate",
        json=body,
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 429
    assert resp.json()["ok"] is False


def test_generate_comment_no_auth(client):
    body = {"postText": "Hello world", "tone": "simple"}
    resp = client.post("/api/comments/generate", json=body)
    assert resp.status_code == 403
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/charles/truongnn/threads-ai-commenter && uv run pytest tests/test_comments.py -v`
Expected: FAIL — routes return 404 or no logic

- [ ] **Step 3: Implement `app/routes/comments.py`**

```python
from datetime import date, datetime, timezone, timedelta

from fastapi import APIRouter, Depends, HTTPException
from openai import OpenAI
from pydantic import BaseModel
from sqlmodel import Session, select

from app.auth import get_current_user
from app.config import (
    DAILY_FREE_LIMIT,
    GENERATION_ENABLED,
    MAX_POST_TEXT_LENGTH,
    OPENAI_API_KEY,
    OPENAI_MODEL,
)
from app.database import get_session
from app.models import GenerationLog, UserLimit, UserUsage

router = APIRouter()

ALLOWED_TONES = ["simple", "funny", "insightful", "curious", "relatable", "contrarian"]


class GenerateRequest(BaseModel):
    postText: str
    tone: str
    userVoice: str | None = None
    viralStrategy: str | None = None
    pageUrl: str | None = None


@router.post("/api/comments/generate")
def generate_comment(
    body: GenerateRequest,
    user: dict = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    if not GENERATION_ENABLED:
        raise HTTPException(status_code=503, detail="Generation disabled")

    user_id = user["sub"]

    # Check ban
    limit_record = session.get(UserLimit, user_id)
    if not limit_record:
        limit_record = UserLimit(user_id=user_id, daily_limit=DAILY_FREE_LIMIT)
        session.add(limit_record)
        session.commit()
        session.refresh(limit_record)

    if limit_record.is_banned:
        return _error_response(403, "BANNED", "Your account has been suspended.")

    # Validate input
    if len(body.postText) < 5 or len(body.postText) > MAX_POST_TEXT_LENGTH:
        return _error_response(400, "INVALID_POST_TEXT", f"Post text must be 5-{MAX_POST_TEXT_LENGTH} chars.")

    if body.tone not in ALLOWED_TONES:
        return _error_response(400, "INVALID_TONE", "Unsupported tone.")

    # Check quota
    today = date.today()
    usage_record = session.exec(
        select(UserUsage).where(UserUsage.user_id == user_id, UserUsage.usage_date == today)
    ).first()
    used_today = usage_record.generations_count if usage_record else 0

    if used_today >= limit_record.daily_limit:
        tomorrow = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0) + timedelta(days=1)
        return _error_response(429, "DAILY_LIMIT_REACHED", "Daily limit reached.", {
            "quota": {
                "limit": limit_record.daily_limit,
                "used": used_today,
                "remaining": 0,
                "resetsAt": tomorrow.isoformat() + "Z",
            }
        })

    # Call OpenAI
    comment = _call_openai(body)

    # Increment usage
    if usage_record:
        usage_record.generations_count += 1
        usage_record.updated_at = datetime.now(timezone.utc)
    else:
        usage_record = UserUsage(user_id=user_id, usage_date=today, generations_count=1)
    session.add(usage_record)

    # Log generation
    log = GenerationLog(
        user_id=user_id,
        tone=body.tone,
        page_url=body.pageUrl,
        input_chars=len(body.postText),
        output_chars=len(comment),
    )
    session.add(log)
    session.commit()

    new_used = used_today + 1
    return {
        "ok": True,
        "comment": comment,
        "quota": {
            "limit": limit_record.daily_limit,
            "usedToday": new_used,
            "remainingToday": max(0, limit_record.daily_limit - new_used),
        },
    }


def _call_openai(body: GenerateRequest) -> str:
    system_prompt = (
        "You are an expert social media manager specialized in Threads.\n"
        "Generate a highly engaging, natural-sounding comment.\n"
        "- Be conversational, authentic, and casual.\n"
        "- Avoid generic praise.\n"
        "- Keep it concise and encourage conversation."
    )
    user_voice_section = f"\nUser Voice: {body.userVoice}" if body.userVoice else ""
    viral_section = f"\nViral Strategy: {body.viralStrategy}" if body.viralStrategy else ""
    user_prompt = (
        f"Post:\n\"\"\"\n{body.postText}\n\"\"\"\n\n"
        f"Tone: {body.tone}{user_voice_section}{viral_section}\n\n"
        f"Return only the comment text."
    )

    client = OpenAI(api_key=OPENAI_API_KEY)
    response = client.chat.completions.create(
        model=OPENAI_MODEL,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        temperature=0.7,
        max_tokens=250,
    )
    text = response.choices[0].message.content.strip()
    if text.startswith('"') and text.endswith('"'):
        text = text[1:-1].strip()
    return text


def _error_response(status_code: int, code: str, message: str, extra: dict | None = None):
    from fastapi.responses import JSONResponse
    content = {"ok": False, "error": {"code": code, "message": message}}
    if extra:
        content["error"].update(extra)
    return JSONResponse(status_code=status_code, content=content)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/charles/truongnn/threads-ai-commenter && uv run pytest tests/test_comments.py -v`
Expected: 4 tests PASS

- [ ] **Step 5: Commit**

```bash
git add app/routes/comments.py tests/test_comments.py
git commit -m "feat: add authenticated POST /api/comments/generate with quota enforcement"
```

---

## Task 7: Routes — GET /api/usage

**Files:**
- Modify: `app/routes/usage.py`
- Test: `tests/test_usage.py`

- [ ] **Step 1: Write failing test in `tests/test_usage.py`**

```python
from datetime import date
from app.models import UserLimit, UserUsage
from sqlmodel import Session


def test_get_usage(client, make_token, test_engine):
    with Session(test_engine) as session:
        session.add(UserLimit(user_id="user_123", daily_limit=20))
        session.add(UserUsage(user_id="user_123", usage_date=date.today(), generations_count=4))
        session.commit()

    token = make_token()
    resp = client.get("/api/usage", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    data = resp.json()
    assert data["ok"] is True
    assert data["usage"]["period"] == "daily"
    assert data["usage"]["limit"] == 20
    assert data["usage"]["used"] == 4
    assert data["usage"]["remaining"] == 16
    assert "resetsAt" in data["usage"]


def test_get_usage_new_user(client, make_token):
    token = make_token(user_id="brand_new")
    resp = client.get("/api/usage", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    data = resp.json()
    assert data["usage"]["used"] == 0
    assert data["usage"]["remaining"] == 20
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/charles/truongnn/threads-ai-commenter && uv run pytest tests/test_usage.py -v`
Expected: FAIL — endpoint returns empty or 404

- [ ] **Step 3: Implement `app/routes/usage.py`**

```python
from datetime import date, datetime, timezone, timedelta

from fastapi import APIRouter, Depends
from sqlmodel import Session, select

from app.auth import get_current_user
from app.config import DAILY_FREE_LIMIT
from app.database import get_session
from app.models import UserLimit, UserUsage

router = APIRouter()


@router.get("/api/usage")
def get_usage(
    user: dict = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    user_id = user["sub"]

    limit_record = session.get(UserLimit, user_id)
    daily_limit = limit_record.daily_limit if limit_record else DAILY_FREE_LIMIT

    today = date.today()
    usage_record = session.exec(
        select(UserUsage).where(UserUsage.user_id == user_id, UserUsage.usage_date == today)
    ).first()
    used = usage_record.generations_count if usage_record else 0

    tomorrow = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0) + timedelta(days=1)

    return {
        "ok": True,
        "usage": {
            "period": "daily",
            "limit": daily_limit,
            "used": used,
            "remaining": max(0, daily_limit - used),
            "resetsAt": tomorrow.strftime("%Y-%m-%dT%H:%M:%S.000Z"),
        },
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/charles/truongnn/threads-ai-commenter && uv run pytest tests/test_usage.py -v`
Expected: 2 tests PASS

- [ ] **Step 5: Commit**

```bash
git add app/routes/usage.py tests/test_usage.py
git commit -m "feat: add GET /api/usage endpoint"
```

---

## Task 8: Routes — Admin Endpoints

**Files:**
- Modify: `app/routes/admin.py`
- Test: `tests/test_admin.py`

- [ ] **Step 1: Write failing test in `tests/test_admin.py`**

```python
import os
from datetime import date
from app.models import UserLimit, UserUsage
from sqlmodel import Session


def test_admin_list_users(client, make_token, test_engine, monkeypatch):
    monkeypatch.setenv("ADMIN_EMAILS", "test@example.com")

    with Session(test_engine) as session:
        session.add(UserLimit(user_id="u1", daily_limit=20, is_banned=False))
        session.add(UserLimit(user_id="u2", daily_limit=20, is_banned=True, ban_reason="spam"))
        session.add(UserUsage(user_id="u1", usage_date=date.today(), generations_count=5))
        session.commit()

    token = make_token(user_id="admin_1", email="test@example.com")
    resp = client.get("/api/admin/users", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    data = resp.json()
    assert data["ok"] is True
    assert len(data["users"]) == 2


def test_admin_list_users_non_admin(client, make_token, monkeypatch):
    monkeypatch.setenv("ADMIN_EMAILS", "admin@company.com")
    token = make_token(email="notadmin@example.com")
    resp = client.get("/api/admin/users", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 403


def test_admin_ban_user(client, make_token, test_engine, monkeypatch):
    monkeypatch.setenv("ADMIN_EMAILS", "test@example.com")

    with Session(test_engine) as session:
        session.add(UserLimit(user_id="target_user", daily_limit=20, is_banned=False))
        session.commit()

    token = make_token(email="test@example.com")
    resp = client.post(
        "/api/admin/users/target_user/ban",
        json={"reason": "abuse"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["ok"] is True
    assert data["banned"] is True


def test_admin_ban_non_admin(client, make_token, test_engine, monkeypatch):
    monkeypatch.setenv("ADMIN_EMAILS", "admin@company.com")

    with Session(test_engine) as session:
        session.add(UserLimit(user_id="target_user", daily_limit=20, is_banned=False))
        session.commit()

    token = make_token(email="hacker@evil.com")
    resp = client.post(
        "/api/admin/users/target_user/ban",
        json={"reason": "trying"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 403
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/charles/truongnn/threads-ai-commenter && uv run pytest tests/test_admin.py -v`
Expected: FAIL — endpoints return 404 or have no logic

- [ ] **Step 3: Implement `app/routes/admin.py`**

```python
import os
from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlmodel import Session, select

from app.auth import get_current_user
from app.config import DAILY_FREE_LIMIT
from app.database import get_session
from app.models import UserLimit, UserUsage

router = APIRouter()


def _get_admin_emails() -> set:
    raw = os.getenv("ADMIN_EMAILS", "")
    return {e.strip() for e in raw.split(",") if e.strip()}


def _require_admin(user: dict = Depends(get_current_user)):
    email = user.get("email", "")
    if email not in _get_admin_emails():
        raise HTTPException(status_code=403, detail="Admin access required")
    return user


@router.get("/api/admin/users")
def list_users(
    user: dict = Depends(_require_admin),
    session: Session = Depends(get_session),
):
    limits = session.exec(select(UserLimit)).all()
    today = date.today()

    users = []
    for limit in limits:
        usage_record = session.exec(
            select(UserUsage).where(UserUsage.user_id == limit.user_id, UserUsage.usage_date == today)
        ).first()
        usage_today = usage_record.generations_count if usage_record else 0

        users.append({
            "id": limit.user_id,
            "role": "admin" if limit.user_id in _get_admin_emails() else "user",
            "banned": limit.is_banned,
            "usageToday": usage_today,
            "dailyLimit": limit.daily_limit,
            "updatedAt": limit.updated_at.isoformat() + "Z" if limit.updated_at else None,
        })

    return {"ok": True, "users": users}


class BanRequest(BaseModel):
    reason: str


@router.post("/api/admin/users/{user_id}/ban")
def ban_user(
    user_id: str,
    body: BanRequest,
    user: dict = Depends(_require_admin),
    session: Session = Depends(get_session),
):
    limit_record = session.get(UserLimit, user_id)
    if not limit_record:
        limit_record = UserLimit(user_id=user_id, daily_limit=DAILY_FREE_LIMIT)

    limit_record.is_banned = True
    limit_record.ban_reason = body.reason
    limit_record.updated_at = datetime.now(timezone.utc)
    session.add(limit_record)
    session.commit()

    return {
        "ok": True,
        "userId": user_id,
        "banned": True,
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/charles/truongnn/threads-ai-commenter && uv run pytest tests/test_admin.py -v`
Expected: 4 tests PASS

- [ ] **Step 5: Commit**

```bash
git add app/routes/admin.py tests/test_admin.py
git commit -m "feat: add admin endpoints for user listing and banning"
```

---

## Task 9: Update Entrypoint and Add .env Configuration

**Files:**
- Modify: `main.py`
- Modify: `.env` (add `NEON_AUTH_BASE_URL` and `ADMIN_EMAILS`)

- [ ] **Step 1: Update `main.py` to delegate to new app**

```python
from app.main import app  # noqa: F401
```

This keeps the existing deployment working (uvicorn main:app).

- [ ] **Step 2: Add new env vars to `.env`**

Add these lines to `.env`:
```
NEON_AUTH_BASE_URL=https://your-project.auth.neon.tech
ADMIN_EMAILS=your-admin@email.com
```

- [ ] **Step 3: Run full test suite**

Run: `cd /Users/charles/truongnn/threads-ai-commenter && uv run pytest tests/ -v`
Expected: All tests PASS

- [ ] **Step 4: Commit**

```bash
git add main.py
git commit -m "feat: update entrypoint to use new app package"
```

---

## Task 10: Integration Smoke Test

**Files:**
- Test: `tests/test_integration.py`

- [ ] **Step 1: Write integration test**

```python
from datetime import date
from unittest.mock import patch, MagicMock

from sqlmodel import Session

from app.models import UserLimit, UserUsage


def test_full_flow_generate_then_check_usage(client, make_token, test_engine):
    """Simulate: user generates a comment, then checks usage."""
    token = make_token(user_id="flow_user", email="flow@test.com", name="Flow")

    # Mock OpenAI
    mock_response = MagicMock()
    mock_response.choices = [MagicMock()]
    mock_response.choices[0].message.content = "nice take on this"

    with patch("app.routes.comments.OpenAI") as mock_openai:
        mock_openai.return_value.chat.completions.create.return_value = mock_response
        resp = client.post(
            "/api/comments/generate",
            json={"postText": "Building in public is underrated", "tone": "insightful"},
            headers={"Authorization": f"Bearer {token}"},
        )
    assert resp.status_code == 200
    assert resp.json()["comment"] == "nice take on this"
    assert resp.json()["quota"]["usedToday"] == 1

    # Check usage
    resp = client.get("/api/usage", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    assert resp.json()["usage"]["used"] == 1

    # Check /me
    resp = client.get("/api/me", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    assert resp.json()["quota"]["usedToday"] == 1
```

- [ ] **Step 2: Run integration test**

Run: `cd /Users/charles/truongnn/threads-ai-commenter && uv run pytest tests/test_integration.py -v`
Expected: PASS

- [ ] **Step 3: Run all tests**

Run: `cd /Users/charles/truongnn/threads-ai-commenter && uv run pytest tests/ -v`
Expected: All tests PASS

- [ ] **Step 4: Commit**

```bash
git add tests/test_integration.py
git commit -m "test: add integration smoke test for full auth flow"
```

---

## Summary of New Environment Variables

| Variable | Example | Purpose |
|----------|---------|---------|
| `NEON_AUTH_BASE_URL` | `https://your-project.auth.neon.tech` | Neon Auth service URL for JWKS |
| `ADMIN_EMAILS` | `admin@company.com,cto@company.com` | Comma-separated admin emails |

Existing variables (`DATABASE_URL`, `OPENAI_API_KEY`, `OPENAI_MODEL`, `DAILY_FREE_LIMIT`, `MAX_POST_TEXT_LENGTH`, `GENERATION_ENABLED`) remain unchanged.
