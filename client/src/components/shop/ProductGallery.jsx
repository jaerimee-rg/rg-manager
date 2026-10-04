import React, { useEffect, useRef, useState } from 'react';
import { Icon, IconButton } from '../ui';

/** 가로 스크롤 위치 → 지금 보이는 사진 번호 */
export const slideIndexAt = (scrollLeft, width, count) => {
  if (!width || !count) return 0;
  return Math.min(count - 1, Math.max(0, Math.round(scrollLeft / width)));
};

/**
 * 상품 사진 넘기기(캐러셀).
 * 모바일 — 밀어서 넘기고(스크롤 스냅) 아래 점으로 위치를 본다.
 * 데스크톱 — 큰 사진의 ‹ ›, 아래 작은 사진을 누르면 그 사진이 큰 칸에. ←/→ 키도 된다.
 * 어느 쪽을 보일지는 CSS(768px)가 정한다 — 같은 DOM 이다.
 */
function ProductGallery({ images = [], title }) {
  const trackRef = useRef(null);
  const settling = useRef(null); // 화살표·작은 사진으로 부드럽게 넘기는 동안은 스크롤 위치로 번호를 다시 정하지 않는다
  const [index, setIndex] = useState(0);
  const count = images.length;
  const many = count > 1;

  const go = (next, behavior = 'smooth') => {
    const target = Math.min(count - 1, Math.max(0, next));
    setIndex(target);
    const track = trackRef.current;
    if (!track?.scrollTo) return;
    clearTimeout(settling.current);
    settling.current = setTimeout(() => { settling.current = null; }, 600);
    track.scrollTo({ left: target * track.clientWidth, behavior });
  };
  useEffect(() => () => clearTimeout(settling.current), []);

  const onScroll = () => {
    const track = trackRef.current;
    if (!track || settling.current) return;
    setIndex(slideIndexAt(track.scrollLeft, track.clientWidth, count));
  };
  // 스크롤이 멈추면 그 위치가 맞다 — 부드러운 넘기기가 끝났을 때도 (React 18 은 onScrollEnd 를 모른다)
  useEffect(() => {
    const track = trackRef.current;
    if (!track) return undefined;
    const onScrollEnd = () => {
      clearTimeout(settling.current);
      settling.current = null;
      setIndex(slideIndexAt(track.scrollLeft, track.clientWidth, count));
    };
    track.addEventListener('scrollend', onScrollEnd);
    return () => track.removeEventListener('scrollend', onScrollEnd);
  }, [count]);

  const latest = useRef(null);
  latest.current = { go, index };
  useEffect(() => {
    if (!many) return undefined;
    const onKey = (event) => {
      if (event.key === 'ArrowRight') latest.current.go(latest.current.index + 1);
      if (event.key === 'ArrowLeft') latest.current.go(latest.current.index - 1);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [many]);

  return (
    <div className="shop-gallery" aria-roledescription="carousel" aria-label="상품 사진">
      <div className="shop-gallery__main">
        <div className="shop-gallery__track" ref={trackRef} onScroll={onScroll}>
          {count ? images.map((src, i) => (
            <div
              key={src}
              className="shop-gallery__slide"
              role="group"
              aria-roledescription="slide"
              aria-label={`${i + 1} / ${count}`}
              aria-hidden={i === index ? undefined : 'true'}
            >
              <img src={src} alt={`${title} 사진 ${i + 1}`} loading={i === 0 ? 'eager' : 'lazy'} draggable={false} />
            </div>
          )) : (
            <div className="shop-gallery__slide"><Icon name="image" size={48} /></div>
          )}
        </div>
        {many && (
          <>
            <IconButton
              className="shop-gallery__nav"
              data-side="prev"
              icon="chevronLeft"
              label="이전 사진"
              disabled={index === 0}
              onClick={() => go(index - 1)}
            />
            <IconButton
              className="shop-gallery__nav"
              data-side="next"
              icon="chevronRight"
              label="다음 사진"
              disabled={index === count - 1}
              onClick={() => go(index + 1)}
            />
            <span className="shop-gallery__counter" aria-live="polite">{index + 1} / {count}</span>
          </>
        )}
      </div>

      {many && (
        <>
          <div className="shop-gallery__dots">
            {images.map((src, i) => (
              <button
                key={src}
                type="button"
                className="shop-gallery__dot"
                aria-label={`${i + 1}번째 사진`}
                aria-current={i === index ? 'true' : undefined}
                onClick={() => go(i)}
              />
            ))}
          </div>
          <div className="shop-gallery__thumbs">
            {images.map((src, i) => (
              <button
                key={src}
                type="button"
                className="shop-gallery__thumb"
                aria-label={`${i + 1}번째 사진 보기`}
                aria-current={i === index ? 'true' : undefined}
                onClick={() => go(i)}
              >
                <img src={src} alt="" loading="lazy" draggable={false} />
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export default ProductGallery;
