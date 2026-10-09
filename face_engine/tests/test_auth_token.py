import base64
import hashlib
import hmac
import json

import pytest

from auth_token import TokenError, user_from_authorization, verify_jwt

SECRET = "local-dev-secret"


def b64(data):
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def sign(payload, secret=SECRET, header=None):
    head = b64(json.dumps(header or {"alg": "HS256", "typ": "JWT"}).encode())
    body = b64(json.dumps(payload).encode())
    signature = hmac.new(secret.encode(), f"{head}.{body}".encode(), hashlib.sha256).digest()
    return f"{head}.{body}.{b64(signature)}"


def test_accepts_a_login_token_signed_with_the_app_secret():
    token = sign({"id": 7, "username": "선생님", "role": "user", "exp": 4_000_000_000})
    assert user_from_authorization(f"Bearer {token}", SECRET)["id"] == 7


def test_accepts_the_header_without_bearer_like_the_node_middleware():
    token = sign({"id": 3, "role": "parent"})
    assert user_from_authorization(token, SECRET)["role"] == "parent"


def test_rejects_a_wrong_secret():
    token = sign({"id": 7, "role": "user"}, secret="other")
    with pytest.raises(TokenError):
        user_from_authorization(f"Bearer {token}", SECRET)


def test_rejects_an_expired_token_and_says_so():
    token = sign({"id": 7, "role": "user", "exp": 1000})
    with pytest.raises(TokenError) as raised:
        verify_jwt(token, SECRET, now=2000)
    assert raised.value.expired


def test_rejects_alg_none_even_without_a_signature():
    head = b64(json.dumps({"alg": "none"}).encode())
    body = b64(json.dumps({"id": 1, "role": "admin"}).encode())
    with pytest.raises(TokenError):
        verify_jwt(f"{head}.{body}.", SECRET)


def test_rejects_a_drive_state_token_signed_with_the_same_secret():
    token = sign({"userId": 7, "purpose": "drive_connect"})
    with pytest.raises(TokenError):
        user_from_authorization(f"Bearer {token}", SECRET)


@pytest.mark.parametrize("value", [None, "", "Bearer ", "a.b", "not-a-token"])
def test_rejects_missing_or_malformed_values(value):
    with pytest.raises(TokenError):
        user_from_authorization(value, SECRET)
