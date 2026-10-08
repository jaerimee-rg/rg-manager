/* 목업 갤러리 (docs/recommended-shop/mockups/gallery.js 를 옮겨 와 페이지 목록·이름만 설정으로 뺐다) — window.MOCK 설정대로 화면 파일을 iframe 으로 띄운다.
   iframe 은 자기 폭(1280 / 390)을 뷰포트로 가지므로 앱의 미디어 쿼리가 실제 기기처럼 적용되고,
   모달·바텀시트(position: fixed)도 그 화면 안에 갇힌다. */
(function () {
  var cfg = window.MOCK;
  var PAGES = cfg.pages || [
    ['teacher-desktop.html', '선생님 · 데스크톱'],
    ['teacher-mobile.html', '선생님 · 모바일'],
    ['parent-mobile.html', '학부모 · 모바일']
  ];
  var esc = function (s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;'); };

  document.title = cfg.title;
  var top = document.createElement('div');
  top.className = 'mock-top';
  top.innerHTML = '<span class="mock-top__title">' + esc(cfg.name || '목업') + '</span><nav>' +
    PAGES.map(function (p) {
      return '<a href="' + p[0] + '"' + (p[0] === cfg.page ? ' aria-current="page"' : '') + '>' + p[1] + '</a>';
    }).join('') + '</nav>';
  document.body.appendChild(top);

  var intro = document.createElement('div');
  intro.className = 'mock-intro';
  intro.innerHTML = '<h1>' + esc(cfg.title) + '</h1>' + (cfg.intro || []).map(function (t) { return '<p>' + t + '</p>'; }).join('');
  document.body.appendChild(intro);

  var list = document.createElement('div');
  list.className = 'mock-list';
  list.setAttribute('data-device', cfg.device);
  document.body.appendChild(list);

  var frames = [];

  cfg.screens.forEach(function (sc, i) {
    // 한 갤러리에 선생님·학부모 화면이 섞일 때 묶음 제목
    if (sc.group) {
      var group = document.createElement('h2');
      group.className = 'mock-group';
      group.textContent = sc.group;
      list.appendChild(group);
    }
    var sec = document.createElement('section');
    sec.className = 'mock-screen';
    var notes = (sc.notes || []).length
      ? '<ul class="mock-notes">' + sc.notes.map(function (n) { return '<li>' + n + '</li>'; }).join('') + '</ul>'
      : '';
    sec.innerHTML = '<div class="mock-screen__head"><span class="mock-screen__no">' + (i + 1) + '</span>' +
      '<h2 class="mock-screen__title">' + esc(sc.title) + '</h2>' +
      (sc.path ? '<span class="mock-screen__path">' + esc(sc.path) + '</span>' : '') + '</div>';

    var iframe = document.createElement('iframe');
    iframe.src = (sc.src || cfg.src) + '?s=' + encodeURIComponent(sc.s);
    iframe.title = sc.title;
    iframe.width = String(cfg.width);
    iframe.style.width = cfg.width + 'px';
    var baseHeight = sc.height || cfg.height;
    iframe.style.height = baseHeight + 'px';
    frames.push({ el: iframe, fixed: !!sc.fixed, base: baseHeight });

    if (cfg.device === 'desktop') {
      sec.insertAdjacentHTML('beforeend', notes);
      var box = document.createElement('div');
      box.className = 'mock-desktop';
      box.innerHTML = '<div class="mock-desktop__bar"><i></i><i></i><i></i><span>' + esc(cfg.host + (sc.path || '')) + '</span></div>';
      var vp = document.createElement('div');
      vp.className = 'mock-desktop__viewport';
      vp.appendChild(iframe);
      box.appendChild(vp);
      sec.appendChild(box);
    } else {
      var phone = document.createElement('div');
      phone.className = 'mock-phone';
      phone.innerHTML = '<div class="mock-phone__status"><span>9:41</span><span>5G ▮▮▮</span></div>';
      var bar = sc.browserBar !== undefined ? sc.browserBar : cfg.browserBar;
      phone.innerHTML += bar
        ? '<div class="mock-phone__browser"><span>✕</span><b>' + esc(bar) + '</b><span>⋯</span></div>'
        : '';
      phone.appendChild(iframe);
      sec.appendChild(phone);
      sec.insertAdjacentHTML('beforeend', notes);
    }
    list.appendChild(sec);
  });

  // 데스크탑: 1280px 화면을 칸 폭에 맞춰 축소
  var rescale = function () {
    if (cfg.device !== 'desktop') return;
    frames.forEach(function (f) {
      var vp = f.el.parentNode;
      var scale = Math.min(1, vp.parentNode.clientWidth / cfg.width);
      f.el.style.transform = 'scale(' + scale + ')';
      vp.style.height = Math.ceil(parseFloat(f.el.style.height) * scale) + 'px';
    });
  };

  // 화면이 알려 준 내용 높이로 맞춘다 (모달·시트 화면은 기기 높이 고정)
  window.addEventListener('message', function (e) {
    var d = e.data;
    if (!d || d.type !== 'mock-height') return;
    frames.forEach(function (f) {
      if (f.el.contentWindow !== e.source || f.fixed) return;
      var h = Math.max(f.base, d.h);
      if (Math.abs(parseFloat(f.el.style.height) - h) > 1) {
        f.el.style.height = h + 'px';
        rescale();
      }
    });
  });
  window.addEventListener('resize', rescale);
  rescale();
})();
