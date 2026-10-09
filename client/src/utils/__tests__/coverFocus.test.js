import { CENTER, coverCellAspect, focusToPosition, nudgeFocus, panFocus, sameFocus } from '../coverFocus';

describe('coverFocus — 대표 사진의 보일 부분', () => {
  it('CSS object-position 으로 — 없으면 가운데', () => {
    expect(focusToPosition({ x: 10, y: 90.5 })).toBe('10% 90.5%');
    expect(focusToPosition(null)).toBe('50% 50%');
  });

  it('카드 표지에서 칸 모양: 1장 16:10 · 2장 8:10 · 3장 첫 장 8:10 나머지 8:5 · 4장 8:5', () => {
    expect(coverCellAspect(1, 0)).toBeCloseTo(1.6);
    expect(coverCellAspect(2, 1)).toBeCloseTo(0.8);
    expect(coverCellAspect(3, 0)).toBeCloseTo(0.8);
    expect(coverCellAspect(3, 2)).toBeCloseTo(1.6);
    expect(coverCellAspect(4, 3)).toBeCloseTo(1.6);
  });

  describe('끌기', () => {
    // 세로 사진 1000×2000 을 200×100 틀에 cover → 200×400 으로 그려져 세로로 300 넘친다(가로는 안 넘침)
    const frame = { width: 200, height: 100 };
    const portrait = { width: 1000, height: 2000 };

    it('사진을 아래로 끌면 위쪽이 더 보인다 — 넘친 만큼이 0~100 이다', () => {
      expect(panFocus(CENTER, { dy: 150 }, frame, portrait)).toEqual({ x: 50, y: 0 });
      expect(panFocus(CENTER, { dy: -60 }, frame, portrait)).toEqual({ x: 50, y: 70 });
    });

    it('넘치지 않는 쪽으로는 움직이지 않는다 · 끝에서 멈춘다', () => {
      expect(panFocus(CENTER, { dx: 80, dy: -1000 }, frame, portrait)).toEqual({ x: 50, y: 100 });
    });

    it('가로 사진은 가로로 움직인다 — 오른쪽으로 끌면 왼쪽이 더 보인다', () => {
      // 4000×1000 을 200×100 틀에 → 400×100, 가로로 200 넘침
      expect(panFocus({ x: 50, y: 30 }, { dx: 50 }, frame, { width: 4000, height: 1000 })).toEqual({ x: 25, y: 30 });
    });

    it('사진 크기를 아직 모르면 그대로', () => {
      expect(panFocus({ x: 20, y: 20 }, { dx: 50 }, frame, null)).toEqual({ x: 20, y: 20 });
    });
  });

  it('화살표 키 — 그쪽으로 사진을 미는 것과 같다, 5 씩, 끝에서 멈춘다', () => {
    expect(nudgeFocus(CENTER, 'ArrowRight')).toEqual({ x: 45, y: 50 });
    expect(nudgeFocus(CENTER, 'ArrowDown')).toEqual({ x: 50, y: 45 });
    expect(nudgeFocus({ x: 98, y: 0 }, 'ArrowLeft')).toEqual({ x: 100, y: 0 });
    expect(nudgeFocus(CENTER, 'Enter')).toBeNull();
  });

  it('같은 보일 부분인지 — 없으면 가운데로 본다', () => {
    expect(sameFocus(null, { x: 50, y: 50 })).toBe(true);
    expect(sameFocus({ x: 50, y: 49 }, null)).toBe(false);
  });
});
