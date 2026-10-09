"""로컬 개발용 — Vercel 함수와 같은 handler 를 띄운다.

    python face_engine/model_store.py                 # 처음 한 번, face_engine/.models 로 모델을 받는다
    FACE_MODEL_DIR=face_engine/.models JWT_SECRET=... python face_engine/dev_server.py
    # Express 를 FACE_ENGINE_URL=http://localhost:5090 으로 띄우면 /api/face-engine/* 가 여기로 온다
"""
import os
import sys
from http.server import ThreadingHTTPServer

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from index import handler  # noqa: E402

if __name__ == "__main__":
    port = int(os.environ.get("FACE_ENGINE_PORT", "5090"))
    if not os.environ.get("FACE_MODEL_DIR"):
        default_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".models")
        if os.path.isdir(default_dir):
            os.environ["FACE_MODEL_DIR"] = default_dir
    print(f"face engine on http://127.0.0.1:{port} (models: {os.environ.get('FACE_MODEL_DIR') or 'download'})", flush=True)
    ThreadingHTTPServer(("127.0.0.1", port), handler).serve_forever()
