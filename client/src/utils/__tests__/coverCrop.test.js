import {
  MAX_COVER_ZOOM, toCrop, normalizeCrop, sameCrop, cropStyle, panCrop, zoomCrop, pinchCrop, coverImageUrl
} from '../coverCrop';

describe('coverCrop — 대표 사진의 보일 부분', () => {
  it('toCrop — 범위 안으로 넣고 서버처럼 반올림한다 · 없으면 가운데', () => {
    expect(MAX_COVER_ZOOM).toBe(3);
    expect(toCrop({ x: 12.345, y: 140, zoom: 5 })).toEqual({ x: 12.3, y: 100, zoom: 3 });
    expect(toCrop({ x: -3, y: NaN, zoom: 0.2 })).toEqual({ x: 0, y: 50, zoom: 1 });
    expect(toCrop(null)).toEqual({ x: 50, y: 50, zoom: 1 });
  });

  it('normalizeCrop — 서버(mediaValidation.normalizeCoverCrop)와 같이, 가운데·확대 없음은 null', () => {
    expect(normalizeCrop({ x: 50, y: 50, zoom: 1 })).toBeNull();
    expect(normalizeCrop({ x: 50.02, y: 49.98, zoom: 1.001 })).toBeNull();
    expect(normalizeCrop(null)).toBeNull();
    expect(normalizeCrop({ x: 12.345, y: 99.99, zoom: 1.256 })).toEqual({ x: 12.3, y: 100, zoom: 1.26 });
  });

  it('sameCrop — null 과 가운데는 같다', () => {
    expect(sameCrop(null, { x: 50, y: 50, zoom: 1 })).toBe(true);
    expect(sameCrop({ x: 10, y: 20, zoom: 2 }, { x: 10, y: 20, zoom: 2 })).toBe(true);
    expect(sameCrop({ x: 10, y: 20, zoom: 2 }, { x: 10, y: 20, zoom: 1.5 })).toBe(false);
  });

  it('cropStyle — object-position 으로 맞추고, 확대하면 같은 점을 중심으로 키운다 · 고르지 않았으면 기본(가운데)', () => {
    expect(cropStyle(null)).toEqual({});
    expect(cropStyle({ x: 50, y: 50, zoom: 1 })).toEqual({});
    expect(cropStyle({ x: 30, y: 70, zoom: 1 })).toEqual({ objectPosition: '30% 70%' });
    expect(cropStyle({ x: 30, y: 70, zoom: 2 })).toEqual({ objectPosition: '30% 70%', transform: 'scale(2)', transformOrigin: '30% 70%' });
  });

  describe('panCrop — 손가락이 움직인 만큼 사진이 따라온다', () => {
    // 칸 160×100(16:10) 에 1000×1500 세로 사진 → cover 로 160×240, 위아래로 140px 넘친다
    const portrait = { boxWidth: 160, boxHeight: 100, imageWidth: 1000, imageHeight: 1500 };

    it('세로 사진을 아래로 14px 끌면 위쪽이 10% 더 보인다 — 좌우는 넘칠 것이 없어 그대로', () => {
      expect(panCrop({ x: 50, y: 50, zoom: 1 }, { ...portrait, dx: 40, dy: 14 })).toEqual({ x: 50, y: 40, zoom: 1 });
      expect(panCrop(null, { ...portrait, dy: -28 })).toEqual({ x: 50, y: 70, zoom: 1 });
    });

    it('끝까지 가면 거기서 멈춘다(0~100)', () => {
      expect(panCrop({ x: 50, y: 5, zoom: 1 }, { ...portrait, dy: 200 })).toEqual({ x: 50, y: 0, zoom: 1 });
    });

    it('확대하면 넘치는 만큼이 커져 같은 거리에 덜 움직인다 · 좌우도 움직인다', () => {
      // zoom 2 → 320×480: 좌우 160, 위아래 380 넘친다
      expect(panCrop({ x: 50, y: 50, zoom: 2 }, { ...portrait, dx: -16, dy: 38 })).toEqual({ x: 60, y: 40, zoom: 2 });
    });

    it('크기를 모르면(사진을 아직 못 읽었다) 그대로', () => {
      expect(panCrop({ x: 30, y: 30, zoom: 1 }, { dx: 10, dy: 10, boxWidth: 160, boxHeight: 100, imageWidth: 0, imageHeight: 0 }))
        .toEqual({ x: 30, y: 30, zoom: 1 });
    });
  });

  describe('pinchCrop — 두 손가락으로 벌리고 옮기기', () => {
    // 칸 160×100 에 1000×1500 세로 사진 → cover 로 160×240
    const size = { boxWidth: 160, boxHeight: 100, imageWidth: 1000, imageHeight: 1500 };

    it('가운데에서 두 배로 벌리면 가운데를 중심으로 두 배', () => {
      expect(pinchCrop(null, { ...size, start: { x: 80, y: 50, distance: 40 }, now: { x: 80, y: 50, distance: 80 } }))
        .toEqual({ x: 50, y: 50, zoom: 2 });
    });

    it('손가락 가운데 아래의 사진 점이 그 자리에 남는다 — 위쪽에서 벌리면 위쪽이 커진다', () => {
      const start = { x: 80, y: 10, distance: 40 };
      const crop = pinchCrop(null, { ...size, start, now: { ...start, distance: 80 } });
      expect(crop.zoom).toBe(2);
      // 손가락 아래 점: 처음 (10 + 70) / 240 = 1/3. 두 배(480)에서 그 점이 y=10 에 오려면 왼쪽 위 끝은 10 − 160 = −150 → y = 150/380
      expect(crop.y).toBeCloseTo((100 * 150) / 380, 1);
      expect(crop.x).toBe(50);   // 좌우는 가운데에서 벌렸다
    });

    it('벌리지 않고 옮기기만 하면 panCrop 과 같다', () => {
      const from = { x: 50, y: 50, zoom: 1.5 };
      expect(pinchCrop(from, { ...size, start: { x: 80, y: 50, distance: 30 }, now: { x: 70, y: 64, distance: 30 } }))
        .toEqual(panCrop(from, { ...size, dx: -10, dy: 14 }));
    });

    it('확대는 1~3배 안에서 멈춘다 · 오므리면 줄어든다', () => {
      const start = { x: 80, y: 50, distance: 100 };
      expect(pinchCrop({ x: 50, y: 50, zoom: 2 }, { ...size, start, now: { ...start, distance: 1000 } }).zoom).toBe(3);
      expect(pinchCrop({ x: 50, y: 50, zoom: 2 }, { ...size, start, now: { ...start, distance: 10 } }).zoom).toBe(1);
      expect(pinchCrop({ x: 50, y: 50, zoom: 2 }, { ...size, start, now: { ...start, distance: 75 } }).zoom).toBe(1.5);
    });

    it('크기를 모르면 그대로', () => {
      expect(pinchCrop({ x: 30, y: 30, zoom: 1 }, { ...size, imageWidth: 0, start: { x: 0, y: 0, distance: 10 }, now: { x: 0, y: 0, distance: 20 } }))
        .toEqual({ x: 30, y: 30, zoom: 1 });
    });
  });

  it('zoomCrop — 위치는 두고 확대만(1~3)', () => {
    expect(zoomCrop({ x: 20, y: 30, zoom: 1 }, 2.333)).toEqual({ x: 20, y: 30, zoom: 2.33 });
    expect(zoomCrop({ x: 20, y: 30, zoom: 1 }, 9)).toEqual({ x: 20, y: 30, zoom: 3 });
  });

  it('coverImageUrl — 서버(mediaSerializer.coverImageUrl)와 같은 주소: 자르지 않고, 확대한 만큼 크게', () => {
    expect(coverImageUrl('f1')).toBe('https://lh3.googleusercontent.com/d/f1=w1000-rw');
    expect(coverImageUrl('f1', { single: false })).toBe('https://lh3.googleusercontent.com/d/f1=s800-rw');
    expect(coverImageUrl('f1', { zoom: 1.5 })).toBe('https://lh3.googleusercontent.com/d/f1=w1500-rw');
    expect(coverImageUrl('f1', { single: false, zoom: 1.33 })).toBe('https://lh3.googleusercontent.com/d/f1=s1100-rw');
    expect(coverImageUrl('f1', { zoom: 3 })).toBe('https://lh3.googleusercontent.com/d/f1=w1600-rw');
    expect(coverImageUrl(null)).toBeNull();
  });
});
