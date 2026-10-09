import React from 'react';
import { render, screen, fireEvent, within, act } from '@testing-library/react';
import MediaViewer from '../MediaViewer';

const media = (overrides = {}) => ({
  id: 1,
  kind: 'image',
  thumbnailUrl: 'https://drive.google.com/thumbnail?id=f1&sz=w400',
  largeUrl: 'https://drive.google.com/thumbnail?id=f1&sz=w1600',
  originalUrl: 'https://drive.google.com/file/d/f1/view',
  downloadUrl: 'https://drive.google.com/uc?export=download&id=f1',
  previewUrl: null,
  fileName: 'IMG_1.jpg',
  takenAt: '2026-10-05T11:26:00',
  uploader: 'teacher',
  canDelete: false,
  myTags: [],
  ...overrides
});

const video = (id, overrides = {}) => media({
  id,
  kind: 'video',
  fileName: `VID_${id}.mov`,
  previewUrl: `https://drive.google.com/file/d/v${id}/preview`,
  ...overrides
});

describe('MediaViewer — 영상', () => {
  it('Drive 플레이어가 16:9 상자가 아니라 가운데 칸을 꽉 채운다', () => {
    render(<MediaViewer items={[video(1), video(2)]} startId={1} onClose={jest.fn()} />);

    const player = screen.getByTitle('VID_1.mov');
    expect(player.tagName).toBe('IFRAME');
    expect(player).toHaveAttribute('src', 'https://drive.google.com/file/d/v1/preview');
    // 플레이어 칸이 남은 높이를 모두 받고, 넓은 화면에서는 iframe 이 그 칸을 그대로 채운다
    const box = player.parentElement;
    expect(box.style.flexGrow).toBe('1');
    expect(box.parentElement).toBe(screen.getByTestId('video-stage'));
    expect(screen.getByTestId('video-stage').style.alignSelf).toBe('stretch');
    expect(player.style.width).toBe('100%');
    expect(player.style.height).toBe('100%');
    expect(player.style.transform).toBe('none');
    // 휴대폰에서 전체 화면으로 키울 수 있게
    expect(player).toHaveAttribute('allowfullscreen');
    expect(player.getAttribute('allow')).toContain('fullscreen');
  });

  describe('좁은 화면(휴대폰)', () => {
    // jsdom 은 배치를 하지 않아 크기가 늘 0 이다 — 아이폰 세로 크기의 칸을 흉내 낸다.
    // clientWidth 는 Element.prototype 에 있으므로, 덮어쓴 것을 지우면 원래대로 돌아간다.
    const sizes = { clientWidth: 390, clientHeight: 645 };

    beforeEach(() => {
      Object.keys(sizes).forEach((key) => {
        Object.defineProperty(HTMLElement.prototype, key, { configurable: true, get: () => sizes[key] });
      });
    });
    afterEach(() => {
      Object.keys(sizes).forEach((key) => { delete HTMLElement.prototype[key]; });
    });

    it('플레이어를 520px 폭으로 그린 뒤 줄여 보여 준다 — Drive 컨트롤이 영상 가운데가 아니라 아래 막대로 간다', () => {
      render(<MediaViewer items={[video(1)]} startId={1} onClose={jest.fn()} />);

      const player = screen.getByTitle('VID_1.mov');
      expect(player.style.width).toBe('520px');
      expect(player.style.height).toBe('860px');
      expect(player.style.transform).toBe('scale(0.75)');
      expect(player.style.transformOrigin).toBe('top left');
      // 줄인 결과가 넘치지 않게 칸이 자른다
      expect(player.parentElement.style.overflow).toBe('hidden');
    });
  });

  it('이전/다음 버튼은 플레이어 위가 아니라 위쪽 막대에 있다 — Drive 컨트롤을 가리지 않는다', () => {
    render(<MediaViewer items={[video(1), video(2)]} startId={1} onClose={jest.fn()} />);

    const stageArea = screen.getByTestId('video-stage').parentElement;
    expect(within(stageArea).queryByRole('button', { name: '다음 사진' })).toBeNull();
    expect(within(stageArea).queryByRole('button', { name: '이전 사진' })).toBeNull();

    const next = screen.getByRole('button', { name: '다음 사진' });
    expect(next.style.position).toBe('');
    expect(next.parentElement).toHaveTextContent('1 / 2');
  });

  it('다음을 누르면 다음 영상 플레이어로, 사진이면 사진으로 바뀐다', () => {
    render(
      <MediaViewer items={[video(1), video(2), media({ id: 3, fileName: 'IMG_3.jpg' })]} startId={1} onClose={jest.fn()} />
    );

    fireEvent.click(screen.getByRole('button', { name: '다음 사진' }));
    expect(screen.getByTitle('VID_2.mov')).toHaveAttribute('src', 'https://drive.google.com/file/d/v2/preview');
    expect(screen.queryByTitle('VID_1.mov')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: '다음 사진' }));
    expect(screen.queryByTestId('video-stage')).toBeNull();
    expect(screen.getByRole('img', { name: 'IMG_3.jpg' })).toHaveAttribute('src', 'https://drive.google.com/thumbnail?id=f1&sz=w1600');
    // 사진일 때는 예전처럼 사진 양옆에 떠 있다
    expect(screen.getByRole('button', { name: '다음 사진' }).style.position).toBe('absolute');
  });

  it('위쪽 막대와 정보가 플레이어에 겹치지 않는다 — 정보(날짜·올린 사람·길이)는 플레이어 아래 한 줄', () => {
    render(<MediaViewer items={[video(1, { durationMs: 43000 })]} startId={1} onClose={jest.fn()} />);

    // 위쪽 막대는 흐름 안에 자리를 잡는다(겹쳐 뜨지 않는다)
    expect(screen.getByTestId('viewer-top').style.position).toBe('');

    const info = screen.getByTestId('media-info');
    expect(info.style.position).toBe('');
    expect(info.parentElement).toBe(screen.getByTestId('video-stage'));
    // 플레이어 칸 다음에 온다
    expect(screen.getByTitle('VID_1.mov').parentElement.nextElementSibling).toBe(info);
    expect(info).toHaveTextContent('10/5(월) 11:26');
    expect(info).toHaveTextContent('선생님');
    expect(info).toHaveTextContent('0:43');
    expect(screen.queryByText(/Google Drive 플레이어로 재생/)).toBeNull();
  });

  it('하나뿐이면 이전/다음 버튼이 없다', () => {
    render(<MediaViewer items={[video(1)]} startId={1} onClose={jest.fn()} />);

    expect(screen.queryByRole('button', { name: '다음 사진' })).toBeNull();
    expect(screen.queryByRole('button', { name: '이전 사진' })).toBeNull();
  });
});

describe('MediaViewer — 누르는 즉시 재생 (휴대폰)', () => {
  const TAP_KEY = 'rg.drivePlayer.tapSignal';
  const setTouch = (matches) => { window.matchMedia = jest.fn(() => ({ matches })); };
  // 플레이어 안을 누르면 브라우저는 포커스를 iframe 으로 옮기고 창에 blur 를 준다
  const tapInside = (player) => {
    Object.defineProperty(document, 'activeElement', { configurable: true, get: () => player });
    fireEvent.blur(window);
  };

  beforeEach(() => { window.localStorage.clear(); });
  afterEach(() => {
    delete document.activeElement;
    delete window.matchMedia;
  });

  it('신호를 본 적 없는 기기: 예전 그대로 — Drive 의 재생 버튼을 쓰고, 겹친 사진이 없다', () => {
    setTouch(true);
    render(<MediaViewer items={[video(1)]} startId={1} onClose={jest.fn()} />);

    const player = screen.getByTitle('VID_1.mov');
    expect(player).toHaveAttribute('src', 'https://drive.google.com/file/d/v1/preview');
    expect(screen.queryByTestId('video-poster')).toBeNull();
  });

  it('플레이어 안을 누르면 그 기기가 신호를 준다는 것을 기억한다', () => {
    setTouch(true);
    render(<MediaViewer items={[video(1)]} startId={1} onClose={jest.fn()} />);
    expect(window.localStorage.getItem(TAP_KEY)).toBeNull();

    tapInside(screen.getByTitle('VID_1.mov'));
    expect(window.localStorage.getItem(TAP_KEY)).toBe('1');
  });

  it('포커스가 다른 곳에 있는 blur(앱 전환 등)는 탭으로 치지 않는다', () => {
    setTouch(true);
    render(<MediaViewer items={[video(1)]} startId={1} onClose={jest.fn()} />);

    fireEvent.blur(window);
    expect(window.localStorage.getItem(TAP_KEY)).toBeNull();
  });

  it('신호를 본 터치 기기: 준비 상태로 띄우고 미리보기 사진을 겹친다 — 누르는 순간 사진을 치운다', () => {
    setTouch(true);
    window.localStorage.setItem(TAP_KEY, '1');
    render(<MediaViewer items={[video(1)]} startId={1} onClose={jest.fn()} />);

    const player = screen.getByTitle('VID_1.mov');
    // 준비만 하고 기다리게: autoplay=1 을 붙이되 자동 재생 권한은 넘기지 않는다
    expect(player).toHaveAttribute('src', 'https://drive.google.com/file/d/v1/preview?autoplay=1');
    expect(player.getAttribute('allow')).toBe('fullscreen');

    const poster = screen.getByTestId('video-poster');
    expect(poster.parentElement).toBe(player.parentElement);
    // 터치는 사진을 지나 플레이어로 간다
    expect(poster.style.pointerEvents).toBe('none');
    expect(poster.querySelector('img')).toHaveAttribute('src', 'https://drive.google.com/thumbnail?id=f1&sz=w1600');
    expect(poster.querySelector('svg')).not.toBeNull();

    tapInside(player);
    expect(screen.queryByTestId('video-poster')).toBeNull();
    // 같은 iframe 이 그대로 — 다시 불러오면 재생이 끊긴다
    expect(screen.getByTitle('VID_1.mov')).toBe(player);
    expect(player).toHaveAttribute('src', 'https://drive.google.com/file/d/v1/preview?autoplay=1');
  });

  it('blur 이벤트 없이 포커스만 옮겨져도 곧 알아챈다', () => {
    jest.useFakeTimers();
    try {
      setTouch(true);
      window.localStorage.setItem(TAP_KEY, '1');
      render(<MediaViewer items={[video(1)]} startId={1} onClose={jest.fn()} />);
      const player = screen.getByTitle('VID_1.mov');

      Object.defineProperty(document, 'activeElement', { configurable: true, get: () => player });
      act(() => { jest.advanceTimersByTime(150); });
      expect(screen.queryByTestId('video-poster')).toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });

  it('다음 영상으로 넘기면 그 영상도 준비 상태로, 사진을 다시 겹친다', () => {
    setTouch(true);
    window.localStorage.setItem(TAP_KEY, '1');
    render(<MediaViewer items={[video(1), video(2)]} startId={1} onClose={jest.fn()} />);

    tapInside(screen.getByTitle('VID_1.mov'));
    expect(screen.queryByTestId('video-poster')).toBeNull();

    delete document.activeElement;
    fireEvent.click(screen.getByRole('button', { name: '다음 사진' }));
    expect(screen.getByTitle('VID_2.mov')).toHaveAttribute('src', 'https://drive.google.com/file/d/v2/preview?autoplay=1');
    expect(screen.getByTestId('video-poster')).toBeInTheDocument();
  });

  it('마우스를 쓰는 기기(PC)는 신호를 본 적이 있어도 예전 그대로', () => {
    setTouch(false);
    window.localStorage.setItem(TAP_KEY, '1');
    render(<MediaViewer items={[video(1)]} startId={1} onClose={jest.fn()} />);

    const player = screen.getByTitle('VID_1.mov');
    expect(player).toHaveAttribute('src', 'https://drive.google.com/file/d/v1/preview');
    expect(player.getAttribute('allow')).toContain('autoplay');
    expect(screen.queryByTestId('video-poster')).toBeNull();
  });
});

describe('MediaViewer — 사진', () => {
  it('사진이 화면 전체를 쓰고, 위쪽 막대와 아래 정보는 사진 위에 겹쳐 뜬다', () => {
    render(<MediaViewer items={[media({ id: 1 })]} startId={1} onClose={jest.fn()} />);

    const photo = screen.getByRole('img', { name: 'IMG_1.jpg' });
    expect(photo.style.width).toBe('100%');
    expect(photo.style.height).toBe('100%');
    expect(photo.style.objectFit).toBe('contain');

    const top = screen.getByTestId('viewer-top');
    expect(top.style.position).toBe('absolute');
    expect(top.style.top).toBe('0px');

    // 날짜와 올린 사람 — 사진과 같은 칸 안에서 아래쪽에 겹친다. 터치는 사진으로 지나간다.
    const info = screen.getByTestId('media-info');
    expect(info.parentElement).toBe(photo.parentElement);
    expect(info.style.position).toBe('absolute');
    expect(info.style.bottom).toBe('0px');
    expect(info.style.pointerEvents).toBe('none');
    expect(info).toHaveTextContent('10/5(월) 11:26');
    expect(info).toHaveTextContent('선생님');
  });

  it('저장은 위쪽 막대의 아이콘 버튼이다 — 글자 없이 아이콘만, 원본 내려받기 주소를 연다', () => {
    render(<MediaViewer items={[media({ id: 1 })]} startId={1} onClose={jest.fn()} />);

    const save = within(screen.getByTestId('viewer-top')).getByRole('link', { name: '저장' });
    expect(save).toHaveAttribute('href', 'https://drive.google.com/uc?export=download&id=f1');
    expect(save).toHaveAttribute('target', '_blank');
    expect(save).toHaveTextContent('');
    expect(save.querySelector('svg')).not.toBeNull();
    // 강조(별 노랑 위에 잉크) — 예전 저장 버튼과 같은 색. 실제 색은 e2e 가 브라우저에서 잰다.
    expect(save).toHaveAttribute('data-tone', 'accent');

    // 원본 보기도, 아래쪽 버튼 줄도 없다
    expect(screen.queryByText(/원본 보기/)).toBeNull();
    expect(screen.getAllByRole('link')).toHaveLength(1);
  });

  it('삭제는 지울 수 있는 사진에만, 저장 옆 아이콘 버튼으로 보인다', () => {
    const onDelete = jest.fn();
    const mine = media({ id: 1, canDelete: true });
    const { rerender } = render(<MediaViewer items={[mine]} startId={1} onClose={jest.fn()} onDelete={onDelete} />);

    fireEvent.click(within(screen.getByTestId('viewer-top')).getByRole('button', { name: '삭제' }));
    expect(onDelete).toHaveBeenCalledWith(mine);

    rerender(<MediaViewer items={[media({ id: 1, canDelete: false })]} startId={1} onClose={jest.fn()} onDelete={onDelete} />);
    expect(screen.queryByRole('button', { name: '삭제' })).toBeNull();
  });

  it('닫기 버튼과 Esc 로 닫힌다', () => {
    const onClose = jest.fn();
    render(<MediaViewer items={[media({ id: 1 })]} startId={1} onClose={onClose} />);

    fireEvent.click(screen.getByRole('button', { name: '닫기' }));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('얼굴 매칭으로 붙은 아이 이름은 정보 줄에 보이지 않는다 — 매칭이 틀릴 수 있다', () => {
    render(
      <MediaViewer
        items={[media({ id: 1, uploader: 'me', myTags: [{ studentId: 5, name: '김하은', source: 'face' }, { studentId: 6, name: '후보', source: 'candidate' }] })]}
        startId={1}
        onClose={jest.fn()}
      />
    );

    const info = screen.getByTestId('media-info');
    expect(info).not.toHaveTextContent('김하은');
    expect(info).not.toHaveTextContent('후보');
    expect(info).not.toHaveTextContent('우리 아이');
  });
});

describe('MediaViewer — 올린 사람', () => {
  const infoOf = (item) => {
    const { unmount } = render(<MediaViewer items={[media(item)]} startId={1} onClose={jest.fn()} />);
    const text = screen.getByTestId('media-info').textContent;
    unmount();
    return text;
  };

  it('선생님 화면: 학부모가 올린 사진에는 그 학부모의 이름이 나온다', () => {
    const text = infoOf({ uploader: 'parent', uploaderRole: 'parent', uploaderName: '예림엄마' });

    expect(text).toContain('예림엄마');
    expect(text).not.toContain('학부모');
  });

  it('선생님 화면: 선생님이 올린 사진은 그대로 "선생님"', () => {
    const text = infoOf({ uploader: 'teacher', uploaderRole: 'teacher', uploaderName: '이재림' });

    expect(text).toContain('선생님');
    expect(text).not.toContain('이재림');
  });

  it('학부모 화면: 이름이 오지 않으므로 "학부모" · "내가 올림" 으로만 보인다', () => {
    expect(infoOf({ uploader: 'parent' })).toContain('학부모');
    expect(infoOf({ uploader: 'me' })).toContain('내가 올림');
  });
});

describe('MediaViewer — 옆으로 밀어 넘기기 (휴대폰)', () => {
  const photo = (id) => media({
    id,
    fileName: `IMG_${id}.jpg`,
    thumbnailUrl: `https://lh3.googleusercontent.com/d/f${id}=w400-h400-c-rw`,
    largeUrl: `https://lh3.googleusercontent.com/d/f${id}=w1600`
  });
  const clip = (id) => video(id, { largeUrl: `https://lh3.googleusercontent.com/d/v${id}=w1600` });
  const counter = () => within(screen.getByTestId('viewer-top')).getByText(/\d+ \/ \d+/).textContent;

  // 한 손가락(또는 fingers 개)으로 (200, 400) 에서 dx·dy 만큼 나눠 움직이고 뗀다. touchmove 마다 기본 동작을 막았는지 돌려준다
  const drag = (target, { dx, dy = 0, steps = 4, fingers = 1, release = true }) => {
    const at = (x, y) => Array.from({ length: fingers }, () => ({ clientX: x, clientY: y }));
    fireEvent.touchStart(target, { touches: at(200, 400) });
    const prevented = [];
    for (let i = 1; i <= steps; i += 1) {
      prevented.push(!fireEvent.touchMove(target, { touches: at(200 + (dx * i) / steps, 400 + (dy * i) / steps) }));
    }
    if (release) fireEvent.touchEnd(target, { touches: [] });
    return prevented;
  };
  const settle = () => act(() => { jest.advanceTimersByTime(200); });

  beforeEach(() => { jest.useFakeTimers(); });
  afterEach(() => {
    jest.useRealTimers();
    delete window.visualViewport;
  });

  it('사진을 왼쪽으로 밀면 다음 장 — 다음이 영상이면 영상 플레이어가 뜬다', () => {
    render(<MediaViewer items={[photo(1), clip(2), photo(3)]} startId={1} onClose={jest.fn()} />);
    expect(counter()).toBe('1 / 3');

    drag(screen.getByRole('dialog'), { dx: -150 });
    settle();

    expect(counter()).toBe('2 / 3');
    expect(screen.getByTitle('VID_2.mov')).toHaveAttribute('src', 'https://drive.google.com/file/d/v2/preview');
    // 다 넘긴 뒤 줄은 제자리 — 새 장이 가운데
    expect(screen.getByTestId('viewer-track').style.transform).toBe('');
  });

  it('오른쪽으로 밀면 이전 장 — 첫 장에서는 버튼처럼 마지막 장으로 돈다', () => {
    render(<MediaViewer items={[photo(1), clip(2), photo(3)]} startId={1} onClose={jest.fn()} />);

    drag(screen.getByRole('dialog'), { dx: 150 });
    settle();
    expect(counter()).toBe('3 / 3');
    expect(screen.getByRole('img', { name: 'IMG_3.jpg' })).toBeInTheDocument();
  });

  it('미는 동안 지금 장이 손가락을 따라 움직이고, 옆으로 미는 것은 브라우저가 가져가지 않게 막는다', () => {
    render(<MediaViewer items={[photo(1), photo(2)]} startId={1} onClose={jest.fn()} />);

    const prevented = drag(screen.getByRole('dialog'), { dx: -60, release: false });
    expect(screen.getByTestId('viewer-track').style.transform).toBe('translateX(-60px)');
    expect(prevented.every(Boolean)).toBe(true);
  });

  it('조금만 밀고 놓으면 제자리로 돌아간다', () => {
    render(<MediaViewer items={[photo(1), photo(2)]} startId={1} onClose={jest.fn()} />);

    drag(screen.getByRole('dialog'), { dx: -40 });
    settle();
    expect(counter()).toBe('1 / 2');
    expect(screen.getByTestId('viewer-track').style.transform).toBe('');
  });

  it('위아래로 움직인 것은 넘기지 않고 막지도 않는다', () => {
    render(<MediaViewer items={[photo(1), photo(2)]} startId={1} onClose={jest.fn()} />);

    const prevented = drag(screen.getByRole('dialog'), { dx: -30, dy: 200 });
    settle();
    expect(counter()).toBe('1 / 2');
    expect(prevented.some(Boolean)).toBe(false);
    expect(screen.getByTestId('viewer-track').style.transform).toBe('');
  });

  it('영상일 때는 플레이어 바깥(위쪽 막대)을 밀어 넘긴다 — 플레이어 안의 터치는 우리에게 오지 않는다', () => {
    render(<MediaViewer items={[clip(1), photo(2)]} startId={1} onClose={jest.fn()} />);

    drag(screen.getByTestId('viewer-top'), { dx: -150 });
    settle();
    expect(screen.queryByTestId('video-stage')).toBeNull();
    expect(screen.getByRole('img', { name: 'IMG_2.jpg' })).toBeInTheDocument();

    // 아래 정보 줄에서 밀어도 된다
    drag(screen.getByTestId('media-info'), { dx: 150 });
    settle();
    expect(screen.getByTitle('VID_1.mov')).toBeInTheDocument();
  });

  it('두 손가락(확대)이나 확대해 둔 화면에서는 넘기지 않는다', () => {
    render(<MediaViewer items={[photo(1), photo(2)]} startId={1} onClose={jest.fn()} />);

    drag(screen.getByRole('dialog'), { dx: -150, fingers: 2 });
    settle();
    expect(counter()).toBe('1 / 2');

    window.visualViewport = { scale: 2 };
    drag(screen.getByRole('dialog'), { dx: -150 });
    settle();
    expect(counter()).toBe('1 / 2');
  });

  it('움직임을 줄이는 설정이면 미끄러지지 않고 바로 바뀐다', () => {
    window.matchMedia = jest.fn((query) => ({ matches: query === '(prefers-reduced-motion: reduce)' }));
    try {
      render(<MediaViewer items={[photo(1), photo(2)]} startId={1} onClose={jest.fn()} />);
      drag(screen.getByRole('dialog'), { dx: -150 });
      expect(counter()).toBe('2 / 2');
    } finally {
      delete window.matchMedia;
    }
  });

  it('양옆 장을 화면 밖에 미리 그려 둔다 — 화면 읽기에는 지금 장만 보인다', () => {
    render(<MediaViewer items={[photo(1), photo(2), clip(3)]} startId={2} onClose={jest.fn()} />);

    const [prev, next] = screen.getAllByTestId('viewer-peek');
    expect(prev).toHaveAttribute('aria-hidden', 'true');
    expect(prev.querySelector('img')).toHaveAttribute('src', 'https://lh3.googleusercontent.com/d/f1=w1600');
    expect(prev.style.transform).toBe('translateX(calc(-100% + -16px))');
    // 다음 장이 영상이면 미리보기 사진 + 재생 표시
    expect(next.querySelector('img')).toHaveAttribute('src', 'https://lh3.googleusercontent.com/d/v3=w1600');
    expect(next.querySelector('svg')).not.toBeNull();
    expect(next.style.transform).toBe('translateX(calc(100% + 16px))');

    expect(screen.getAllByRole('img')).toHaveLength(1);
    expect(screen.getByRole('img', { name: 'IMG_2.jpg' })).toBeInTheDocument();
  });

  it('하나뿐이면 옆 장도 없고 밀어도 그대로', () => {
    render(<MediaViewer items={[photo(1)]} startId={1} onClose={jest.fn()} />);
    expect(screen.queryAllByTestId('viewer-peek')).toHaveLength(0);

    drag(screen.getByRole('dialog'), { dx: -150 });
    settle();
    expect(screen.getByTestId('viewer-track').style.transform).toBe('');
    expect(screen.getByRole('img', { name: 'IMG_1.jpg' })).toBeInTheDocument();
  });
});
