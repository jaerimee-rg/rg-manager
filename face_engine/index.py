"""Vercel Python 함수 입구 — vercel.json 이 /api/face-engine/* 를 여기로 보낸다 (Express 보다 먼저).

처리는 service.py 에 있다. 로컬에서는 dev_server.py 가 같은 handler 를 띄우고 Express 가 그쪽으로 넘긴다
(server/utils/faceEngineProxy.js).
"""
import json
import os
import sys
import traceback
from http.server import BaseHTTPRequestHandler

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from service import MAX_BODY_BYTES, handle  # noqa: E402


class handler(BaseHTTPRequestHandler):
    def _send(self, status, payload):
        body = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def _dispatch(self, method):
        try:
            length = int(self.headers.get("Content-Length") or 0)
            if length > MAX_BODY_BYTES:
                return self._send(413, {"error": "사진이 너무 커요.", "reason": "too_large"})
            body = self.rfile.read(length) if length > 0 else b""
            status, payload = handle(method, self.path, self.headers, body)
        except Exception:  # 어떤 오류든 JSON 으로 — 브라우저는 '분석 못 함' 으로 넘어간다
            traceback.print_exc()
            status, payload = 500, {"error": "얼굴 분석 중 오류가 났어요.", "reason": "internal"}
        self._send(status, payload)

    def do_GET(self):
        self._dispatch("GET")

    def do_POST(self):
        self._dispatch("POST")

    def log_message(self, format, *args):  # noqa: A002 — 요청 줄마다 남기지 않는다
        return
