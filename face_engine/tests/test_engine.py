"""실제 모델로 돌려 본다 — 모델(face_engine/.models 또는 FACE_MODEL_DIR)과 사진(FACE_TEST_IMAGE)이 있을 때만.

insightface 패키지가 깔린 개발 환경이면 같은 사진을 InsightFace FaceAnalysis(buffalo_l, 640)로도 돌려
얼굴 수·위치·특징값이 같은지 비교한다 — 우리가 다시 짠 전처리가 원본과 어긋나지 않았다는 증거다.
"""
import os

import numpy as np
import pytest

from conftest import MODEL_DIR, TEST_IMAGE

if not (os.path.isdir(MODEL_DIR) and os.path.isfile(TEST_IMAGE)):
    pytest.skip("모델 또는 테스트 사진이 없다", allow_module_level=True)

from engine import FaceEngine  # noqa: E402
from imaging import decode_image  # noqa: E402
from model_store import read_models  # noqa: E402


@pytest.fixture(scope="module")
def engine():
    return FaceEngine(read_models(MODEL_DIR))


@pytest.fixture(scope="module")
def image():
    with open(TEST_IMAGE, "rb") as handle:
        return decode_image(handle.read(), 1920)


def test_finds_faces_with_unit_length_512_dimension_descriptors(engine, image):
    faces = engine.analyze(image)
    assert len(faces) >= 2
    for face in faces:
        assert len(face["descriptor"]) == 512
        assert abs(np.linalg.norm(face["descriptor"]) - 1) < 1e-3
        assert 0 <= face["box"]["x"] <= 1 and 0 < face["box"]["w"] <= 1
    # 같은 사진 속 서로 다른 사람은 비슷하지 않다
    vectors = np.array([face["descriptor"] for face in faces])
    similarity = vectors @ vectors.T
    np.fill_diagonal(similarity, 0)
    assert similarity.max() < 0.5


def test_same_photo_twice_gives_the_same_descriptor(engine, image):
    first = engine.analyze(image)
    second = engine.analyze(image.copy())
    assert np.allclose(first[0]["descriptor"], second[0]["descriptor"], atol=1e-5)


def test_matches_insightface_face_analysis(engine, image):
    insightface_app = pytest.importorskip("insightface.app", reason="insightface 가 있는 개발 환경에서만")
    reference = insightface_app.FaceAnalysis(name=MODEL_DIR, allowed_modules=["detection", "recognition"],
                                            providers=["CPUExecutionProvider"])
    reference.prepare(ctx_id=-1, det_thresh=0.5, det_size=(640, 640))
    theirs = reference.get(image[:, :, ::-1].copy())   # insightface 는 BGR 을 받는다
    ours = engine.analyze(image)

    height, width = image.shape[:2]
    theirs = [face for face in theirs
              if min(face.bbox[2] - face.bbox[0], face.bbox[3] - face.bbox[1]) / max(width, height) >= 0.02]
    assert len(ours) == len(theirs)

    for face in theirs:
        x1, y1 = face.bbox[0] / width, face.bbox[1] / height
        match = min(ours, key=lambda o: abs(o["box"]["x"] - x1) + abs(o["box"]["y"] - y1))
        assert abs(match["box"]["x"] - x1) < 0.01 and abs(match["box"]["y"] - y1) < 0.01
        similarity = float(np.dot(match["descriptor"], face.normed_embedding))
        assert similarity > 0.98, similarity
