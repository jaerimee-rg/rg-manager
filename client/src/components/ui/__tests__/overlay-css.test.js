import { readFileSync } from 'fs';
import path from 'path';

/**
 * Modal(.ui-overlay)의 위치는 CSS 가 정한다. 그래서 jsdom 으로는 못 잡는 회귀가 하나 있다:
 * `mode="modal"` 의 위치 규칙이 통째로 `@media (min-width: 768px)` 안에만 있으면,
 * 모바일에서 `position: fixed` 패널이 inset 없이 static 위치(= body 맨 아래)로 떨어져
 * 화면 밖에 그려진다. 스크림만 깔리고 내용은 안 보인다.
 * (대시보드 "수업별 출석 현황"의 출석 학생 목록이 모바일에서 안 보이던 원인)
 *
 * 그래서 스타일시트를 직접 읽어, 가운데 정렬 규칙이 데스크탑 전용이 아닌지 확인한다.
 */

const CSS = readFileSync(path.join(__dirname, '../../../styles/ui.css'), 'utf8');

/** `@media` 중 min-width 조건이 붙은 블록(= 데스크탑 전용)을 통째로 걷어낸다. */
const withoutDesktopOnlyBlocks = (css) => {
  let out = '';
  let i = 0;

  while (i < css.length) {
    const at = css.indexOf('@media', i);
    if (at === -1) {
      out += css.slice(i);
      break;
    }

    const open = css.indexOf('{', at);
    if (open === -1) {
      out += css.slice(i);
      break;
    }

    // 블록의 짝이 맞는 닫는 중괄호를 찾는다.
    let depth = 0;
    let end = open;
    for (; end < css.length; end += 1) {
      if (css[end] === '{') depth += 1;
      else if (css[end] === '}') {
        depth -= 1;
        if (depth === 0) break;
      }
    }

    const condition = css.slice(at, open);
    out += css.slice(i, at);
    // min-width 미디어 쿼리만 버린다. max-width(모바일 전용)는 남긴다.
    if (!/min-width/.test(condition)) out += css.slice(at, end + 1);
    i = end + 1;
  }

  return out;
};

/** 선택자에 딸린 선언 블록을 전부 모아서 돌려준다. */
const declarationsFor = (css, selector) => {
  const rules = [];
  const needle = selector;
  let from = 0;

  for (;;) {
    const at = css.indexOf(needle, from);
    if (at === -1) break;
    const open = css.indexOf('{', at);
    const close = css.indexOf('}', open);
    if (open === -1 || close === -1) break;

    // 선택자 목록 안에 있는지(다른 선택자의 일부가 아닌지) 확인한다.
    const selectorList = css.slice(css.lastIndexOf('}', at) + 1, open);
    if (selectorList.includes(needle)) rules.push(css.slice(open + 1, close));
    from = close + 1;
  }

  return rules.join('\n');
};

describe('ui.css — .ui-overlay 위치 규칙', () => {
  const mobileCss = withoutDesktopOnlyBlocks(CSS);

  it('mode="modal" 은 데스크탑 미디어 쿼리 밖에서도 화면 가운데에 고정된다', () => {
    const modalRules = declarationsFor(mobileCss, '.ui-overlay[data-mode="modal"]');

    expect(modalRules).toMatch(/left:\s*50%/);
    expect(modalRules).toMatch(/top:\s*50%/);
    expect(modalRules).toMatch(/transform:\s*translate\(-50%,\s*-50%\)/);
  });

  it('mode="modal" 은 모바일에서도 폭과 최대 높이를 갖는다 (내용만큼 쪼그라들지 않게)', () => {
    const modalRules = declarationsFor(mobileCss, '.ui-overlay[data-mode="modal"]');

    expect(modalRules).toMatch(/width:\s*min\(/);
    expect(modalRules).toMatch(/max-height:/);
  });

  it('mode="sheet" 는 모바일에서 화면 아래에 붙는 바텀시트로 남는다', () => {
    const sheetRules = declarationsFor(mobileCss, '.ui-overlay[data-mode="sheet"]');

    expect(sheetRules).toMatch(/bottom:\s*0/);
    expect(sheetRules).toMatch(/max-height:/);
  });

  it('바텀시트 손잡이(grip)는 가운데 모달에는 나오지 않는다', () => {
    expect(CSS).toMatch(/\.ui-overlay\[data-mode="modal"\]\s+\.ui-overlay__grip\s*\{[^}]*display:\s*none/);
  });
});
