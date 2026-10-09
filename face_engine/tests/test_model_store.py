import hashlib
import io
import random
import zipfile

import pytest

import model_store
from model_store import ModelUnavailable, download_models, read_models, write_models

DETECTOR = b"detector-weights" * 1000
RECOGNIZER = random.Random(2).randbytes(300_000)   # PART_BYTES(아래 100KB)보다 커서 여러 조각으로 나눠 받는다


@pytest.fixture
def pinned(monkeypatch):
    monkeypatch.setattr(model_store, "MODELS", {
        "det_10g.onnx": {"size": len(DETECTOR), "sha256": hashlib.sha256(DETECTOR).hexdigest()},
        "w600k_r50.onnx": {"size": len(RECOGNIZER), "sha256": hashlib.sha256(RECOGNIZER).hexdigest()},
    })
    monkeypatch.setattr(model_store, "PART_BYTES", 100_000)
    monkeypatch.setattr(model_store, "TAIL_BYTES", 4096)


def make_pack(files):
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as pack:
        # 받지 않을 다른 모델 — 압축되지 않는 바이트로 크게 만들어 "zip 전체를 받지 않는다" 를 볼 수 있게
        pack.writestr("genderage.onnx", random.Random(1).randbytes(200_000), compress_type=zipfile.ZIP_DEFLATED)
        for name, data in files.items():
            pack.writestr(name, data, compress_type=zipfile.ZIP_DEFLATED)
    return buffer.getvalue()


def range_server(pack, calls):
    def http_range(url, start, end):
        calls.append((url, start, end))
        return pack[start:end + 1], "https://resolved.example/pack.zip", len(pack)
    return http_range


def test_downloads_only_the_two_models_and_verifies_them(pinned):
    calls = []
    pack = make_pack({"det_10g.onnx": DETECTOR, "w600k_r50.onnx": RECOGNIZER})
    models = download_models("https://example/pack.zip", range_server(pack, calls))

    assert models == {"det_10g.onnx": DETECTOR, "w600k_r50.onnx": RECOGNIZER}
    # 첫 요청만 원래 주소, 나머지는 리다이렉트된 주소로 — 그리고 zip 전체를 받지는 않는다
    assert calls[0][0] == "https://example/pack.zip"
    assert all(url == "https://resolved.example/pack.zip" for url, _s, _e in calls[1:])
    assert sum(end - start + 1 for _u, start, end in calls[1:]) < len(pack)


def test_refuses_a_pack_whose_model_changed(pinned):
    pack = make_pack({"det_10g.onnx": DETECTOR, "w600k_r50.onnx": RECOGNIZER[:-1] + b"!"})
    with pytest.raises(ModelUnavailable):
        download_models("https://example/pack.zip", range_server(pack, []))


def test_refuses_a_pack_without_the_model(pinned):
    pack = make_pack({"det_10g.onnx": DETECTOR})
    with pytest.raises(ModelUnavailable):
        download_models("https://example/pack.zip", range_server(pack, []))


def test_network_errors_become_model_unavailable(pinned):
    def broken(url, start, end):
        raise OSError("connection reset")
    with pytest.raises(ModelUnavailable):
        download_models("https://example/pack.zip", broken)


def test_reads_back_what_it_wrote_and_rejects_a_tampered_file(pinned, tmp_path):
    write_models(tmp_path, {"det_10g.onnx": DETECTOR, "w600k_r50.onnx": RECOGNIZER})
    assert read_models(tmp_path)["det_10g.onnx"] == DETECTOR

    (tmp_path / "det_10g.onnx").write_bytes(b"tampered")
    with pytest.raises(ModelUnavailable):
        read_models(tmp_path)


def test_load_prefers_the_cache_before_downloading(pinned, tmp_path, monkeypatch):
    write_models(tmp_path, {"det_10g.onnx": DETECTOR, "w600k_r50.onnx": RECOGNIZER})
    monkeypatch.delenv("FACE_MODEL_DIR", raising=False)
    monkeypatch.setenv("FACE_MODEL_CACHE", str(tmp_path))
    monkeypatch.setattr(model_store, "download_models", lambda: pytest.fail("should not download"))
    assert model_store.load_models()["w600k_r50.onnx"] == RECOGNIZER
