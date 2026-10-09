import io

import numpy as np
import pytest
from PIL import Image

from imaging import ImageDecodeError, decode_image, resize_bilinear, similarity_transform, warp_affine

RNG = np.random.default_rng(7)


def jpeg_bytes(width, height, orientation=None):
    image = Image.fromarray(RNG.integers(0, 255, (height, width, 3), dtype=np.uint8))
    buffer = io.BytesIO()
    if orientation:
        exif = Image.Exif()
        exif[0x0112] = orientation
        image.save(buffer, "JPEG", exif=exif)
    else:
        image.save(buffer, "JPEG")
    return buffer.getvalue()


def test_decode_shrinks_to_the_long_side_and_keeps_rgb():
    image = decode_image(jpeg_bytes(4000, 3000), 1920)
    assert image.shape == (1440, 1920, 3)
    assert image.dtype == np.uint8


def test_decode_applies_exif_rotation():
    # orientation 6 = 시계 방향 90도 — 가로로 저장된 세로 사진
    image = decode_image(jpeg_bytes(400, 300, orientation=6), 1920)
    assert image.shape[:2] == (400, 300)


def test_decode_rejects_bytes_that_are_not_an_image():
    with pytest.raises(ImageDecodeError):
        decode_image(b"not an image", 1920)


def test_similarity_transform_recovers_a_known_rotation_scale_and_shift():
    angle = np.deg2rad(20)
    scale = 1.7
    rotation = np.array([[np.cos(angle), -np.sin(angle)], [np.sin(angle), np.cos(angle)]]) * scale
    src = RNG.uniform(0, 100, (5, 2))
    dst = src @ rotation.T + np.array([12.0, -4.0])
    matrix = similarity_transform(src, dst)
    assert np.allclose(matrix[:, :2], rotation, atol=1e-9)
    assert np.allclose(matrix[:, 2], [12.0, -4.0], atol=1e-9)


def test_warp_affine_with_identity_copies_the_top_left_corner():
    image = RNG.integers(0, 255, (200, 200, 3), dtype=np.uint8)
    out = warp_affine(image, np.array([[1.0, 0, 0], [0, 1.0, 0]]), 112)
    assert np.array_equal(out, image[:112, :112])


def test_warp_affine_fills_outside_with_black():
    image = np.full((50, 50, 3), 200, dtype=np.uint8)
    out = warp_affine(image, np.array([[1.0, 0, 30], [0, 1.0, 30]]), 112)   # 원본이 (30,30) 부터 그려진다
    assert out[0, 0].tolist() == [0, 0, 0]
    assert out[40, 40].tolist() == [200, 200, 200]
