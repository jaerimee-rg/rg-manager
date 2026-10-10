jest.mock('../api', () => ({ fetchWithAuth: jest.fn() }));

import { waitFor } from '@testing-library/react';
import { fetchWithAuth } from '../api';
import {
  POSTCODE_SRC,
  kakaoSdkSrc,
  loadScript,
  loadPostcode,
  loadKakaoMaps,
  getKakaoMapKey,
  locateAddress,
  pickPostcodeAddress,
  pickCoordAddress,
  addressAt,
  hasCoordinates,
  kakaoMapLinks,
  resetKakaoMapState
} from '../kakaoMap';

const ok = (body) => Promise.resolve({ ok: true, json: () => Promise.resolve(body) });

/** jsdom 은 외부 스크립트를 받지 않는다 — 붙은 <script> 를 찾아 onload/onerror 를 직접 부른다 */
const scriptFor = (src) => [...document.head.querySelectorAll('script')].find((el) => el.src === src);

/** 카카오 지도 SDK 흉내. addressSearch 결과는 테스트마다 정한다. */
const fakeKakao = ({ result = [{ x: '127.1236', y: '37.5203' }], status = 'OK' } = {}) => {
  const addressSearch = jest.fn((address, cb) => cb(result, status));
  return {
    maps: {
      load: (cb) => cb(),
      services: {
        Status: { OK: 'OK', ZERO_RESULT: 'ZERO_RESULT', ERROR: 'ERROR' },
        Geocoder: jest.fn(() => ({ addressSearch }))
      }
    },
    addressSearch
  };
};

beforeEach(() => {
  jest.clearAllMocks();
  resetKakaoMapState();
  document.head.innerHTML = '';
  delete window.kakao;
  delete window.daum;
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  console.error.mockRestore();
});

describe('pickPostcodeAddress — 다음 우편번호 결과에서 저장할 주소 고르기', () => {
  const data = {
    address: '서울 송파구 올림픽로 424',
    roadAddress: '서울 송파구 올림픽로 424',
    jibunAddress: '서울 송파구 방이동 88',
    buildingName: '올림픽공원',
    userSelectedType: 'R'
  };

  it('도로명을 눌렀으면 도로명 주소, 건물명은 장소 이름 후보로', () => {
    expect(pickPostcodeAddress(data)).toEqual({ address: '서울 송파구 올림픽로 424', placeName: '올림픽공원' });
  });

  it('지번을 눌렀으면 지번 주소', () => {
    expect(pickPostcodeAddress({ ...data, userSelectedType: 'J' }).address).toBe('서울 송파구 방이동 88');
  });

  it('지번이 비어 있으면(신축 등) auto 값 → 도로명 순으로 채운다', () => {
    expect(pickPostcodeAddress({ ...data, userSelectedType: 'J', jibunAddress: '', autoJibunAddress: '서울 송파구 방이동 89' }).address)
      .toBe('서울 송파구 방이동 89');
    expect(pickPostcodeAddress({ ...data, userSelectedType: 'J', jibunAddress: '' }).address)
      .toBe('서울 송파구 올림픽로 424');
  });

  it('건물명이 없으면 장소 이름 후보는 빈 문자열', () => {
    expect(pickPostcodeAddress({ ...data, buildingName: '' }).placeName).toBe('');
    expect(pickPostcodeAddress().address).toBe('');
  });
});

describe('kakaoMapLinks — 키 없이 여는 카카오맵 링크', () => {
  it('좌표가 있으면 그 지점 보기와 길찾기', () => {
    expect(kakaoMapLinks({ name: '올림픽공원', address: 'x', latitude: 37.5203, longitude: 127.1236 })).toEqual({
      view: `https://map.kakao.com/link/map/${encodeURIComponent('올림픽공원')},37.5203,127.1236`,
      directions: `https://map.kakao.com/link/to/${encodeURIComponent('올림픽공원')},37.5203,127.1236`
    });
  });

  it('이름 안의 쉼표는 공백으로 바꾼다 (링크가 쉼표로 이름·위도·경도를 나눈다)', () => {
    const { view } = kakaoMapLinks({ name: 'A홀, 2층', latitude: 37, longitude: 127 });
    expect(view).toBe(`https://map.kakao.com/link/map/${encodeURIComponent('A홀  2층')},37,127`);
  });

  it('주소만 있으면 주소 검색 결과를 열고 길찾기는 없다', () => {
    expect(kakaoMapLinks({ name: '올림픽공원', address: '서울 송파구 올림픽로 424' })).toEqual({
      view: `https://map.kakao.com/link/search/${encodeURIComponent('서울 송파구 올림픽로 424')}`,
      directions: null
    });
  });

  it('주소도 좌표도 없으면 null', () => {
    expect(kakaoMapLinks({ name: '올림픽공원' })).toBeNull();
  });
});

describe('hasCoordinates', () => {
  it('위도·경도가 둘 다 숫자여야 한다', () => {
    expect(hasCoordinates({ latitude: 37.5, longitude: 127.1 })).toBe(true);
    expect(hasCoordinates({ latitude: 0, longitude: 0 })).toBe(true);
    expect(hasCoordinates({ latitude: null, longitude: 127.1 })).toBe(false);
    expect(hasCoordinates({ latitude: '37.5', longitude: '127.1' })).toBe(false);
    expect(hasCoordinates(null)).toBe(false);
  });
});

describe('loadScript', () => {
  it('같은 주소는 한 번만 붙인다', async () => {
    const first = loadScript('https://example.com/a.js');
    const second = loadScript('https://example.com/a.js');
    expect(second).toBe(first);
    expect(document.head.querySelectorAll('script')).toHaveLength(1);

    scriptFor('https://example.com/a.js').onload();
    await expect(first).resolves.toBeUndefined();
  });

  it('실패하면 태그를 지우고 다음에 다시 시도한다', async () => {
    const first = loadScript('https://example.com/b.js');
    scriptFor('https://example.com/b.js').onerror();
    await expect(first).rejects.toThrow('스크립트를 불러오지 못했어요');
    expect(scriptFor('https://example.com/b.js')).toBeUndefined();

    loadScript('https://example.com/b.js');
    expect(scriptFor('https://example.com/b.js')).toBeDefined();
  });
});

describe('loadPostcode', () => {
  it('다음 우편번호 스크립트를 불러와 Postcode 를 돌려준다', async () => {
    const pending = loadPostcode();
    function Postcode() {}
    window.daum = { Postcode };
    scriptFor(POSTCODE_SRC).onload();

    await expect(pending).resolves.toBe(Postcode);
  });

  it('이미 있으면 스크립트를 다시 붙이지 않는다', async () => {
    function Postcode() {}
    window.daum = { Postcode };

    await expect(loadPostcode()).resolves.toBe(Postcode);
    expect(document.head.querySelectorAll('script')).toHaveLength(0);
  });
});

describe('getKakaoMapKey', () => {
  it('서버의 키를 한 번만 묻는다', async () => {
    fetchWithAuth.mockImplementation(() => ok({ kakaoJsKey: 'js-key' }));

    await expect(getKakaoMapKey()).resolves.toBe('js-key');
    await expect(getKakaoMapKey()).resolves.toBe('js-key');
    expect(fetchWithAuth).toHaveBeenCalledTimes(1);
    expect(fetchWithAuth).toHaveBeenCalledWith('/api/maps/config');
  });

  it('서버가 정상 응답으로 키 없음(null)을 주면 그대로 기억한다', async () => {
    fetchWithAuth.mockImplementation(() => ok({ kakaoJsKey: null }));
    await expect(getKakaoMapKey()).resolves.toBeNull();
    await expect(getKakaoMapKey()).resolves.toBeNull();
    expect(fetchWithAuth).toHaveBeenCalledTimes(1);
  });

  it('429·5xx 같은 실패 응답은 "키 없음" 으로 굳히지 않고 다음에 다시 묻는다', async () => {
    fetchWithAuth.mockImplementationOnce(() => Promise.resolve({ ok: false, status: 429, json: () => Promise.resolve({}) }));
    await expect(getKakaoMapKey()).resolves.toBeNull();

    fetchWithAuth.mockImplementation(() => ok({ kakaoJsKey: 'js-key' }));
    await expect(getKakaoMapKey()).resolves.toBe('js-key');
    expect(fetchWithAuth).toHaveBeenCalledTimes(2);
  });

  it('네트워크 실패는 기억하지 않고 다음에 다시 묻는다', async () => {
    fetchWithAuth.mockImplementationOnce(() => Promise.reject(new Error('offline')));
    await expect(getKakaoMapKey()).resolves.toBeNull();

    fetchWithAuth.mockImplementation(() => ok({ kakaoJsKey: 'js-key' }));
    await expect(getKakaoMapKey()).resolves.toBe('js-key');
  });
});

describe('loadKakaoMaps', () => {
  it('SDK 를 autoload=false 로 불러오고 kakao.maps.load 뒤에 돌려준다', async () => {
    const pending = loadKakaoMaps('js key');
    const src = kakaoSdkSrc('js key');
    expect(src).toContain('appkey=js%20key');
    expect(src).toContain('libraries=services');
    expect(src).toContain('autoload=false');

    window.kakao = fakeKakao();
    scriptFor(src).onload();

    await expect(pending).resolves.toBe(window.kakao.maps);
  });

  it('SDK 가 kakao.maps 를 만들지 못하면(키·도메인 오류) 실패한다', async () => {
    const pending = loadKakaoMaps('bad');
    scriptFor(kakaoSdkSrc('bad')).onload();

    await expect(pending).rejects.toThrow('카카오 지도를 불러오지 못했어요');
  });
});

describe('locateAddress — 주소 → 좌표', () => {
  it('키가 없으면 no_key (SDK 를 부르지 않는다)', async () => {
    fetchWithAuth.mockImplementation(() => ok({ kakaoJsKey: null }));

    await expect(locateAddress('서울 송파구 올림픽로 424')).resolves.toEqual({ ok: false, reason: 'no_key' });
    expect(document.head.querySelectorAll('script')).toHaveLength(0);
  });

  it('찾으면 위도(y)·경도(x)를 숫자로', async () => {
    fetchWithAuth.mockImplementation(() => ok({ kakaoJsKey: 'js-key' }));
    const kakao = fakeKakao();
    window.kakao = kakao;

    await expect(locateAddress('서울 송파구 올림픽로 424'))
      .resolves.toEqual({ ok: true, latitude: 37.5203, longitude: 127.1236 });
    expect(kakao.addressSearch).toHaveBeenCalledWith('서울 송파구 올림픽로 424', expect.any(Function));
  });

  it('결과가 없으면 not_found', async () => {
    fetchWithAuth.mockImplementation(() => ok({ kakaoJsKey: 'js-key' }));
    window.kakao = fakeKakao({ result: [], status: 'ZERO_RESULT' });

    await expect(locateAddress('없는 주소')).resolves.toEqual({ ok: false, reason: 'not_found' });
  });

  it('SDK 가 실패하면 error', async () => {
    fetchWithAuth.mockImplementation(() => ok({ kakaoJsKey: 'js-key' }));
    const pending = locateAddress('서울 송파구 올림픽로 424');
    await waitFor(() => expect(scriptFor(kakaoSdkSrc('js-key'))).toBeDefined());
    scriptFor(kakaoSdkSrc('js-key')).onerror();

    await expect(pending).resolves.toEqual({ ok: false, reason: 'error' });
  });

  it('SDK 가 응답하지 않으면 시간 제한 뒤 error 로 끝난다 — 폼이 영영 잠기지 않게', async () => {
    fetchWithAuth.mockImplementation(() => ok({ kakaoJsKey: 'js-key' }));
    // 스크립트 onload 를 부르지 않는다 = 로딩이 멈춘 상태

    await expect(locateAddress('서울 송파구 올림픽로 424', { timeoutMs: 20 }))
      .resolves.toEqual({ ok: false, reason: 'error' });
  });

  it('빈 주소는 묻지 않는다', async () => {
    await expect(locateAddress('')).resolves.toEqual({ ok: false, reason: 'not_found' });
    expect(fetchWithAuth).not.toHaveBeenCalled();
  });
});

describe('pickCoordAddress — 좌표로 찾은 주소에서 저장할 주소 고르기', () => {
  const road = { address_name: '서울 송파구 올림픽로 424', building_name: '올림픽공원' };
  const jibun = { address_name: '서울 송파구 방이동 88' };

  it('도로명 주소가 있으면 도로명과 건물명', () => {
    expect(pickCoordAddress([{ road_address: road, address: jibun }]))
      .toEqual({ address: '서울 송파구 올림픽로 424', placeName: '올림픽공원' });
  });

  it('도로명 주소가 없는 자리(공원 안·운동장)는 지번 주소, 건물명 없음', () => {
    expect(pickCoordAddress([{ road_address: null, address: jibun }]))
      .toEqual({ address: '서울 송파구 방이동 88', placeName: '' });
  });

  it('결과가 비었으면 빈 주소', () => {
    expect(pickCoordAddress([])).toEqual({ address: '', placeName: '' });
    expect(pickCoordAddress(undefined)).toEqual({ address: '', placeName: '' });
  });
});

describe('addressAt — 좌표 → 주소', () => {
  const mapsWith = (coord2Address) => ({
    services: {
      Status: { OK: 'OK', ZERO_RESULT: 'ZERO_RESULT', ERROR: 'ERROR' },
      Geocoder: jest.fn(() => ({ coord2Address }))
    }
  });

  it('경도(x)·위도(y) 순서로 묻고, 찾은 주소를 돌려준다', async () => {
    const coord2Address = jest.fn((x, y, cb) => cb([{
      road_address: { address_name: '서울 송파구 올림픽로 25', building_name: '서울종합운동장' },
      address: { address_name: '서울 송파구 잠실동 10' }
    }], 'OK'));

    await expect(addressAt(mapsWith(coord2Address), { latitude: 37.5153, longitude: 127.0733 }))
      .resolves.toEqual({ ok: true, address: '서울 송파구 올림픽로 25', placeName: '서울종합운동장' });
    expect(coord2Address).toHaveBeenCalledWith(127.0733, 37.5153, expect.any(Function));
  });

  it('결과가 없으면(바다 위 등) not_found', async () => {
    const maps = mapsWith((x, y, cb) => cb([], 'ZERO_RESULT'));

    await expect(addressAt(maps, { latitude: 37, longitude: 126 })).resolves.toEqual({ ok: false, reason: 'not_found' });
  });

  it('SDK 오류는 error', async () => {
    const maps = mapsWith((x, y, cb) => cb(null, 'ERROR'));

    await expect(addressAt(maps, { latitude: 37, longitude: 126 })).resolves.toEqual({ ok: false, reason: 'error' });
  });

  it('SDK 가 던져도 error 로 끝난다', async () => {
    const maps = mapsWith(() => { throw new Error('boom'); });

    await expect(addressAt(maps, { latitude: 37, longitude: 126 })).resolves.toEqual({ ok: false, reason: 'error' });
  });

  it('응답이 없으면 시간 제한 뒤 error — [이 위치로] 가 영영 잠기지 않게', async () => {
    const maps = mapsWith(() => {});

    await expect(addressAt(maps, { latitude: 37, longitude: 126 }, { timeoutMs: 20 }))
      .resolves.toEqual({ ok: false, reason: 'error' });
  });
});
