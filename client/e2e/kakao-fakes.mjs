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

/** [지도에서 고르기] 에서 "지도를 끌어 옮긴" 곳 — 가짜 지도의 [가짜 지도 옮기기] 가 여기로 간다 */
export const FAKE_MOVED_PLACE = {
  address: '서울 송파구 올림픽로 25',
  placeName: '서울종합운동장',
  latitude: 37.5153,
  longitude: 127.0733
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

// 움직이는 지도(draggable 기본값)에는 [가짜 지도 옮기기] 를 붙인다 — 누르면 FAKE_MOVED_PLACE 로 가운데를 옮기고
// 진짜 지도처럼 idle 을 부른다. 좌표 → 주소(coord2Address)는 두 가짜 장소만 안다.
const KAKAO_SDK_FAKE = `
(function () {
  var k = window.kakao || window.daum || {};
  window.kakao = window.daum = k;
  var places = ${JSON.stringify([
    { ...FAKE_PLACE, roadAddress: FAKE_PLACE.address },
    { ...FAKE_MOVED_PLACE, roadAddress: FAKE_MOVED_PLACE.address }
  ])};
  var moved = places[1];
  function LatLng(lat, lng) { this.lat = lat; this.lng = lng; }
  LatLng.prototype.getLat = function () { return this.lat; };
  LatLng.prototype.getLng = function () { return this.lng; };
  function fire(target, type, arg) {
    (target.listeners[type] || []).slice().forEach(function (handler) { handler(arg); });
  }
  function Map(el, options) {
    var self = this;
    this.listeners = {};
    this.drawn = document.createElement('div');
    this.drawn.className = 'e2e-fake-map';
    el.appendChild(this.drawn);
    this.setCenter(options.center);
    if (options.draggable !== false) {
      var move = document.createElement('button');
      move.type = 'button';
      move.textContent = '가짜 지도 옮기기';
      move.onclick = function () { self.panTo(new LatLng(moved.latitude, moved.longitude)); };
      el.appendChild(move);
    }
  }
  Map.prototype.getCenter = function () { return this.center; };
  Map.prototype.setCenter = function (center) {
    this.center = center;
    this.drawn.textContent = '가짜 지도 ' + center.lat + ',' + center.lng;
  };
  Map.prototype.panTo = function (center) { this.setCenter(center); fire(this, 'idle'); };
  Map.prototype.relayout = function () {};
  Map.prototype.addControl = function () {};
  function Marker() {}
  function ZoomControl() {}
  function Geocoder() {}
  Geocoder.prototype.addressSearch = function (address, callback) {
    callback([{ x: ${JSON.stringify(String(FAKE_PLACE.longitude))}, y: ${JSON.stringify(String(FAKE_PLACE.latitude))} }], 'OK');
  };
  Geocoder.prototype.coord2Address = function (x, y, callback) {
    var hit = places.filter(function (p) { return p.longitude === x && p.latitude === y; })[0];
    if (!hit) { callback([], 'ZERO_RESULT'); return; }
    callback([{ road_address: { address_name: hit.roadAddress, building_name: hit.placeName }, address: { address_name: hit.roadAddress } }], 'OK');
  };
  k.maps = {
    load: function (callback) { callback(); },
    LatLng: LatLng,
    Map: Map,
    Marker: Marker,
    ZoomControl: ZoomControl,
    ControlPosition: { RIGHT: 'RIGHT' },
    event: {
      addListener: function (target, type, handler) { (target.listeners[type] = target.listeners[type] || []).push(handler); },
      removeListener: function (target, type, handler) {
        target.listeners[type] = (target.listeners[type] || []).filter(function (h) { return h !== handler; });
      }
    },
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
