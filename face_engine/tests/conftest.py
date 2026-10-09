import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ENGINE_DIR = os.path.dirname(HERE)
sys.path.insert(0, ENGINE_DIR)

# 실제 모델·사진이 필요한 테스트는 둘 다 있을 때만 돈다(모델은 저장소에 없다 — model_store.py 로 받는다).
MODEL_DIR = os.environ.get("FACE_MODEL_DIR") or os.path.join(ENGINE_DIR, ".models")
# 얼굴이 여럿 나온 사진 — 예: InsightFace 저장소의 python-package/insightface/data/images/t1.jpg
TEST_IMAGE = os.environ.get("FACE_TEST_IMAGE", "")
