# Backend-Driven Model Whitelist Design

## Goal

Let extension users choose an AI model without shipping a new extension whenever the available model list changes.

## Design

The backend owns the model whitelist. It exposes a lightweight models endpoint that returns the default model and the currently allowed models with display labels. The extension asks the background service worker for that list, renders a model dropdown in the popup, stores the selected model locally, and includes that model key on future comment generation requests.

The comment generation API accepts an optional `model` field. If omitted, it uses the configured default Cloudflare AI model. If provided, it must match a backend whitelist key; otherwise the backend returns `INVALID_MODEL`.

## Components

- Backend config defines the default model and the allowed model metadata.
- Backend `/api/models` returns `{ ok, defaultModel, models }`.
- Backend `/api/comments/generate` validates `model` and calls Cloudflare AI with the selected model.
- Background service worker handles `GET_MODELS` and forwards selected model in generation payloads.
- Popup loads models, restores the last selected local model, and saves changes to `chrome.storage.local`.

## Error Handling

If model loading fails in the popup, the dropdown stays usable with a single default option and an error message. If a saved model is no longer whitelisted, the popup falls back to the backend default. Backend validation prevents unknown model keys from reaching Cloudflare.

## Tests

Add tests for the backend model list endpoint, invalid model rejection, selected model Cloudflare URL routing, background model forwarding, and popup load/save behavior.
