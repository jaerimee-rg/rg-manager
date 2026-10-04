import { readFileSync } from 'fs';
import path from 'path';

/**
 * 디자인 개편의 계약: 목업(mockup/shared/mockup.css)과 같은 팔레트 · 서체를 쓰는지,
 * 그리고 예전 파랑 브랜드가 스타일시트에 남지 않았는지를 파일을 직접 읽어 확인한다.
 * (jsdom 은 CSS 를 계산하지 않으므로 화면 대신 원본을 본다)
 */

const read = (rel) => readFileSync(path.join(__dirname, rel), 'utf8');
const TOKENS = read('../../../styles/tokens.css');
const UI = read('../../../styles/ui.css');
const APP = read('../../../styles/App.css');
const HTML = read('../../../../index.html');

/** `--name: value;` 의 value (첫 번째 정의) */
const token = (name) => {
  const m = TOKENS.match(new RegExp(`${name}:\\s*([^;]+);`));
  return m ? m[1].replace(/\s+/g, ' ').trim() : null;
};

/** 선택자 블록의 선언 (첫 번째 블록) */
const block = (css, selector) => {
  const at = css.indexOf(`${selector} {`);
  if (at === -1) return null;
  return css.slice(css.indexOf('{', at) + 1, css.indexOf('}', at));
};

describe('팔레트 — 목업과 같은 값', () => {
  it.each([
    ['--paper', '#ECE9E2'],
    ['--sheet', '#F8F6F1'],
    ['--ink', '#000000'],
    ['--pencil', '#6E6C67'],
    ['--rule', '#CFCAC0'],
    ['--star', '#F1DE6E'],
    ['--star-soft', '#F8EEB4'],
    ['--alert', '#D2342B'],
    ['--kakao', '#FEE500']
  ])('%s = %s', (name, value) => {
    expect(token(name)).toBe(value);
  });

  it('페이지 바탕은 종이, 카드는 한 장, 기본 선은 잉크다', () => {
    expect(token('--surface-sunken')).toBe('var(--paper)');
    expect(token('--surface')).toBe('var(--sheet)');
    expect(token('--border')).toBe('var(--ink)');
  });

  it('강조 채움(brand)은 별 노랑이고, 그 위 글자(brand-700)는 잉크다', () => {
    expect(token('--brand-500')).toBe('var(--star)');
    expect(token('--brand-700')).toBe('var(--ink)');
  });

  it('예전 파랑 브랜드(#3182F6 계열)는 어느 스타일시트에도 남지 않았다', () => {
    for (const css of [TOKENS, UI, APP]) {
      expect(css).not.toMatch(/#3182F6|#1B64DA|#1650B0|#1F74B3/i);
    }
  });

  it('노랑을 글자색으로 쓰지 않는다 — 종이 위에서 읽히지 않는다', () => {
    for (const css of [UI, APP]) {
      expect(css).not.toMatch(/(^|[;{\s])color:\s*var\(--(star|star-soft|brand-500|brand-300)\)/m);
    }
  });
});

describe('서체 — 제목 Black Han Sans · 본문 Pretendard · 손글씨 Gaegu', () => {
  it('토큰이 세 서체를 가리킨다', () => {
    expect(token('--font-display')).toMatch(/^'Black Han Sans'/);
    expect(token('--font-sans')).toMatch(/^'Pretendard Variable'/);
    expect(token('--font-hand')).toMatch(/^'Gaegu'/);
  });

  it('index.html 이 세 서체를 모두 불러온다', () => {
    expect(HTML).toMatch(/pretendardvariable-dynamic-subset\.min\.css/);
    expect(HTML).toMatch(/fonts\.googleapis\.com\/css2\?family=Black\+Han\+Sans&family=Gaegu:wght@400;700&display=swap/);
  });

  it('제목 · 카드 제목 · 모달 제목 · 통계 숫자는 제목 서체다', () => {
    for (const selector of ['.ui-page-header__title', '.ui-card__title', '.ui-overlay__title', '.ui-stat__value', '.ui-empty__title']) {
      expect(block(UI, selector)).toMatch(/font-family:\s*var\(--font-display\)/);
    }
  });

  it('도움말과 빈 화면 설명은 손글씨다', () => {
    expect(block(UI, '.ui-field__hint')).toMatch(/font-family:\s*var\(--font-hand\)/);
    expect(block(UI, '.ui-empty__description')).toMatch(/font-family:\s*var\(--font-hand\)/);
  });

  it('제목 서체는 굵기가 하나뿐이라 가짜 볼드를 막는다', () => {
    expect(UI).toMatch(/html\s*\{\s*font-synthesis:\s*none;\s*\}/);
  });

  it('본문은 종이 결 위에 Pretendard 다', () => {
    const body = block(APP.slice(APP.indexOf('DESIGN SYSTEM BRIDGE')), 'body');
    expect(body).toMatch(/font-family:\s*var\(--font-sans\)/);
    expect(body).toMatch(/background-color:\s*var\(--paper\)/);
    expect(body).toMatch(/background-image:\s*var\(--grain\)/);
  });
});

describe('선과 모양 — 잉크 선 + 손그림 테두리', () => {
  it('버튼 · 카드 · 입력칸은 각자의 손그림 모양을 쓴다', () => {
    expect(block(UI, '.ui-btn')).toMatch(/border-radius:\s*var\(--shape-btn\)/);
    expect(block(UI, '.ui-card')).toMatch(/border-radius:\s*var\(--shape-panel\)/);
    expect(block(UI, '.ui-card')).toMatch(/border:\s*var\(--stroke\)/);
    expect(UI).toMatch(/\.ui-select\s*\{[^}]*border-radius:\s*var\(--shape-field\)/);
  });

  it('활성 탭 밑줄은 지그재그다', () => {
    expect(block(UI, '.ui-tab[aria-selected="true"]::after')).toMatch(/var\(--zigzag\)/);
  });

  it('현재 메뉴는 형광펜으로 칠한다', () => {
    expect(UI).toMatch(/\.ui-nav-item\[data-active="true"\] > \.ui-truncate\s*\{[^}]*var\(--highlight\)/);
  });
});
