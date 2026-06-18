import json


def test_get_models_returns_backend_whitelist(client, monkeypatch):
    monkeypatch.setenv("CLOUDFLARE_AI_MODEL_OPTIONS", json.dumps([
        {
            "key": "@cf/deepseek-ai/deepseek-r1-distill-qwen-32b",
            "label": "DeepSeek R1 Distill Qwen 32B",
            "description": "Default reasoning model",
        },
        {
            "key": "@cf/meta/llama-3.1-8b-instruct",
            "label": "Llama 3.1 8B Instruct",
            "description": "Fast general replies",
        },
    ]))

    resp = client.get("/api/models")

    assert resp.status_code == 200
    assert resp.json() == {
        "ok": True,
        "defaultModel": "@cf/deepseek-ai/deepseek-r1-distill-qwen-32b",
        "models": [
            {
                "key": "@cf/deepseek-ai/deepseek-r1-distill-qwen-32b",
                "label": "DeepSeek R1 Distill Qwen 32B",
                "description": "Default reasoning model",
            },
            {
                "key": "@cf/meta/llama-3.1-8b-instruct",
                "label": "Llama 3.1 8B Instruct",
                "description": "Fast general replies",
            },
        ],
    }
