"""얼굴 찾기(SCRFD det_10g) + 특징값(ArcFace w600k_r50, 512차원).

InsightFace FaceAnalysis(buffalo_l, det_size 640) 와 같은 계산을 onnxruntime 으로 직접 한다
(insightface 패키지는 opencv·scipy·scikit-image 를 끌고 와 Vercel 함수 용량을 넘는다).
전처리 숫자는 insightface/model_zoo/scrfd.py · arcface_onnx.py 에서 그대로 옮겼다.
"""
import numpy as np
import onnxruntime

from imaging import resize_bilinear, similarity_transform, warp_affine

DET_SIZE = 640
DET_THRESHOLD = 0.5
NMS_THRESHOLD = 0.4
STRIDES = (8, 16, 32)
ANCHORS_PER_CELL = 2

# 짧은 변이 사진 긴 변의 2% 미만인 얼굴은 특징값이 흔들려 뺀다(예전 브라우저 분석과 같은 기준).
MIN_FACE_RATIO = 0.02
MAX_FACES = 50

# ArcFace 가 기대하는 112×112 안의 눈·코·입 위치 (insightface/utils/face_align.py arcface_dst)
ARCFACE_DST = np.array(
    [[38.2946, 51.6963], [73.5318, 51.5014], [56.0252, 71.7366], [41.5493, 92.3655], [70.7299, 92.2041]],
    dtype=np.float64,
)
ALIGNED_SIZE = 112


def _session(model_bytes):
    options = onnxruntime.SessionOptions()
    options.log_severity_level = 3
    return onnxruntime.InferenceSession(model_bytes, options, providers=["CPUExecutionProvider"])


def nms(dets, threshold=NMS_THRESHOLD):
    """dets: (N, 5) [x1, y1, x2, y2, score] 점수 내림차순 → 남길 행 번호 (insightface SCRFD.nms 와 같다)"""
    x1, y1, x2, y2, scores = dets[:, 0], dets[:, 1], dets[:, 2], dets[:, 3], dets[:, 4]
    areas = (x2 - x1 + 1) * (y2 - y1 + 1)
    order = np.argsort(-scores, kind="stable")
    keep = []
    while order.size > 0:
        i = order[0]
        keep.append(int(i))
        xx1 = np.maximum(x1[i], x1[order[1:]])
        yy1 = np.maximum(y1[i], y1[order[1:]])
        xx2 = np.minimum(x2[i], x2[order[1:]])
        yy2 = np.minimum(y2[i], y2[order[1:]])
        inter = np.maximum(0.0, xx2 - xx1 + 1) * np.maximum(0.0, yy2 - yy1 + 1)
        overlap = inter / (areas[i] + areas[order[1:]] - inter)
        order = order[np.where(overlap <= threshold)[0] + 1]
    return keep


class FaceEngine:
    def __init__(self, models):
        self.detector = _session(models["det_10g.onnx"])
        self.recognizer = _session(models["w600k_r50.onnx"])
        self.det_input = self.detector.get_inputs()[0].name
        self.det_outputs = [output.name for output in self.detector.get_outputs()]
        self.rec_input = self.recognizer.get_inputs()[0].name
        self._centers = {}

    def _anchor_centers(self, height, width, stride):
        key = (height, width, stride)
        if key not in self._centers:
            centers = np.stack(np.mgrid[:height, :width][::-1], axis=-1).astype(np.float32)
            centers = (centers * stride).reshape(-1, 2)
            self._centers[key] = np.repeat(centers, ANCHORS_PER_CELL, axis=0)
        return self._centers[key]

    def detect(self, image):
        """RGB 이미지 → (boxes (N, 5) 원본 좌표 + 점수, landmarks (N, 5, 2))"""
        height, width = image.shape[:2]
        if height / width > 1.0:
            new_height = DET_SIZE
            new_width = max(1, int(new_height / (height / width)))
        else:
            new_width = DET_SIZE
            new_height = max(1, int(new_width * (height / width)))
        scale = new_height / height

        canvas = np.zeros((DET_SIZE, DET_SIZE, 3), dtype=np.uint8)
        canvas[:new_height, :new_width] = resize_bilinear(image, new_width, new_height)
        blob = ((canvas.astype(np.float32) - 127.5) / 128.0).transpose(2, 0, 1)[None]
        outputs = self.detector.run(self.det_outputs, {self.det_input: blob})

        boxes, points = [], []
        count = len(STRIDES)
        for index, stride in enumerate(STRIDES):
            scores = outputs[index].reshape(-1)
            distances = outputs[index + count] * stride
            landmarks = outputs[index + count * 2] * stride
            centers = self._anchor_centers(DET_SIZE // stride, DET_SIZE // stride, stride)
            keep = scores >= DET_THRESHOLD
            if not keep.any():
                continue
            c, d, k = centers[keep], distances[keep], landmarks[keep]
            boxes.append(np.column_stack([c[:, 0] - d[:, 0], c[:, 1] - d[:, 1], c[:, 0] + d[:, 2], c[:, 1] + d[:, 3], scores[keep]]))
            points.append((np.tile(c, 5) + k).reshape(-1, 5, 2))

        if not boxes:
            return np.empty((0, 5), dtype=np.float32), np.empty((0, 5, 2), dtype=np.float32)
        dets = np.vstack(boxes).astype(np.float32)
        kpss = np.vstack(points).astype(np.float32)
        dets[:, :4] /= scale
        kpss /= scale
        order = np.argsort(-dets[:, 4], kind="stable")
        dets, kpss = dets[order], kpss[order]
        keep = nms(dets)
        return dets[keep], kpss[keep]

    def embed(self, image, landmarks):
        """얼굴마다 정렬한 112×112 → 길이 1 로 맞춘 512차원 특징값 (N, 512)"""
        if len(landmarks) == 0:
            return np.empty((0, 512), dtype=np.float32)
        crops = [warp_affine(image, similarity_transform(points, ARCFACE_DST), ALIGNED_SIZE) for points in landmarks]
        blob = ((np.stack(crops).astype(np.float32) - 127.5) / 127.5).transpose(0, 3, 1, 2)
        features = self.recognizer.run(None, {self.rec_input: np.ascontiguousarray(blob)})[0]
        norms = np.linalg.norm(features, axis=1, keepdims=True)
        return features / np.maximum(norms, 1e-12)

    def analyze(self, image):
        """→ [{ box: {x, y, w, h} 0~1, score, descriptor: [512] }] — 점수 높은 순, 작은 얼굴 제외"""
        height, width = image.shape[:2]
        long_side = max(width, height)
        dets, kpss = self.detect(image)

        chosen = [i for i, det in enumerate(dets)
                  if min(det[2] - det[0], det[3] - det[1]) / long_side >= MIN_FACE_RATIO][:MAX_FACES]
        features = self.embed(image, kpss[chosen])

        clamp = lambda value: float(min(1.0, max(0.0, value)))  # noqa: E731
        faces = []
        for row, index in enumerate(chosen):
            x1, y1, x2, y2, score = (float(v) for v in dets[index])
            faces.append({
                "box": {"x": clamp(x1 / width), "y": clamp(y1 / height),
                        "w": clamp((x2 - x1) / width), "h": clamp((y2 - y1) / height)},
                "score": round(score, 3),
                "descriptor": [round(float(v), 6) for v in features[row]],
            })
        return faces
