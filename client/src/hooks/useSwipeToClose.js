import { useEffect, useRef } from 'react';
import {
  ignoresSwipe, insideScrolled, releaseVelocity, scrimOpacity, shouldDismiss, swipeIntent
} from '../utils/sheetSwipe';

// tokens.css 의 --duration-normal 과 맞춘다 — 닫히는 움직임이 끝난 뒤 onClose 를 부른다
const SETTLE_MS = 180;
// 바텀시트로 뜨는 폭 — ui.css 의 시트 규칙(768px 부터 가운데 모달)과 맞춘다
const SHEET_QUERY = '(max-width: 767px)';
const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';
const mediaMatches = (query) => Boolean(window.matchMedia?.(query)?.matches);
const MAX_SAMPLES = 8;
// onClose 를 불렀는데도 시트가 남아 있으면(창을 닫지 않고 한 단계 뒤로만 가는 화면 등) 이만큼 뒤에 되돌린다 —
// 화면 밖으로 내려 둔 시트와 투명해진 스크림이 페이지를 막고 있지 않게. 정말 닫혔으면 그 전에 정리가 타이머를 지운다.
const RESTORE_MS = 600;

/**
 * 바텀시트를 손가락으로 끌어내려 닫는다.
 * 본문이 맨 위에 있을 때 아래로 밀면 시트가 손가락을 따라 내려오고, 충분히 내리거나 빠르게 튕기면 닫힌다.
 * 덜 내리면 제자리로 돌아간다. 가로 넘기기(사진 캐러셀)·위로 스크롤·이미 내려간 본문의 스크롤은 브라우저 몫이다.
 * 어느 쪽인지는 처음 움직임에서 정한다 — 브라우저가 스크롤을 시작한 뒤에는 막을 수 없다.
 * React 의 touchmove 는 passive 라 preventDefault 가 듣지 않아서 { passive: false } 로 직접 단다.
 */
export function useSwipeToClose({ enabled, panelRef, scrimRef, onClose }) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const panel = panelRef.current;
    if (!enabled || !panel) return undefined;

    let gesture = null;
    let closing = false;
    let timer = null;

    const setScrim = (opacity, animate) => {
      const scrim = scrimRef.current;
      if (!scrim) return;
      scrim.style.transition = animate ? `opacity ${SETTLE_MS}ms var(--ease)` : 'none';
      scrim.style.opacity = opacity;
    };
    const follow = (offset) => {
      panel.style.transition = 'none';
      panel.style.transform = offset ? `translateY(${offset}px)` : '';
      setScrim(offset ? String(scrimOpacity(offset, panel.offsetHeight)) : '', false);
    };
    const settle = () => {
      const animate = !mediaMatches(REDUCED_MOTION);
      panel.style.transition = animate ? `transform ${SETTLE_MS}ms var(--ease)` : '';
      panel.style.transform = '';
      setScrim('', animate);
    };
    const finishClose = () => {
      onCloseRef.current?.();
      timer = setTimeout(() => {
        closing = false;
        settle();
      }, RESTORE_MS);
    };
    const dismiss = () => {
      closing = true;
      if (mediaMatches(REDUCED_MOTION)) {
        finishClose();
        return;
      }
      panel.style.transition = `transform ${SETTLE_MS}ms var(--ease)`;
      panel.style.transform = 'translateY(100%)';
      setScrim('0', true);
      timer = setTimeout(finishClose, SETTLE_MS);
    };

    const onStart = (event) => {
      gesture = null;
      if (closing || event.touches.length !== 1 || !mediaMatches(SHEET_QUERY) || ignoresSwipe(event.target)) return;
      const { clientX, clientY } = event.touches[0];
      gesture = {
        x: clientX, y: clientY, target: event.target, state: 'wait', offset: 0,
        samples: [{ y: clientY, t: event.timeStamp }]
      };
    };

    const onMove = (event) => {
      if (!gesture || gesture.state === 'other') return;
      if (event.touches.length !== 1) { // 두 손가락(확대) — 끌던 시트는 제자리로
        if (gesture.state === 'drag') settle();
        gesture = null;
        return;
      }
      const { clientX, clientY } = event.touches[0];
      const dy = clientY - gesture.y;
      if (gesture.state === 'wait') {
        const intent = swipeIntent(clientX - gesture.x, dy);
        if (intent === 'wait') return;
        if (intent === 'other' || insideScrolled(gesture.target, panel)) {
          gesture.state = 'other';
          return;
        }
        gesture.state = 'drag';
      }
      if (event.cancelable) event.preventDefault();
      gesture.offset = Math.max(0, dy);
      gesture.samples.push({ y: clientY, t: event.timeStamp });
      if (gesture.samples.length > MAX_SAMPLES) gesture.samples.shift();
      follow(gesture.offset);
    };

    const onEnd = () => {
      const done = gesture;
      gesture = null;
      if (done?.state !== 'drag') return;
      const velocity = releaseVelocity(done.samples);
      if (shouldDismiss({ offset: done.offset, velocity, height: panel.offsetHeight })) dismiss();
      else settle();
    };
    // 브라우저가 제스처를 가져갔다(알림·전화 등) — 닫지 않고 제자리로
    const onCancel = () => {
      if (gesture?.state === 'drag') settle();
      gesture = null;
    };

    panel.addEventListener('touchstart', onStart, { passive: true });
    panel.addEventListener('touchmove', onMove, { passive: false });
    panel.addEventListener('touchend', onEnd);
    panel.addEventListener('touchcancel', onCancel);
    return () => {
      clearTimeout(timer);
      // 시트는 그대로인데 끌어내리기만 꺼졌다(예: 예약 폼으로 바뀜) — 끌던·내려 둔 자리를 남기지 않는다.
      // 닫혀서 사라진 경우(isConnected=false)에는 손댈 것이 없다.
      if (panel.isConnected) {
        panel.style.transition = '';
        panel.style.transform = '';
        setScrim('', false);
        if (scrimRef.current) scrimRef.current.style.transition = '';
      }
      panel.removeEventListener('touchstart', onStart);
      panel.removeEventListener('touchmove', onMove);
      panel.removeEventListener('touchend', onEnd);
      panel.removeEventListener('touchcancel', onCancel);
    };
  }, [enabled, panelRef, scrimRef]);
}

export default useSwipeToClose;
