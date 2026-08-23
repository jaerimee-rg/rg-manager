import { useState, useEffect } from 'react';

/**
 * 미디어 쿼리 커스텀 훅
 * @param {number} breakpoint - 브레이크포인트 (px)
 * @returns {boolean} - breakpoint 이하이면 true
 */
export const useIsMobile = (breakpoint = 768) => {
  const [isMobile, setIsMobile] = useState(window.innerWidth <= breakpoint);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= breakpoint);

    // breakpoint 가 바뀌면 다음 resize 를 기다리지 않고 지금 폭으로 다시 판정한다.
    // (창 크기는 그대로인데 기준만 바뀌는 경우 이전 값이 남아 있었다)
    handleResize();

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [breakpoint]);

  return isMobile;
};
