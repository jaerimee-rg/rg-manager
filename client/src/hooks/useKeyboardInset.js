import { useEffect, useState } from 'react';
import { keyboardInset } from '../utils/mediaCaption';

/**
 * 휴대폰 키보드가 화면 아래를 가린 높이(px). 아래에 붙은 입력 창을 그만큼 올려 키보드 위에 보이게 한다.
 * visualViewport 가 없는 브라우저에서는 늘 0 이다.
 */
export function useKeyboardInset(enabled = true) {
  const [inset, setInset] = useState(0);

  useEffect(() => {
    const viewport = window.visualViewport;
    if (!enabled || !viewport) return undefined;

    const sync = () => setInset(keyboardInset({
      innerHeight: window.innerHeight, height: viewport.height, offsetTop: viewport.offsetTop
    }));
    sync();
    viewport.addEventListener('resize', sync);
    viewport.addEventListener('scroll', sync);
    return () => {
      viewport.removeEventListener('resize', sync);
      viewport.removeEventListener('scroll', sync);
      setInset(0);
    };
  }, [enabled]);

  return inset;
}

export default useKeyboardInset;
