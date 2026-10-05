/**
 * 다음 우편번호·카카오 지도 SDK 를 가짜로 바꿔 끼운다 (page.route).
 *
 * 진짜 스크립트는 외부 CDN 이고 카카오 지도는 콘솔에 등록한 도메인에서만 돈다 — e2e 의 localhost 에서는
 * 지도가 뜨지 않고, 우편번호 창은 다른 출처의 iframe 이라 자동화하기도 어렵다. 그래서 앱이 부르는
 * 두 스크립트와 키 조회(/api/maps/config)만 흉내 내고, 앱 쪽 흐름(검색 → 주소·좌표 저장 → 지도)을 본다.
 * 진짜 SDK 와 키·도메인 설정은 운영에서 눈으로 확인한다.
 */

export const FAKE_PLACE = {
  address: '서울 송파구 올림픽로 424',
  jibunAddress: '서울 송파구 방이동 88',
  placeName: '올림픽공원',
  latitude: 37.5203,
  longitude: 127.1236
};

// window.kakao / window.daum 은 진짜 스크립트처럼 같은 객체를 함께 쓴다.
const POSTCODE_FAKE = `
(function () {
  var k = window.kakao || window.daum || {};
  window.kakao = window.daum = k;
  k.Postcode = function (options) {
    this.embed = function (el, embedOptions) {
      var button = document.createElement('button');
      button.type = 'button';
      button.textContent = '가짜 주소 고르기';
      button.setAttribute('data-q', (embedOptions && embedOptions.q) || '');
      button.onclick = function () {
        options.oncomplete({
          roadAddress: ${JSON.stringify(FAKE_PLACE.address)},
          jibunAddress: ${JSON.stringify(FAKE_PLACE.jibunAddress)},
          buildingName: ${JSON.stringify(FAKE_PLACE.placeName)},
          userSelectedType: 'R'
        });
      };
      el.appendChild(button);
    };
  };
})();
`;

const KAKAO_SDK_FAKE = `
(function () {
  var k = window.kakao || window.daum || {};
  window.kakao = window.daum = k;
  function LatLng(lat, lng) { this.lat = lat; this.lng = lng; }
  function Map(el, options) {
    var drawn = document.createElement('div');
    drawn.className = 'e2e-fake-map';
    drawn.textContent = '가짜 지도 ' + options.center.lat + ',' + options.center.lng;
    el.appendChild(drawn);
  }
  function Marker() {}
  function Geocoder() {}
  Geocoder.prototype.addressSearch = function (address, callback) {
    callback([{ x: ${JSON.stringify(String(FAKE_PLACE.longitude))}, y: ${JSON.stringify(String(FAKE_PLACE.latitude))} }], 'OK');
  };
  k.maps = {
    load: function (callback) { callback(); },
    LatLng: LatLng,
    Map: Map,
    Marker: Marker,
    services: { Geocoder: Geocoder, Status: { OK: 'OK', ZERO_RESULT: 'ZERO_RESULT', ERROR: 'ERROR' } }
  };
})();
`;

/**
 * @param {{ key?: string|null }} [options] key 를 null 로 주면 "지도 키가 없는 서버" 를 흉내 낸다
 */
export const stubKakaoMaps = async (page, { key = 'e2e-fake-js-key' } = {}) => {
  await page.route(/postcode\.v2\.js/, (route) =>
    route.fulfill({ contentType: 'text/javascript', body: POSTCODE_FAKE }));
  await page.route(/dapi\.kakao\.com\/v2\/maps\/sdk\.js/, (route) =>
    route.fulfill({ contentType: 'text/javascript', body: KAKAO_SDK_FAKE }));
  await page.route('**/api/maps/config', (route) =>
    route.fulfill({ contentType: 'application/json', body: JSON.stringify({ kakaoJsKey: key }) }));
};
