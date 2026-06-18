# Threads AI Commenter API

## Base URL

```text
Production: https://threads-commenter-extension.fastapicloud.dev
Local:      http://localhost:8000
```

The extension uses a generated `deviceId`. There is no login, logout, session check, quota endpoint, or `Authorization` header in this API.

## Models

### GET `/api/models`

Loads the backend-owned model whitelist shown in the extension popup.

**Response**

```json
{
  "ok": true,
  "defaultModel": "@cf/deepseek-ai/deepseek-r1-distill-qwen-32b",
  "models": [
    {
      "key": "@cf/deepseek-ai/deepseek-r1-distill-qwen-32b",
      "label": "DeepSeek R1 Distill Qwen 32B",
      "description": "Default reasoning model"
    }
  ]
}
```

## Preferences

### GET `/api/preferences?deviceId=<deviceId>`

Loads the saved voice and strategy for a device. If the device has no saved preferences yet, the API returns empty strings and `useViralStrategy: true`.

**Response**

```json
{
  "ok": true,
  "preferences": {
    "deviceId": "device_123",
    "userVoice": "",
    "viralStrategy": "",
    "useViralStrategy": true
  }
}
```

### PUT `/api/preferences`

Updates the device preferences used by one-click generation.

**Request**

```json
{
  "deviceId": "device_123",
  "userVoice": "direct, human, lowercase, a little playful",
  "viralStrategy": "make the reply specific enough that the author wants to answer",
  "useViralStrategy": true
}
```

**Response**

```json
{
  "ok": true,
  "preferences": {
    "deviceId": "device_123",
    "userVoice": "direct, human, lowercase, a little playful",
    "viralStrategy": "make the reply specific enough that the author wants to answer",
    "useViralStrategy": true
  }
}
```

## Comment Generation

### POST `/api/comments/generate`

Generates a Threads reply. For one-click generation, send `deviceId`, post context, and tone. The API will pull saved `userVoice` and `viralStrategy` from `/api/preferences`.

Per-request `userVoice`, `viralStrategy`, and `useViralStrategy` are supported. When sent, they override the saved values for this generation and are saved back to `/api/preferences` for the same `deviceId`. Send an empty `viralStrategy` string, or `useViralStrategy: false`, to disable strategy.

**Request**

```json
{
  "deviceId": "device_123",
  "postText": "The text content of the Threads post",
  "authorName": "Author Display Name",
  "authorUsername": "@authorhandle",
  "pageUrl": "https://threads.net/@author/post/abc123",
  "tone": "funny",
  "model": "@cf/deepseek-ai/deepseek-r1-distill-qwen-32b",
  "userVoice": "direct, human, lowercase, a little playful",
  "viralStrategy": "make the reply specific enough that the author wants to answer",
  "useViralStrategy": true
}
```

**Fields**

| Field | Required | Description |
| --- | --- | --- |
| `deviceId` | Yes | Generated extension device ID |
| `postText` | Yes | Threads post text, 5 to 4000 chars |
| `authorName` | Yes | Post author's display name |
| `authorUsername` | Yes | Post author's username |
| `pageUrl` | No | URL of the post |
| `tone` | Yes | One of `simple`, `friendly`, `funny`, `insightful`, `curious`, `relatable`, `contrarian`, `supportive`, `expert`, `visionary`, `analytical`, `meme` |
| `model` | No | Backend-whitelisted model key from `GET /api/models`; omitted uses backend default |
| `userVoice` | No | Voice override to use now and save for this device |
| `viralStrategy` | No | Strategy override to use now and save for this device |
| `useViralStrategy` | No | Whether saved/generated replies should use strategy |

**Response**

```json
{
  "ok": true,
  "comment": "this is where consistency quietly wins"
}
```

## Errors

All validation errors return:

```json
{
  "ok": false,
  "error": {
    "code": "MISSING_DEVICE_ID",
    "message": "Device ID is required."
  }
}
```

Common codes:

| Code | Meaning |
| --- | --- |
| `MISSING_DEVICE_ID` | `deviceId` is empty or missing |
| `INVALID_POST_TEXT` | `postText` is shorter than 5 chars or longer than configured max |
| `INVALID_TONE` | `tone` is not supported |
| `INVALID_MODEL` | `model` is not in the backend whitelist |
| `GENERATION_DISABLED` | Generation is disabled by server config |
