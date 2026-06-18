from unittest.mock import MagicMock, patch


def build_cloudflare_response(text="this is where consistency quietly wins"):
    mock_response = MagicMock()
    mock_response.raise_for_status.return_value = None
    mock_response.json.return_value = {
        "success": True,
        "result": {
            "response": text,
        },
    }
    return mock_response


def test_full_flow_update_preferences_then_generate_one_click(client):
    prefs_resp = client.put("/api/preferences", json={
        "deviceId": "flow_device",
        "userVoice": "direct, human, lowercase, a little playful",
        "viralStrategy": "make the reply specific enough that the author wants to answer",
        "useViralStrategy": True,
    })
    assert prefs_resp.status_code == 200

    with patch("app.routes.comments.httpx.post") as mock_post:
        mock_post.return_value = build_cloudflare_response()
        generate_resp = client.post("/api/comments/generate", json={
            "deviceId": "flow_device",
            "postText": "Most people quit building in public right before it starts compounding.",
            "authorName": "Mina",
            "authorUsername": "@mina",
            "tone": "relatable",
        })

    assert generate_resp.status_code == 200
    assert generate_resp.json()["comment"] == "this is where consistency quietly wins"

    user_prompt = mock_post.call_args.kwargs["json"]["messages"][1]["content"]
    assert "direct, human, lowercase" in user_prompt
    assert "specific enough that the author wants to answer" in user_prompt
