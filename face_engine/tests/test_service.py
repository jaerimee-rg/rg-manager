import io

import numpy as np
import pytest
from PIL import Image

import service
from model_store import ModelUnavailable
from test_auth_token import SECRET, sign

TOKEN = sign({"id": 7, "role": "parent", "exp": 4_000_000_000})


@pytest.fixture(autouse=True)
def secret(monkeypatch):
    monkeypatch.setenv("JWT_SECRET", SECRET)
    service.reset_engine()


def png(width=64, height=48):
    buffer = io.BytesIO()
    Image.fromarray(np.zeros((height, width, 3), dtype=np.uint8)).save(buffer, "PNG")
    return buffer.getvalue()


class FakeEngine:
    def __init__(self):
        self.seen = None

    def analyze(self, image):
        self.seen = image.shape
        return [{"box": {"x": 0.1, "y": 0.1, "w": 0.2, "h": 0.2}, "score": 0.9, "descriptor": [0.0] * 512}]


def detect(body=None, token=TOKEN, factory=None, method="POST", path="/api/face-engine/detect"):
    headers = {"Authorization": f"Bearer {token}"} if token else {}
    return service.handle(method, path, headers, png() if body is None else body, engine_factory=factory or FakeEngine)


def test_health_answers_without_loading_models():
    status, payload = service.handle("GET", "/api/face-engine/health", {}, b"")
    assert status == 200
    assert payload == {"ok": True, "ready": False, "analyzerVersion": 3}


def test_detect_returns_faces_with_the_analyzer_version_and_size():
    engine = FakeEngine()
    status, payload = detect(factory=lambda: engine)
    assert status == 200
    assert payload["analyzerVersion"] == 3
    assert (payload["width"], payload["height"]) == (64, 48)
    assert len(payload["faces"][0]["descriptor"]) == 512
    assert engine.seen == (48, 64, 3)


def test_detect_needs_a_login_token():
    assert detect(token=None)[0] == 401
    assert detect(token="garbage")[0] == 401


def test_an_expired_token_is_reported_like_the_node_api():
    status, payload = detect(token=sign({"id": 7, "role": "user", "exp": 1}))
    assert status == 401
    assert payload["tokenExpired"] is True


def test_bad_bodies_are_400_or_413():
    assert detect(body=b"")[0] == 400
    assert detect(body=b"not an image")[1]["reason"] == "unreadable_image"
    assert detect(body=b"x" * (service.MAX_BODY_BYTES + 1))[0] == 413


def test_missing_models_answer_503_so_the_browser_marks_the_photo_skipped():
    def unavailable():
        raise ModelUnavailable("offline")
    status, payload = detect(factory=unavailable)
    assert status == 503
    assert payload["reason"] == "engine_unavailable"


def test_other_paths_and_methods():
    assert detect(path="/api/face-engine/other")[0] == 404
    assert detect(method="GET")[0] == 405


def test_a_failed_download_is_not_retried_for_a_while(monkeypatch):
    calls = []

    def failing():
        calls.append(1)
        raise ModelUnavailable("offline")

    monkeypatch.setattr(service, "load_models", failing)
    for _ in range(3):
        with pytest.raises(ModelUnavailable):
            service.get_engine()
    assert len(calls) == 1
