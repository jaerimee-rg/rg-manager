import { useEffect, useRef } from 'react';
import { flushSync } from 'react-dom';
import { releaseVelocity } from '../utils/sheetSwipe';
import { pageDistance, pageIntent, pageStep } from '../utils/viewerSwipe';

// tokens.css 의 --duration-normal 과 맞춘다 — 옆 장이 다 들어온 뒤 onStep 을 부른다
const SETTLE_MS = 180;
const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';
const mediaMatches = (query) => Boolean(window.matchMedia?.(query)?.matches);
const MAX_SAMPLES = 8;
// 화면을 손가락으로 확대해 둔 상태 — 그때 옆으로 미는 것은 확대한 사진을 둘러보는 것이다
const zoomedIn = () => (window.visualViewport?.scale ?? 1) > 1.01;

/**
 * 전체 화면 뷰어를 옆으로 밀어 이전·다음 장으로 넘긴다.
 * 손가락을 따라 track(지금 장 + 양옆 장)이 움직이고, 충분히 밀거나 빠르게 튕기면 옆 장이 들어온 뒤 onStep(±1) 을 부른다.
 * 덜 밀면 제자리로 돌아간다. 위아래 움직임 · 두 손가락(확대) · 확대해 둔 화면은 브라우저 몫이다.
 * 어느 쪽인지는 처음 움직임에서 정한다. React 의 touchmove 는 passive 라 { passive: false } 로 직접 단다.
 *
 * 터치는 area 에서 받는다. Drive 영상 플레이어(다른 출처의 iframe) 안의 터치는 우리에게 오지 않으므로
 * 영상일 때는 플레이어 바깥(위쪽 막대 · 아래 정보 줄)에서 밀어야 넘어간다.
 * track 은 장이 바뀌어도 같은 요소여야 한다 — 매번 trackRef 에서 다시 읽는다.
 */
export function useSwipeToPage({ enabled, areaRef, trackRef, onStep }) {
  const onStepRef = useRef(onStep);
  onStepRef.current = onStep;

  useEffect(() => {
    const area = areaRef.current;
    if (!enabled || !area) return undefined;

    let gesture = null;
    let turning = false;
    let timer = null;

    const place = (offset, animate) => {
      const track = trackRef.current;
      if (!track) return;
      track.style.transition = animate ? `transform ${SETTLE_MS}ms var(--ease)` : 'none';
      track.style.transform = offset ? `translateX(${offset}px)` : '';
    };
    const settle = () => place(0, !mediaMatches(REDUCED_MOTION));
    // 옆 장을 끝까지 들여온 뒤 장을 바꾸고, 같은 그림이 된 track 을 소리 없이 제자리로
    const turn = (step) => {
      const finish = () => {
        timer = null;
        turning = false;
        // 새 장이 그려진 다음에 track 을 되돌려야 옛 장이 한 번 비치지 않는다
        flushSync(() => onStepRef.current?.(step));
        place(0, false);
      };
      if (mediaMatches(REDUCED_MOTION)) {
        finish();
        return;
      }
      turning = true;
      place(-step * pageDistance(trackRef.current?.offsetWidth || 0), true);
      timer = setTimeout(finish, SETTLE_MS);
    };

    const onStart = (event) => {
      gesture = null;
      if (turning || event.touches.length !== 1 || zoomedIn()) return;
      const { clientX, clientY } = event.touches[0];
      gesture = { x: clientX, y: clientY, state: 'wait', offset: 0, samples: [{ x: clientX, t: event.timeStamp }] };
    };

    const onMove = (event) => {
      if (!gesture || gesture.state === 'other') return;
      if (event.touches.length !== 1) { // 두 손가락(확대) — 밀던 장은 제자리로
        if (gesture.state === 'drag') settle();
        gesture = null;
        return;
      }
      const { clientX, clientY } = event.touches[0];
      const dx = clientX - gesture.x;
      if (gesture.state === 'wait') {
        const intent = pageIntent(dx, clientY - gesture.y);
        if (intent === 'wait') return;
        if (intent === 'other') {
          gesture.state = 'other';
          return;
        }
        gesture.state = 'drag';
      }
      if (event.cancelable) event.preventDefault();
      gesture.offset = dx;
      gesture.samples.push({ x: clientX, t: event.timeStamp });
      if (gesture.samples.length > MAX_SAMPLES) gesture.samples.shift();
      place(dx, false);
    };

    const onEnd = () => {
      const done = gesture;
      gesture = null;
      if (done?.state !== 'drag') return;
      const step = pageStep({
        offset: done.offset,
        velocity: releaseVelocity(done.samples, 'x'),
        width: trackRef.current?.offsetWidth || 0
      });
      if (step) turn(step);
      else settle();
    };
    // 브라우저가 제스처를 가져갔다(알림·전화 등) — 넘기지 않고 제자리로
    const onCancel = () => {
      if (gesture?.state === 'drag') settle();
      gesture = null;
    };

    area.addEventListener('touchstart', onStart, { passive: true });
    area.addEventListener('touchmove', onMove, { passive: false });
    area.addEventListener('touchend', onEnd);
    area.addEventListener('touchcancel', onCancel);
    return () => {
      clearTimeout(timer);
      // 넘기기가 꺼졌다(한 장만 남음 등) — 밀던 자리를 남기지 않는다
      const track = trackRef.current;
      if (track?.isConnected) {
        track.style.transition = '';
        track.style.transform = '';
      }
      area.removeEventListener('touchstart', onStart);
      area.removeEventListener('touchmove', onMove);
      area.removeEventListener('touchend', onEnd);
      area.removeEventListener('touchcancel', onCancel);
    };
  }, [enabled, areaRef, trackRef]);
}

export default useSwipeToPage;
