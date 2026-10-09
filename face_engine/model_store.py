"""InsightFace buffalo_l 모델 두 개를 공식 배포처에서 받아 온다.

모델은 **비상업 연구용 라이선스**라 이 저장소(공개)에 넣지 않는다. 대신 함수가 처음 켜질 때
InsightFace 가 GitHub Release 에 올려 둔 buffalo_l.zip(약 289MB)에서 필요한 두 파일만
HTTP Range 로 골라 받는다(약 176MB). 받은 파일은 크기와 SHA-256 을 확인한 뒤에만 쓴다 —
배포처의 파일이 바뀌면 분석을 멈추고(503) 바뀐 줄 알 수 있게 한다.

로컬 개발: `python face_engine/model_store.py <폴더>` 로 한 번 받아 두고 FACE_MODEL_DIR 로 가리킨다.
"""
import hashlib
import os
import struct
import sys
import urllib.request
import zlib
from concurrent.futures import ThreadPoolExecutor

PACK_URL = "https://github.com/deepinsight/insightface/releases/download/v0.7/buffalo_l.zip"

# 실험(2026-10, 운영 사진 102장)에 쓴 파일과 같은 것만 받는다.
MODELS = {
    "det_10g.onnx": {"size": 16923827, "sha256": "5838f7fe053675b1c7a08b633df49e7af5495cee0493c7dcf6697200b85b5b91"},
    "w600k_r50.onnx": {"size": 174383860, "sha256": "4c06341c33c2ca1f86781dab0e829f88ad5b64be9fba56e56bc9ebdefc619e43"},
}

TAIL_BYTES = 64 * 1024
TIMEOUT_SECONDS = 60
# 큰 파일은 조각으로 나눠 동시에 받는다 — 연결 하나의 속도가 느려도 첫 실행(콜드 스타트)이 덜 기다린다.
PART_BYTES = 16 * 1024 * 1024
PARALLEL_PARTS = 8


class ModelUnavailable(Exception):
    """모델을 받지 못했거나 받은 파일이 기대한 것과 다르다"""


def _verify(name, data):
    expected = MODELS[name]
    if len(data) != expected["size"] or hashlib.sha256(data).hexdigest() != expected["sha256"]:
        raise ModelUnavailable(f"{name} does not match the pinned size/sha256")
    return data


def _http_range(url, start, end):
    """[start, end] 바이트를 받는다. → (본문, 리다이렉트 뒤 실제 주소, 파일 전체 크기)"""
    request = urllib.request.Request(url, headers={"Range": f"bytes={start}-{end}", "User-Agent": "rg-manager-face-engine"})
    with urllib.request.urlopen(request, timeout=TIMEOUT_SECONDS) as response:
        if response.status != 206:
            raise ModelUnavailable(f"range request answered {response.status}")
        total = int(response.headers.get("Content-Range", "/0").rsplit("/", 1)[-1] or 0)
        chunks = []
        while True:
            chunk = response.read(1 << 20)
            if not chunk:
                break
            chunks.append(chunk)
        return b"".join(chunks), response.geturl(), total


def _central_directory(tail, tail_start, fetch):
    """zip 끝의 EOCD 를 찾아 중앙 디렉터리 항목을 이름 → (방식, 압축 크기, 원래 크기, 로컬 헤더 위치) 로 푼다."""
    eocd = tail.rfind(b"PK\x05\x06")
    if eocd < 0:
        raise ModelUnavailable("zip end record not found")
    cd_size, cd_offset = struct.unpack_from("<II", tail, eocd + 12)
    if cd_offset == 0xFFFFFFFF:
        raise ModelUnavailable("zip64 is not supported")
    if cd_offset >= tail_start:
        directory = tail[cd_offset - tail_start: cd_offset - tail_start + cd_size]
    else:
        directory = fetch(cd_offset, cd_offset + cd_size - 1)

    entries = {}
    position = 0
    while position + 46 <= len(directory) and directory[position:position + 4] == b"PK\x01\x02":
        method, = struct.unpack_from("<H", directory, position + 10)
        compressed, original, name_len, extra_len, comment_len = struct.unpack_from("<IIHHH", directory, position + 20)
        local_offset, = struct.unpack_from("<I", directory, position + 42)
        name = directory[position + 46: position + 46 + name_len].decode("utf-8")
        entries[name] = (method, compressed, original, local_offset)
        position += 46 + name_len + extra_len + comment_len
    return entries


def _fetch_parallel(fetch, start, end):
    """[start, end] 를 PART_BYTES 조각으로 나눠 동시에 받아 이어 붙인다."""
    ranges = [(offset, min(end, offset + PART_BYTES - 1)) for offset in range(start, end + 1, PART_BYTES)]
    if len(ranges) == 1:
        return fetch(start, end)
    with ThreadPoolExecutor(max_workers=PARALLEL_PARTS) as pool:
        return b"".join(pool.map(lambda r: fetch(*r), ranges))


def _member(entry, fetch):
    method, compressed, _original, local_offset = entry
    header = fetch(local_offset, local_offset + 29)
    if header[:4] != b"PK\x03\x04":
        raise ModelUnavailable("zip local header not found")
    name_len, extra_len = struct.unpack_from("<HH", header, 26)
    start = local_offset + 30 + name_len + extra_len
    raw = _fetch_parallel(fetch, start, start + compressed - 1)
    if method == 0:
        return raw
    if method == 8:
        inflater = zlib.decompressobj(-15)
        return inflater.decompress(raw) + inflater.flush()
    raise ModelUnavailable(f"zip method {method} is not supported")


def download_models(url=PACK_URL, http_range=_http_range):
    """배포처 zip 에서 MODELS 두 개만 받아 확인한 뒤 {이름: 바이트} 로 준다."""
    try:
        _, resolved, total = http_range(url, 0, 0)
        if not total:
            raise ModelUnavailable("unknown pack size")
        fetch = lambda start, end: http_range(resolved, start, end)[0]  # noqa: E731 — 리다이렉트는 한 번만 따른다
        tail_start = max(0, total - TAIL_BYTES)
        tail = fetch(tail_start, total - 1)
        entries = _central_directory(tail, tail_start, fetch)
        models = {}
        for name in MODELS:
            if name not in entries:
                raise ModelUnavailable(f"{name} is missing from the pack")
            models[name] = _verify(name, _member(entries[name], fetch))
        return models
    except ModelUnavailable:
        raise
    except Exception as error:  # 네트워크·형식 오류는 모두 "모델 없음" 으로 — 업로드는 분석 없이 계속된다
        raise ModelUnavailable(str(error)) from error


def read_models(directory):
    """폴더에 받아 둔 모델을 읽는다(크기·해시가 맞을 때만). 없거나 다르면 ModelUnavailable."""
    models = {}
    for name in MODELS:
        path = os.path.join(directory, name)
        try:
            with open(path, "rb") as handle:
                models[name] = _verify(name, handle.read())
        except OSError as error:
            raise ModelUnavailable(f"{path}: {error}") from error
    return models


def write_models(directory, models):
    os.makedirs(directory, exist_ok=True)
    for name, data in models.items():
        temporary = os.path.join(directory, f".{name}.part")
        with open(temporary, "wb") as handle:
            handle.write(data)
        os.replace(temporary, os.path.join(directory, name))


def load_models():
    """FACE_MODEL_DIR(로컬) → 캐시 폴더(/tmp, 같은 인스턴스 재시작) → 배포처 순으로 찾는다."""
    local = os.environ.get("FACE_MODEL_DIR")
    if local:
        return read_models(local)

    cache = os.environ.get("FACE_MODEL_CACHE", "/tmp/rg-face-models")
    try:
        return read_models(cache)
    except ModelUnavailable:
        pass

    models = download_models()
    try:
        write_models(cache, models)
    except OSError:
        pass  # /tmp 에 못 써도 이번 인스턴스는 메모리의 모델로 돈다
    return models


if __name__ == "__main__":
    target = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(os.path.abspath(__file__)), ".models")
    write_models(target, download_models())
    print(f"saved {', '.join(MODELS)} to {target}")
