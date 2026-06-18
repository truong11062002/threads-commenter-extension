# Threads AI Commenter Backend

FastAPI backend for one-click Threads reply generation. The Chrome extension sends a generated `deviceId`, post context, and tone; the API saves device preferences and uses them to write replies in the user's own voice.

## API

- `GET /api/preferences?deviceId=<deviceId>` loads saved **Your voice** and **Threads comment strategy**.
- `PUT /api/preferences` updates **Your voice**, **Threads comment strategy**, and `useViralStrategy`.
- `GET /api/models` returns the backend-owned model whitelist for the extension popup.
- `POST /api/comments/generate` generates a Threads reply. If `userVoice` or `viralStrategy` are omitted, saved preferences for `deviceId` are used.

There is no login/logout/session flow. See `docs/extension-api.md` for request and response examples.

## Quick Start

Create a local `.env` file for the backend:

```env
DATABASE_URL=sqlite:///./threads-ai-commenter.db
CLOUDFLARE_ACCOUNT_ID=your-cloudflare-account-id
CLOUDFLARE_API_TOKEN=your-cloudflare-api-token
CLOUDFLARE_AI_MODEL=@cf/deepseek-ai/deepseek-r1-distill-qwen-32b
CLOUDFLARE_AI_MODEL_OPTIONS=[{"key":"@cf/deepseek-ai/deepseek-r1-distill-qwen-32b","label":"DeepSeek R1 Distill Qwen 32B","description":"Default reasoning model"}]
```

`CLOUDFLARE_AI_MODEL` is the backend default. `CLOUDFLARE_AI_MODEL_OPTIONS` is the optional JSON whitelist shown in the extension; each item can include `key`, `label`, and `description`.

### Start the development server

```bash
uv run fastapi dev
```

Visit http://localhost:8000

### Deploy to FastAPI Cloud

> FastAPI Cloud is currently in private beta. Join the waitlist at https://fastapicloud.com

```bash
uv run fastapi deploy
```

## Project Structure

- `main.py` - Your FastAPI application
- `pyproject.toml` - Project dependencies

## Learn More

- [FastAPI Documentation](https://fastapi.tiangolo.com)
- [FastAPI Cloud](https://fastapicloud.com)
