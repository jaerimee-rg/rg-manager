"""모델 없이 도는 엔진 테스트 — 정렬할 수 없는 얼굴 하나가 사진 전체를 실패시키지 않는지."""
import numpy as np

from engine import FaceEngine


class FakeRecognizer:
    def run(self, _outputs, feeds):
        batch = next(iter(feeds.values()))
        return [np.ones((batch.shape[0], 512), dtype=np.float32)]


def engine_without_models():
    engine = FaceEngine.__new__(FaceEngine)
    engine.recognizer = FakeRecognizer()
    engine.rec_input = "input.1"
    return engine


def test_unalignable_face_is_skipped_and_the_rest_are_embedded():
    image = np.zeros((200, 200, 3), dtype=np.uint8)
    collapsed = np.full((5, 2), 50.0)                                         # 다섯 점이 한 곳 — 정렬 불가
    normal = np.array([[70, 80], [110, 80], [90, 100], [75, 125], [105, 125]], dtype=np.float64)

    rows = engine_without_models().embed(image, [collapsed, normal])

    assert rows[0] is None
    assert rows[1].shape == (512,)
    assert abs(np.linalg.norm(rows[1]) - 1) < 1e-6


def test_no_alignable_face_gives_no_rows():
    rows = engine_without_models().embed(np.zeros((50, 50, 3), dtype=np.uint8), [np.zeros((5, 2))])
    assert rows == [None]
