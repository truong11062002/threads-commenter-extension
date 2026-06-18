from unittest.mock import MagicMock, patch

from app.models import DevicePreference, GenerationLog
from app.routes.comments import clean_generated_comment


def build_cloudflare_response(text="nice take on this"):
    mock_response = MagicMock()
    mock_response.raise_for_status.return_value = None
    mock_response.json.return_value = {
        "success": True,
        "result": {
            "response": text,
        },
    }
    return mock_response


def get_cloudflare_payload(mock_post):
    return mock_post.call_args.kwargs["json"]


def test_clean_generated_comment_drops_unclosed_reasoning():
    assert clean_generated_comment("<think>\nstill thinking") == ""


def test_generate_comment_uses_saved_preferences_for_one_click(client, test_session):
    test_session.add(DevicePreference(
        device_id="device_123",
        user_voice="warm, blunt, lowercase, tiny personal observations",
        viral_strategy="ask one specific follow-up that makes the author want to reply",
        use_viral_strategy=True,
    ))
    test_session.commit()

    with patch("app.routes.comments.httpx.post") as mock_post:
        mock_post.return_value = build_cloudflare_response(
            "<think>\nprivate reasoning\n</think>\n\"this is the part people underestimate\""
        )
        resp = client.post("/api/comments/generate", json={
            "deviceId": "device_123",
            "postText": "Building in public is more about consistency than polish.",
            "authorName": "Mina",
            "authorUsername": "@mina",
            "tone": "insightful",
            "pageUrl": "https://www.threads.net/@mina/post/abc",
        })

    assert resp.status_code == 200
    data = resp.json()
    assert data["ok"] is True
    assert data["comment"] == "this is the part people underestimate"

    call = mock_post.call_args
    assert call.args[0] == "https://api.cloudflare.com/client/v4/accounts/test-account/ai/run/@cf/deepseek-ai/deepseek-r1-distill-qwen-32b"
    assert call.kwargs["headers"]["Authorization"] == "Bearer test-token"
    messages = get_cloudflare_payload(mock_post)["messages"]
    assert "real person replying on Threads" in messages[0]["content"]
    assert "warm, blunt, lowercase" in messages[1]["content"]
    assert "ask one specific follow-up" in messages[1]["content"]
    assert "Mina (@mina)" in messages[1]["content"]

    log = test_session.query(GenerationLog).filter_by(device_id="device_123").one()
    assert log.tone == "insightful"
    assert log.input_chars == len("Building in public is more about consistency than polish.")


def test_generate_comment_system_prompt_matches_threads_comment_strategy(client):
    with patch("app.routes.comments.httpx.post") as mock_post:
        mock_post.return_value = build_cloudflare_response()
        resp = client.post("/api/comments/generate", json={
            "deviceId": "device_123",
            "postText": "Most people overthink posting and underthink replying.",
            "authorName": "Mina",
            "authorUsername": "@mina",
            "tone": "insightful",
        })

    assert resp.status_code == 200
    payload = get_cloudflare_payload(mock_post)
    system_prompt = payload["messages"][0]["content"]
    user_prompt = payload["messages"][1]["content"]

    assert "1 sentence. Sometimes 2 short ones if needed. 5-20 words total max." in system_prompt
    assert "Do not explain your strategy. Return ONLY the comment text." in system_prompt
    assert "Use X-style ranking signals as inspiration for Threads replies" in user_prompt
    assert "replies, likes, repost/share intent, profile clicks, dwell, and follow intent" in user_prompt
    assert "spammy repetition, copied wording, generic praise, rage bait" in user_prompt
    assert "Build personal branding by quietly showing values, taste, niche" in user_prompt
    assert "Keep it short: 1 to 3 compact sentences or lines" not in system_prompt
    assert "1 to 3" not in system_prompt
    assert "max words" not in system_prompt.lower()
    assert payload["max_tokens"] == 1024


def test_generate_comment_non_curious_tone_strongly_forbids_questions(client):
    with patch("app.routes.comments.httpx.post") as mock_post:
        mock_post.return_value = build_cloudflare_response()
        resp = client.post("/api/comments/generate", json={
            "deviceId": "device_123",
            "postText": "Most founders need more reps, not more advice.",
            "authorName": "Mina",
            "authorUsername": "@mina",
            "tone": "friendly",
        })

    assert resp.status_code == 200
    payload = get_cloudflare_payload(mock_post)
    system_prompt = payload["messages"][0]["content"]
    user_prompt = payload["messages"][1]["content"]

    assert "Only ask a question when the selected tone is curious." in system_prompt
    assert "For every other tone, do not ask a question and do not end with a question mark." in system_prompt
    assert "Question policy: do not ask a question for this tone." in user_prompt
    assert "Do not end the reply with a question mark." in user_prompt


def test_generate_comment_curious_tone_allows_one_question(client):
    with patch("app.routes.comments.httpx.post") as mock_post:
        mock_post.return_value = build_cloudflare_response()
        resp = client.post("/api/comments/generate", json={
            "deviceId": "device_123",
            "postText": "Most founders need more reps, not more advice.",
            "authorName": "Mina",
            "authorUsername": "@mina",
            "tone": "curious",
        })

    assert resp.status_code == 200
    user_prompt = get_cloudflare_payload(mock_post)["messages"][1]["content"]
    assert "Question policy: because the tone is curious, write exactly one specific question." in user_prompt


def test_generate_comment_request_values_override_saved_preferences(client, test_session):
    test_session.add(DevicePreference(
        device_id="device_123",
        user_voice="saved voice",
        viral_strategy="saved strategy",
        use_viral_strategy=True,
    ))
    test_session.commit()

    with patch("app.routes.comments.httpx.post") as mock_post:
        mock_post.return_value = build_cloudflare_response()
        resp = client.post("/api/comments/generate", json={
            "deviceId": "device_123",
            "postText": "Launch day shipped with all the usual surprises.",
            "authorName": "Jo",
            "authorUsername": "@jo",
            "tone": "relatable",
            "userVoice": "request voice",
            "viralStrategy": "request strategy",
        })

    assert resp.status_code == 200
    user_prompt = get_cloudflare_payload(mock_post)["messages"][1]["content"]
    assert "request voice" in user_prompt
    assert "request strategy" in user_prompt
    assert "saved voice" not in user_prompt
    assert "saved strategy" not in user_prompt


def test_generate_comment_request_values_are_saved_as_preferences(client, test_session):
    test_session.add(DevicePreference(
        device_id="device_123",
        user_voice="old saved voice",
        viral_strategy="old saved strategy",
        use_viral_strategy=False,
    ))
    test_session.commit()

    with patch("app.routes.comments.httpx.post") as mock_post:
        mock_post.return_value = build_cloudflare_response()
        resp = client.post("/api/comments/generate", json={
            "deviceId": "device_123",
            "postText": "A useful reply often beats a polished thread.",
            "authorName": "Lan",
            "authorUsername": "@lan",
            "tone": "friendly",
            "userVoice": "new user voice from popup",
            "viralStrategy": "new strategy from popup",
            "useViralStrategy": True,
        })

    assert resp.status_code == 200

    user_prompt = get_cloudflare_payload(mock_post)["messages"][1]["content"]
    assert "new user voice from popup" in user_prompt
    assert "new strategy from popup" in user_prompt

    saved = test_session.query(DevicePreference).filter_by(device_id="device_123").one()
    assert saved.user_voice == "new user voice from popup"
    assert saved.viral_strategy == "new strategy from popup"
    assert saved.use_viral_strategy is True


def test_generate_comment_uses_requested_allowed_model(client, monkeypatch):
    monkeypatch.setenv("CLOUDFLARE_AI_MODEL_OPTIONS", """[
        {"key": "@cf/deepseek-ai/deepseek-r1-distill-qwen-32b", "label": "DeepSeek"},
        {"key": "@cf/meta/llama-3.1-8b-instruct", "label": "Llama 3.1 8B"}
    ]""")

    with patch("app.routes.comments.httpx.post") as mock_post:
        mock_post.return_value = build_cloudflare_response()
        resp = client.post("/api/comments/generate", json={
            "deviceId": "device_123",
            "postText": "Small replies can create surprisingly good conversations.",
            "authorName": "Jo",
            "authorUsername": "@jo",
            "tone": "friendly",
            "model": "@cf/meta/llama-3.1-8b-instruct",
        })

    assert resp.status_code == 200
    assert mock_post.call_args.args[0] == (
        "https://api.cloudflare.com/client/v4/accounts/test-account"
        "/ai/run/@cf/meta/llama-3.1-8b-instruct"
    )


def test_generate_comment_rejects_unknown_model(client, monkeypatch):
    monkeypatch.setenv("CLOUDFLARE_AI_MODEL_OPTIONS", """[
        {"key": "@cf/deepseek-ai/deepseek-r1-distill-qwen-32b", "label": "DeepSeek"}
    ]""")

    with patch("app.routes.comments.httpx.post") as mock_post:
        resp = client.post("/api/comments/generate", json={
            "deviceId": "device_123",
            "postText": "Small replies can create surprisingly good conversations.",
            "authorName": "Jo",
            "authorUsername": "@jo",
            "tone": "friendly",
            "model": "@cf/not-a-real-model",
        })

    assert resp.status_code == 400
    assert resp.json()["error"]["code"] == "INVALID_MODEL"
    mock_post.assert_not_called()


def test_generate_comment_respects_disabled_saved_strategy(client, test_session):
    test_session.add(DevicePreference(
        device_id="device_123",
        user_voice="saved voice",
        viral_strategy="saved strategy",
        use_viral_strategy=False,
    ))
    test_session.commit()

    with patch("app.routes.comments.httpx.post") as mock_post:
        mock_post.return_value = build_cloudflare_response()
        resp = client.post("/api/comments/generate", json={
            "deviceId": "device_123",
            "postText": "Small replies can create surprisingly good conversations.",
            "authorName": "Jo",
            "authorUsername": "@jo",
            "tone": "curious",
        })

    assert resp.status_code == 200
    user_prompt = get_cloudflare_payload(mock_post)["messages"][1]["content"]
    assert "saved voice" in user_prompt
    assert "saved strategy" not in user_prompt


def test_generate_comment_accepts_extension_tones(client):
    with patch("app.routes.comments.httpx.post") as mock_post:
        mock_post.return_value = build_cloudflare_response()
        resp = client.post("/api/comments/generate", json={
            "deviceId": "device_123",
            "postText": "The best teams write decisions down before they feel obvious.",
            "authorName": "Jo",
            "authorUsername": "@jo",
            "tone": "meme",
        })

    assert resp.status_code == 200


def test_generate_comment_requires_device_id(client):
    resp = client.post("/api/comments/generate", json={
        "deviceId": "",
        "postText": "Small replies can create surprisingly good conversations.",
        "authorName": "Jo",
        "authorUsername": "@jo",
        "tone": "curious",
    })

    assert resp.status_code == 400
    assert resp.json()["error"]["code"] == "MISSING_DEVICE_ID"
