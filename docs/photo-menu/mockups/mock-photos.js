/* 목업용 "사진" — 실제 아이 사진을 저장소에 넣을 수 없어서 SVG 로 그린 자리 표시 그림이다.
   mockPhoto(n) 은 n 번째 사진의 data URI 를 돌려준다. 같은 n 이면 늘 같은 그림이다.
   <img data-photo="3"> 은 renderMockPhotos() 가 src 를 채운다. 사진은 콘텐츠라 UI 팔레트 규칙과 무관하다. */
(function () {
  var SCENES = [
    { bg: '#E9D3CF', floor: '#C9A9A2', suit: '#8E3B5A', ribbon: '#E8B04A' },
    { bg: '#D9D3E8', floor: '#B3A9C9', suit: '#3E3A7A', ribbon: '#E46A7E' },
    { bg: '#F0DEC4', floor: '#D2B48E', suit: '#B0344A', ribbon: '#5A8FB8' },
    { bg: '#D4E0DA', floor: '#A9BFB4', suit: '#5B2E6E', ribbon: '#F08A5D' },
    { bg: '#EFD6E2', floor: '#CDA8BB', suit: '#2F4E7A', ribbon: '#F2C14E' },
    { bg: '#E2DCCF', floor: '#BFB49E', suit: '#7A2E3B', ribbon: '#7FB3A5' }
  ];

  // 동작 몇 가지 — 팔·다리 끝점(머리 기준 상대 좌표)
  var POSES = [
    { arms: [[-58, -40], [58, -40]], legs: [[-30, 120], [30, 120]], ribbon: 'M250 120 C 320 60, 360 180, 300 220 S 220 300, 300 330' },
    { arms: [[-20, -70], [62, 10]], legs: [[-60, 110], [40, 120]], ribbon: 'M90 300 C 60 220, 140 160, 120 110 S 60 40, 140 40' },
    { arms: [[-62, 0], [62, 0]], legs: [[0, 125], [80, 80]], ribbon: 'M270 260 C 340 230, 330 140, 270 130 S 200 70, 260 40' },
    { arms: [[-40, -60], [40, -60]], legs: [[-10, 125], [10, 125]], ribbon: 'M120 330 C 60 270, 120 210, 180 230 S 300 300, 330 220' }
  ];

  var cache = {};

  window.mockPhoto = function (n) {
    n = Number(n) || 0;
    if (cache[n]) return cache[n];
    var s = SCENES[(n * 5 + 1) % SCENES.length];
    var p = POSES[(n + Math.floor(n / 3)) % POSES.length];
    var flip = n % 2 === 1;                  // 절반은 좌우를 뒤집어 같은 그림이 이어지지 않게 한다
    var hx = 200 + ((n * 37) % 90) - 45;     // 머리 위치를 조금씩 옮긴다
    var hy = 110 + ((n * 23) % 50);
    var body = [hx, hy + 22, hx, hy + 92];
    var line = function (x1, y1, x2, y2, w, c) {
      return '<line x1="' + x1 + '" y1="' + y1 + '" x2="' + x2 + '" y2="' + y2 + '" stroke="' + c + '" stroke-width="' + w + '" stroke-linecap="round"/>';
    };
    var svg =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400">' +
      '<rect width="400" height="400" fill="' + s.bg + '"/>' +
      '<rect y="300" width="400" height="100" fill="' + s.floor + '"/>' +
      '<g' + (flip ? ' transform="translate(400 0) scale(-1 1)"' : '') + '>' +
      '<path d="' + p.ribbon + '" fill="none" stroke="' + s.ribbon + '" stroke-width="7" stroke-linecap="round"/>' +
      line(hx, hy + 38, hx + p.arms[0][0], hy + 38 + p.arms[0][1], 9, '#E9BFA0') +
      line(hx, hy + 38, hx + p.arms[1][0], hy + 38 + p.arms[1][1], 9, '#E9BFA0') +
      line(hx, hy + 92, hx + p.legs[0][0], hy + 92 + p.legs[0][1] * 0.7, 11, '#E9BFA0') +
      line(hx, hy + 92, hx + p.legs[1][0], hy + 92 + p.legs[1][1] * 0.7, 11, '#E9BFA0') +
      line(body[0], body[1], body[2], body[3], 30, s.suit) +
      '<circle cx="' + hx + '" cy="' + hy + '" r="20" fill="#E9BFA0"/>' +
      '<path d="M' + (hx - 20) + ' ' + (hy - 4) + ' a20 20 0 0 1 40 0 z" fill="#3A2A22"/>' +
      '</g></svg>';
    cache[n] = 'data:image/svg+xml,' + encodeURIComponent(svg);
    return cache[n];
  };

  window.renderMockPhotos = function (root) {
    (root || document).querySelectorAll('img[data-photo]').forEach(function (img) {
      img.src = window.mockPhoto(img.getAttribute('data-photo'));
      img.alt = img.alt || '';
    });
  };
})();
