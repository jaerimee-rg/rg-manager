"""개발 환경(cv2 · scikit-image 가 있을 때)에서만 — 다시 짠 계산이 InsightFace 가 쓰는 것과 같은지."""
import numpy as np
import pytest

from imaging import resize_bilinear, similarity_transform, warp_affine

RNG = np.random.default_rng(11)
cv2 = pytest.importorskip("cv2", reason="cv2 가 있는 개발 환경에서만 InsightFace 와 같은 결과인지 비교한다")


def test_resize_matches_cv2_inter_linear():
    image = RNG.integers(0, 255, (1280, 1920, 3), dtype=np.uint8)
    ours = resize_bilinear(image, 640, 426).astype(int)
    theirs = cv2.resize(image, (640, 426)).astype(int)
    assert np.abs(ours - theirs).max() <= 1


def test_warp_matches_cv2_warp_affine():
    image = RNG.integers(0, 255, (480, 640, 3), dtype=np.uint8)
    matrix = np.array([[0.42, -0.11, -60.0], [0.11, 0.42, -70.0]])
    ours = warp_affine(image, matrix, 112).astype(int)
    theirs = cv2.warpAffine(image, matrix, (112, 112), borderValue=0.0).astype(int)
    assert np.abs(ours - theirs).max() <= 1


def test_similarity_matches_skimage():
    transform = pytest.importorskip("skimage.transform")
    src = RNG.uniform(100, 300, (5, 2))
    dst = np.array([[38.2946, 51.6963], [73.5318, 51.5014], [56.0252, 71.7366], [41.5493, 92.3655], [70.7299, 92.2041]])
    reference = transform.SimilarityTransform()
    reference.estimate(src, dst)
    assert np.allclose(similarity_transform(src, dst), reference.params[:2], atol=1e-9)
