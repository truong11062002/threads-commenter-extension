from app.models import DevicePreference, GenerationLog


def test_device_preference_creation():
    pref = DevicePreference(
        device_id="device_abc",
        user_voice="warm and concise",
        viral_strategy="invite thoughtful replies",
        use_viral_strategy=False,
    )

    assert pref.device_id == "device_abc"
    assert pref.user_voice == "warm and concise"
    assert pref.viral_strategy == "invite thoughtful replies"
    assert pref.use_viral_strategy is False


def test_generation_log_creation():
    log = GenerationLog(
        device_id="device_abc",
        tone="insightful",
        page_url="https://www.threads.net/@user/post/abc",
        input_chars=100,
        output_chars=50,
    )

    assert log.device_id == "device_abc"
    assert log.tone == "insightful"
