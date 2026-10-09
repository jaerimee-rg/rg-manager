/**
 * 찾은 얼굴을 작은 그림으로 잘라 낸다 — 앨범 [얼굴 찾기] 가 찾은 얼굴을 화면에 보여 주는 데만 쓴다.
 *
 * 얼굴을 찾는 쪽(faceClient.detectFaces)과 따로 둔다: 상자 {x, y, w, h}(사진 폭·높이에 대한 0~1)만 있으면
 * 되므로 어떤 방식으로 찾았든 같은 그림이 나온다. 잘라 낸 그림(JPEG data URL)은 화면에만 쓰고
 * 서버로 보내거나 어디에 남기지 않는다.
 *
 * 사진은 한 번 더 읽는다 — 방금 얼굴을 찾느라 받은 같은 주소라 보통 브라우저 캐시에서 온다.
 * Drive 사진은 lh3 주소여야 캔버스가 오염되지 않는다(Access-Control-Allow-Origin: *).
 */

/** 잘라 낸 그림의 한 변(px). 화면에는 40px 로 그리니 고해상도 화면에서도 또렷하다. */
export const FACE_CROP_SIZE = 96;

/** 얼굴 상자보다 이만큼 넓게 자른다 — 상자만 자르면 이마·턱이 잘려 누군지 알아보기 어렵다. */
const CROP_MARGIN = 1.6;

/**
 * 얼굴 상자(0~1) → 사진 안의 정사각 자르기 영역(px) { x, y, size }.
 * 상자 가운데를 중심으로 긴 변 × margin 만큼, 사진 밖으로 나가면 안쪽으로 밀어 넣는다.
 */
export const faceCropRect = (box, width, height, margin = CROP_MARGIN) => {
  const size = Math.min(Math.max(box.w * width, box.h * height) * margin, width, height);
  const start = (center, limit) => Math.min(Math.max(center - size / 2, 0), limit - size);
  return {
    x: start((box.x + box.w / 2) * width, width),
    y: start((box.y + box.h / 2) * height, height),
    size
  };
};

const loadImage = (url) => new Promise((resolve) => {
  const image = new Image();
  image.crossOrigin = 'anonymous';
  image.onload = () => resolve(image);
  image.onerror = () => resolve(null);
  image.src = url;
});

const cropOne = (image, box, width, height, size) => {
  try {
    const rect = faceCropRect(box, width, height);
    if (!(rect.size >= 1)) return null;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext('2d');
    if (!context) return null;
    context.drawImage(image, rect.x, rect.y, rect.size, rect.size, 0, 0, size, size);
    return canvas.toDataURL('image/jpeg', 0.85);
  } catch {
    // 캔버스가 오염됐거나(CORS 없는 주소) 그리기에 실패 — 미리보기만 빠진다
    return null;
  }
};

/**
 * url 사진에서 faces 의 얼굴을 하나씩 자른다 → faces 와 같은 순서의 [data URL | null].
 * 사진을 못 읽으면 전부 null. 미리보기일 뿐이라 던지지 않는다.
 */
export const cropFaces = async (url, faces, size = FACE_CROP_SIZE) => {
  if (!faces?.length) return [];
  const image = await loadImage(url);
  const width = image?.naturalWidth || 0;
  const height = image?.naturalHeight || 0;
  if (!width || !height) return faces.map(() => null);
  return faces.map((face) => cropOne(image, face.box, width, height, size));
};

export default { FACE_CROP_SIZE, faceCropRect, cropFaces };
