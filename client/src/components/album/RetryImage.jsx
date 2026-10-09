import React, { useEffect, useRef, useState } from 'react';
import { Icon } from '../ui';
import { retryDelay, retryUrl } from '../../utils/imageRetry';

/**
 * 못 뜨면 잠시 뒤 다시 불러오는 썸네일 <img> (규칙은 utils/imageRetry.js).
 * 기다리는 동안에는 깨진 그림 대신 칸 배경만 보이고, 끝내 실패하면 사진 아이콘을 보인다 —
 * 빈칸이면 아직 오는 중인지 없는 것인지 알 수 없다.
 * 아이콘 자리도 이미지와 같은 style 을 받아 칸을 똑같이 채운다(onClick 등도 그대로 넘긴다).
 */
function RetryImage({ src, ...props }) {
  // 주소가 바뀌면 처음부터 다시
  return src ? <RetryingImage key={src} src={src} {...props} /> : null;
}

function RetryingImage({ src, alt = '', style, loading, ...rest }) {
  const [attempt, setAttempt] = useState(0);
  const [waiting, setWaiting] = useState(false);
  const [failed, setFailed] = useState(false);
  const timer = useRef(null);

  useEffect(() => () => clearTimeout(timer.current), []);

  const handleError = () => {
    const delay = retryDelay(attempt);
    if (delay === null) {
      setFailed(true);
      return;
    }
    setWaiting(true);
    timer.current = setTimeout(() => {
      setWaiting(false);
      setAttempt((n) => n + 1);
    }, delay);
  };

  if (failed) {
    return (
      <span
        data-testid="image-failed"
        role={alt ? 'img' : undefined}
        aria-label={alt || undefined}
        aria-hidden={alt ? undefined : 'true'}
        {...rest}
        style={{
          width: '100%', height: '100%', ...style,
          display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ink-400)'
        }}
      >
        <Icon name="image" size={20} />
      </span>
    );
  }

  return (
    <img
      src={retryUrl(src, attempt)}
      alt={alt}
      loading={loading}
      {...rest}
      style={waiting ? { ...style, visibility: 'hidden' } : style}
      onError={handleError}
    />
  );
}

export default RetryImage;
