import React, { useEffect, useRef, useState } from 'react';
import { getKakaoMapKey, hasCoordinates, loadKakaoMaps } from '../../utils/kakaoMap';

/**
 * 이벤트 장소를 보여주는 작은 카카오 지도 (마커 하나).
 *
 * 페이지 안에 끼워 넣는 미리보기라 끌기·휠 확대를 끈다 — 휴대폰에서 손가락으로 페이지를 내리다
 * 지도가 스크롤을 가로채지 않게. 크게 보거나 길을 찾는 것은 옆의 "카카오맵에서 보기" 링크가 맡는다.
 *
 * 지도를 그릴 수 없으면(키 없음·SDK 실패) 지도 칸을 숨기고 `fallback` 을 대신 그린다.
 * 지도 칸은 늘 DOM 에 두고 숨기기만 한다 — 비동기 로딩 도중 ref 가 사라지지 않게.
 */
function PlaceMap({ latitude, longitude, name, fallback = null, className = '' }) {
  const containerRef = useRef(null);
  // loading | ready | unavailable(키 없음) | error
  const [state, setState] = useState('loading');
  // 이름은 마커 제목에만 쓴다 — 선생님이 장소 이름을 한 글자 칠 때마다 지도를 다시 그리지 않게 의존성에서 뺀다.
  const nameRef = useRef(name);
  nameRef.current = name;

  useEffect(() => {
    if (!hasCoordinates({ latitude, longitude })) {
      setState('unavailable');
      return undefined;
    }

    let cancelled = false;
    setState('loading');

    (async () => {
      try {
        const key = await getKakaoMapKey();
        if (cancelled) return;
        if (!key) {
          setState('unavailable');
          return;
        }

        const maps = await loadKakaoMaps(key);
        const container = containerRef.current;
        if (cancelled || !container) return;

        // 주소를 바꿔 다시 그릴 때 이전 지도를 걷어 낸다
        container.replaceChildren();
        const center = new maps.LatLng(latitude, longitude);
        const map = new maps.Map(container, {
          center,
          level: 3,
          draggable: false,
          scrollwheel: false,
          disableDoubleClickZoom: true,
          keyboardShortcuts: false
        });
        new maps.Marker({ map, position: center, title: nameRef.current || undefined });
        setState('ready');
      } catch (error) {
        console.error('지도 표시 실패:', error);
        if (!cancelled) setState('error');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [latitude, longitude]);

  const failed = state === 'unavailable' || state === 'error';

  return (
    <>
      <div
        ref={containerRef}
        className={['ui-place-map', className].filter(Boolean).join(' ')}
        data-state={state}
        role="img"
        aria-label={name ? `${name} 위치 지도` : '위치 지도'}
        hidden={failed}
        data-testid="place-map"
      />
      {failed && fallback}
    </>
  );
}

export default PlaceMap;
