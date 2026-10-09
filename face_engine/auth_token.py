"""앱 로그인 토큰(JWT, HS256) 확인 — server/middleware/auth.js 의 jwt.verify 와 같은 규칙.

의존성을 늘리지 않으려고 표준 라이브러리로 직접 검사한다. 얼굴 분석은 데이터를 읽거나 쓰지 않으므로
서명·만료만 보면 된다(누구의 앨범인지는 결과를 저장하는 Node API 가 따로 확인한다).
"""
import base64
import hashlib
import hmac
import json
import time

# server/middleware/auth.js 와 같은 기본값 — 환경변수가 없는 로컬에서도 두 서버가 같은 토큰을 받는다.
DEFAULT_SECRET = "your-secret-key-change-in-production"
ALLOWED_ROLES = ("admin", "user", "parent")


class TokenError(Exception):
    def __init__(self, message, expired=False):
        super().__init__(message)
        self.expired = expired


def _b64decode(part):
    return base64.urlsafe_b64decode(part + "=" * (-len(part) % 4))


def verify_jwt(token, secret, now=None):
    """서명과 만료를 확인하고 내용(claims)을 돌려준다. 틀리면 TokenError."""
    parts = token.split(".") if isinstance(token, str) else []
    if len(parts) != 3:
        raise TokenError("malformed token")
    try:
        header = json.loads(_b64decode(parts[0]))
        payload = json.loads(_b64decode(parts[1]))
        signature = _b64decode(parts[2])
    except (ValueError, json.JSONDecodeError) as error:
        raise TokenError("malformed token") from error

    # 알고리즘은 토큰이 말하는 대로 믿지 않는다 — 'none' 이나 다른 알고리즘으로 바꿔치기를 막는다.
    if not isinstance(header, dict) or header.get("alg") != "HS256":
        raise TokenError("unsupported algorithm")

    expected = hmac.new(secret.encode("utf-8"), f"{parts[0]}.{parts[1]}".encode("ascii"), hashlib.sha256).digest()
    if not hmac.compare_digest(expected, signature):
        raise TokenError("bad signature")
    if not isinstance(payload, dict):
        raise TokenError("malformed token")

    current = time.time() if now is None else now
    if isinstance(payload.get("exp"), (int, float)) and current >= payload["exp"]:
        raise TokenError("expired", expired=True)
    if isinstance(payload.get("nbf"), (int, float)) and current < payload["nbf"]:
        raise TokenError("not active yet")
    return payload


def user_from_authorization(value, secret):
    """Authorization 헤더 → 로그인한 사용자 claims.

    Drive 연결용 state 토큰(purpose 가 있음)처럼 같은 비밀로 서명한 다른 용도의 토큰은 받지 않는다.
    """
    if not value:
        raise TokenError("missing token")
    token = value[7:] if value.startswith("Bearer ") else value
    claims = verify_jwt(token.strip(), secret)
    if "purpose" in claims or not claims.get("id") or claims.get("role") not in ALLOWED_ROLES:
        raise TokenError("not a login token")
    return claims
