"""요청 하나를 처리한다 — Vercel 함수(index.py)와 로컬 개발 서버(dev_server.py)가 함께 쓴다.

POST …/detect   본문 = 사진 바이트(JPEG·PNG·WebP), Authorization = 앱 로그인 토큰
                → 200 { faces: [{box, score, descriptor[512]}], analyzerVersion, width, height }
GET  …/health   → 200 { ok, ready, analyzerVersion }  (모델을 받지는 않는다)

실패는 모두 JSON { error, reason } 이다. 브라우저(faceClient.js)는 200 이 아니면 '분석 못 함'(null) 으로
처리하고 업로드는 그대로 이어 간다.
"""
import os
import threading
import time

from auth_token import DEFAULT_SECRET, TokenError, user_from_authorization
from imaging import ImageDecodeError, decode_image
from model_store import ModelUnavailable, load_models

# 얼굴을 찾는 방식의 버전 — client/src/utils/faceClient.js 와 server/utils/faceVector.js 의 값과 같아야 한다.
#   3 — InsightFace buffalo_l (SCRFD det_10g 640 + ArcFace w600k_r50, 512차원), 서버에서 분석 (2026-10)
ANALYZER_VERSION = 3

# Vercel 은 요청 본문을 4.5MB 에서 자른다. 브라우저는 긴 변 1920px JPEG(1MB 안팎)를 보낸다.
MAX_BODY_BYTES = 4_500_000
ANALYSIS_LONG_SIDE = 1920

_engine = None
_engine_lock = threading.Lock()
_last_failure = 0.0
# 배포처가 잠깐 막혔을 때 요청마다 289MB 짜리 zip 을 다시 두드리지 않게 잠시 쉰다.
RETRY_AFTER_FAILURE_SECONDS = 30


def get_engine():
    """모델을 한 번만 받아 엔진을 만든다(동시에 들어온 요청은 기다렸다 같은 엔진을 쓴다)."""
    global _engine, _last_failure
    if _engine is not None:
        return _engine
    with _engine_lock:
        if _engine is not None:
            return _engine
        if time.time() - _last_failure < RETRY_AFTER_FAILURE_SECONDS:
            raise ModelUnavailable("recent model download failed")
        try:
            from engine import FaceEngine  # onnxruntime 을 불러오는 데 시간이 들어 health 요청은 건너뛴다
            _engine = FaceEngine(load_models())
        except ModelUnavailable:
            _last_failure = time.time()
            raise
        except Exception as error:  # 세션을 못 만들면(런타임 오류 등) 받은 모델과 같게 취급 — 503 + 잠시 쉼
            _last_failure = time.time()
            raise ModelUnavailable(f"engine init failed: {error}") from error
        return _engine


def engine_ready():
    return _engine is not None


def reset_engine():
    """테스트용"""
    global _engine, _last_failure
    _engine = None
    _last_failure = 0.0


def _secret():
    return os.environ.get("JWT_SECRET") or DEFAULT_SECRET


def handle(method, path, headers, body, engine_factory=get_engine):
    """→ (상태 코드, JSON 으로 보낼 dict)"""
    route = path.split("?", 1)[0].rstrip("/")
    if method == "GET" and route.endswith("/health"):
        return 200, {"ok": True, "ready": engine_ready(), "analyzerVersion": ANALYZER_VERSION}
    if not route.endswith("/detect"):
        return 404, {"error": "찾을 수 없는 주소예요.", "reason": "not_found"}
    if method != "POST":
        return 405, {"error": "POST 로 보내 주세요.", "reason": "method_not_allowed"}

    try:
        user_from_authorization(headers.get("Authorization") or headers.get("authorization"), _secret())
    except TokenError as error:
        payload = {"error": "로그인이 필요해요.", "reason": "unauthorized"}
        if error.expired:
            payload["tokenExpired"] = True
        return 401, payload

    if not body:
        return 400, {"error": "사진이 비어 있어요.", "reason": "empty_body"}
    if len(body) > MAX_BODY_BYTES:
        return 413, {"error": "사진이 너무 커요.", "reason": "too_large"}

    try:
        image = decode_image(body, ANALYSIS_LONG_SIDE)
    except ImageDecodeError:
        return 400, {"error": "사진을 읽지 못했어요.", "reason": "unreadable_image"}

    try:
        engine = engine_factory()
    except ModelUnavailable as error:
        print(f"face engine unavailable: {error}", flush=True)
        return 503, {"error": "얼굴 분석을 지금 할 수 없어요.", "reason": "engine_unavailable"}

    faces = engine.analyze(image)
    height, width = image.shape[:2]
    return 200, {"faces": faces, "analyzerVersion": ANALYZER_VERSION, "width": width, "height": height}
