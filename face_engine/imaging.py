"""사진 읽기 · 크기 줄이기 · 얼굴 정렬 — numpy 와 Pillow 만 쓴다.

OpenCV 를 넣으면 Vercel Python 함수(500MB)가 모자라서 InsightFace 가 쓰는 cv2 동작
(cv2.resize INTER_LINEAR, cv2.warpAffine, skimage SimilarityTransform)을 여기서 그대로 흉내 낸다.
tests/test_parity.py 가 cv2·skimage 와 같은 결과를 내는지 확인한다(개발 환경에만 있음).
"""
import io

import numpy as np
from PIL import Image, ImageOps

# 압축 폭탄 방지 — 5천만 화소의 두 배를 넘으면 Pillow 가 DecompressionBombError 를 던진다.
Image.MAX_IMAGE_PIXELS = 50_000_000


class ImageDecodeError(ValueError):
    """사진으로 읽을 수 없는 본문"""


def decode_image(data, max_side):
    """바이트 → RGB uint8 배열 (H, W, 3). EXIF 회전을 적용하고 긴 변을 max_side 이하로 줄인다."""
    try:
        with Image.open(io.BytesIO(data)) as image:
            image = ImageOps.exif_transpose(image).convert("RGB")
            width, height = image.size
            scale = min(1.0, max_side / max(width, height))
            if scale < 1.0:
                image = image.resize((max(1, round(width * scale)), max(1, round(height * scale))), Image.BILINEAR)
            return np.asarray(image, dtype=np.uint8)
    except (OSError, ValueError, Image.DecompressionBombError) as error:
        raise ImageDecodeError(str(error)) from error


def resize_bilinear(image, out_width, out_height):
    """cv2.resize(INTER_LINEAR) 와 같은 방식 — 화소 중심을 맞추고 가장자리는 늘려 쓴다(줄일 때 흐리게 하지 않음)."""
    height, width = image.shape[:2]
    xs = np.clip((np.arange(out_width) + 0.5) * (width / out_width) - 0.5, 0, width - 1)
    ys = np.clip((np.arange(out_height) + 0.5) * (height / out_height) - 0.5, 0, height - 1)
    x0 = np.floor(xs).astype(np.int64)
    y0 = np.floor(ys).astype(np.int64)
    x1 = np.minimum(x0 + 1, width - 1)
    y1 = np.minimum(y0 + 1, height - 1)
    wx = (xs - x0)[None, :, None].astype(np.float32)
    wy = (ys - y0)[:, None, None].astype(np.float32)

    pixels = image.astype(np.float32)
    top = pixels[y0][:, x0] * (1 - wx) + pixels[y0][:, x1] * wx
    bottom = pixels[y1][:, x0] * (1 - wx) + pixels[y1][:, x1] * wx
    return np.clip(np.rint(top * (1 - wy) + bottom * wy), 0, 255).astype(np.uint8)


def warp_affine(image, matrix, size):
    """cv2.warpAffine(image, matrix, (size, size), borderValue=0) — matrix 는 원본 → 결과 좌표 2×3."""
    full = np.vstack([matrix, [0.0, 0.0, 1.0]])
    inverse = np.linalg.inv(full)[:2]
    grid_x, grid_y = np.meshgrid(np.arange(size, dtype=np.float64), np.arange(size, dtype=np.float64))
    src_x = inverse[0, 0] * grid_x + inverse[0, 1] * grid_y + inverse[0, 2]
    src_y = inverse[1, 0] * grid_x + inverse[1, 1] * grid_y + inverse[1, 2]

    height, width = image.shape[:2]
    x0 = np.floor(src_x).astype(np.int64)
    y0 = np.floor(src_y).astype(np.int64)
    fx = (src_x - x0)[..., None]
    fy = (src_y - y0)[..., None]
    pixels = image.astype(np.float64)

    def sample(ys, xs):
        inside = ((xs >= 0) & (xs < width) & (ys >= 0) & (ys < height))[..., None]
        return pixels[np.clip(ys, 0, height - 1), np.clip(xs, 0, width - 1)] * inside

    out = (sample(y0, x0) * (1 - fx) * (1 - fy) + sample(y0, x0 + 1) * fx * (1 - fy)
           + sample(y0 + 1, x0) * (1 - fx) * fy + sample(y0 + 1, x0 + 1) * fx * fy)
    return np.clip(np.rint(out), 0, 255).astype(np.uint8)


def similarity_transform(src, dst):
    """skimage.transform.SimilarityTransform().estimate(src, dst) 와 같은 Umeyama 추정 → 2×3 행렬."""
    src = np.asarray(src, dtype=np.float64)
    dst = np.asarray(dst, dtype=np.float64)
    count, dim = src.shape
    src_mean = src.mean(axis=0)
    dst_mean = dst.mean(axis=0)
    src_d = src - src_mean
    dst_d = dst - dst_mean

    cov = dst_d.T @ src_d / count
    signs = np.ones(dim)
    if np.linalg.det(cov) < 0:
        signs[dim - 1] = -1

    transform = np.eye(dim + 1)
    u, singular, vt = np.linalg.svd(cov)
    rank = np.linalg.matrix_rank(cov)
    if rank == 0:
        raise ValueError("landmarks are degenerate")
    if rank == dim - 1:
        if np.linalg.det(u) * np.linalg.det(vt) > 0:
            transform[:dim, :dim] = u @ vt
        else:
            keep = signs[dim - 1]
            signs[dim - 1] = -1
            transform[:dim, :dim] = u @ np.diag(signs) @ vt
            signs[dim - 1] = keep
    else:
        transform[:dim, :dim] = u @ np.diag(signs) @ vt

    scale = 1.0 / src_d.var(axis=0).sum() * (singular @ signs)
    transform[:dim, dim] = dst_mean - scale * (transform[:dim, :dim] @ src_mean)
    transform[:dim, :dim] *= scale
    return transform[:2]
