from app.models import DevicePreference


def test_get_preferences_returns_defaults_for_new_device(client):
    resp = client.get("/api/preferences", params={"deviceId": "device_123"})

    assert resp.status_code == 200
    assert resp.json() == {
        "ok": True,
        "preferences": {
            "deviceId": "device_123",
            "userVoice": "",
            "viralStrategy": "",
            "useViralStrategy": True,
        },
    }


def test_put_preferences_upserts_device_preferences(client, test_session):
    resp = client.put("/api/preferences", json={
        "deviceId": "device_123",
        "userVoice": "casual, precise, lowercase",
        "viralStrategy": "add one useful observation and leave room for reply",
        "useViralStrategy": True,
    })

    assert resp.status_code == 200
    assert resp.json()["preferences"] == {
        "deviceId": "device_123",
        "userVoice": "casual, precise, lowercase",
        "viralStrategy": "add one useful observation and leave room for reply",
        "useViralStrategy": True,
    }

    saved = test_session.query(DevicePreference).filter_by(device_id="device_123").one()
    assert saved.user_voice == "casual, precise, lowercase"
    assert saved.viral_strategy == "add one useful observation and leave room for reply"
    assert saved.use_viral_strategy is True


def test_put_preferences_can_disable_strategy(client, test_session):
    test_session.add(DevicePreference(
        device_id="device_123",
        user_voice="old",
        viral_strategy="old strategy",
        use_viral_strategy=True,
    ))
    test_session.commit()

    resp = client.put("/api/preferences", json={
        "deviceId": "device_123",
        "userVoice": "new voice",
        "viralStrategy": "new strategy",
        "useViralStrategy": False,
    })

    assert resp.status_code == 200
    assert resp.json()["preferences"]["useViralStrategy"] is False

    saved = test_session.query(DevicePreference).filter_by(device_id="device_123").one()
    assert saved.user_voice == "new voice"
    assert saved.viral_strategy == "new strategy"
    assert saved.use_viral_strategy is False


def test_preferences_require_device_id(client):
    get_resp = client.get("/api/preferences", params={"deviceId": ""})
    put_resp = client.put("/api/preferences", json={"deviceId": ""})

    assert get_resp.status_code == 400
    assert get_resp.json()["error"]["code"] == "MISSING_DEVICE_ID"
    assert put_resp.status_code == 400
    assert put_resp.json()["error"]["code"] == "MISSING_DEVICE_ID"
