import { fetchWithAuth } from './api';

/**
 * 이벤트 장소의 주소 검색과 지도.
 *
 * - 주소 검색은 **다음 우편번호 서비스**다. 키 없이 누구나 쓸 수 있고, 고른 주소(도로명/지번)와
 *   건물명을 돌려준다 — 좌표는 주지 않는다.
 * - 좌표 찾기(주소 → 위도·경도)와 지도 그리기는 **카카오 지도 SDK** 다. JavaScript 키가 필요하고,
 *   키는 빌드에 넣지 않고 서버(`GET /api/maps/config`, 환경변수 KAKAO_JS_KEY)에서 받는다.
 *   키가 없으면 주소는 그대로 저장되고 지도만 빠진다 — 학부모 화면은 "카카오맵에서 보기" 링크로 대신한다.
 *
 * 두 스크립트는 window.kakao / window.daum 을 같은 객체로 공유하도록 만들어져 있어 순서와 상관없이 함께 쓸 수 있다.
 */

export const POSTCODE_SRC = 'https://t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js';

export const kakaoSdkSrc = (appKey) =>
  `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${encodeURIComponent(appKey)}&libraries=services&autoload=false`;

const scripts = new Map();
let configPromise = null;
let mapsPromise = null;

/** 테스트에서 모듈 상태(불러온 스크립트·키)를 비운다 */
export function resetKakaoMapState() {
  scripts.clear();
  configPromise = null;
  mapsPromise = null;
}

/** 같은 src 는 한 번만 붙인다. 실패하면 지워서 다음에 다시 시도할 수 있게 한다. */
export function loadScript(src) {
  if (scripts.has(src)) return scripts.get(src);

  const promise = new Promise((resolve, reject) => {
    const el = document.createElement('script');
    el.src = src;
    el.async = true;
    el.onload = () => resolve();
    el.onerror = () => {
      scripts.delete(src);
      el.remove();
      reject(new Error(`스크립트를 불러오지 못했어요: ${src}`));
    };
    document.head.appendChild(el);
  });

  scripts.set(src, promise);
  return promise;
}

/** 다음 우편번호 서비스의 Postcode 생성자 */
export async function loadPostcode() {
  if (!window.daum?.Postcode) await loadScript(POSTCODE_SRC);
  if (!window.daum?.Postcode) throw new Error('주소 검색을 불러오지 못했어요');
  return window.daum.Postcode;
}

/** 카카오 지도 JavaScript 키. 서버에 없으면 null (한 페이지에서 한 번만 묻는다) */
export function getKakaoMapKey() {
  if (!configPromise) {
    configPromise = fetchWithAuth('/api/maps/config')
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => (typeof data?.kakaoJsKey === 'string' && data.kakaoJsKey ? data.kakaoJsKey : null))
      .catch((error) => {
        // 네트워크 실패는 다음 화면에서 다시 물을 수 있게 기억하지 않는다
        configPromise = null;
        console.error('지도 설정 조회 실패:', error);
        return null;
      });
  }
  return configPromise;
}

/** 카카오 지도 SDK(kakao.maps). services(주소 → 좌표) 라이브러리를 함께 싣는다. */
export function loadKakaoMaps(appKey) {
  if (window.kakao?.maps?.services) return Promise.resolve(window.kakao.maps);

  if (!mapsPromise) {
    mapsPromise = loadScript(kakaoSdkSrc(appKey))
      .then(() => new Promise((resolve, reject) => {
        if (!window.kakao?.maps?.load) {
          reject(new Error('카카오 지도를 불러오지 못했어요'));
          return;
        }
        window.kakao.maps.load(() => resolve(window.kakao.maps));
      }))
      .catch((error) => {
        mapsPromise = null;
        throw error;
      });
  }
  return mapsPromise;
}

/**
 * 다음 우편번호 결과 → 저장할 주소와 장소 이름 후보.
 * 사용자가 도로명/지번 중 무엇을 눌렀는지(userSelectedType)를 따른다.
 */
export function pickPostcodeAddress(data = {}) {
  const road = data.roadAddress || data.autoRoadAddress || '';
  const jibun = data.jibunAddress || data.autoJibunAddress || '';
  const chosen = data.userSelectedType === 'J' ? (jibun || road) : (road || jibun);

  return {
    address: String(chosen || data.address || '').trim(),
    placeName: String(data.buildingName || '').trim()
  };
}

export const hasCoordinates = (place) =>
  Number.isFinite(place?.latitude) && Number.isFinite(place?.longitude);

/**
 * 주소 → 좌표. 지도에 쓸 수 없으면 이유를 함께 돌려준다.
 * @returns {Promise<{ok:true,latitude:number,longitude:number}|{ok:false,reason:'no_key'|'not_found'|'error'}>}
 */
export async function locateAddress(address) {
  if (!address) return { ok: false, reason: 'not_found' };

  try {
    const key = await getKakaoMapKey();
    if (!key) return { ok: false, reason: 'no_key' };

    const maps = await loadKakaoMaps(key);
    return await new Promise((resolve) => {
      new maps.services.Geocoder().addressSearch(address, (result, status) => {
        const first = status === maps.services.Status.OK ? result?.[0] : null;
        const latitude = Number(first?.y);
        const longitude = Number(first?.x);
        resolve(first && Number.isFinite(latitude) && Number.isFinite(longitude)
          ? { ok: true, latitude, longitude }
          : { ok: false, reason: 'not_found' });
      });
    });
  } catch (error) {
    console.error('주소 좌표 찾기 실패:', error);
    return { ok: false, reason: 'error' };
  }
}

// 카카오맵 링크는 "이름,위도,경도" 를 쉼표로 나눈다 — 이름 안의 쉼표는 공백으로 바꾼다.
const linkLabel = (text) => encodeURIComponent(String(text || '').replace(/,/g, ' ').trim());

/**
 * 카카오맵 앱·웹으로 여는 링크. 키 없이 동작한다.
 * 좌표가 있으면 그 지점과 길찾기, 주소만 있으면 주소 검색 결과를 연다.
 */
export function kakaoMapLinks({ name, address, latitude, longitude } = {}) {
  if (hasCoordinates({ latitude, longitude })) {
    const label = linkLabel(name || address || '이벤트 장소');
    return {
      view: `https://map.kakao.com/link/map/${label},${latitude},${longitude}`,
      directions: `https://map.kakao.com/link/to/${label},${latitude},${longitude}`
    };
  }
  if (address) {
    return { view: `https://map.kakao.com/link/search/${encodeURIComponent(address)}`, directions: null };
  }
  return null;
}
