import React, { useEffect, useRef, useState } from 'react';
import { Button, Callout, Icon, Modal, Spinner } from '../ui';
import { DEFAULT_MAP_CENTER, addressAt, getKakaoMapKey, hasCoordinates, loadKakaoMaps } from '../../utils/kakaoMap';

// 지도 가운데가 이만큼도 안 움직였으면 같은 자리다 (약 10cm) — 그 자리의 주소를 다시 묻지 않는다
const SAME_SPOT = 1e-6;
const sameSpot = (a, b) => Boolean(a && b)
  && Math.abs(a.latitude - b.latitude) < SAME_SPOT
  && Math.abs(a.longitude - b.longitude) < SAME_SPOT;

const SPOT_NOTES = {
  looking: '이 자리의 주소를 찾는 중…',
  not_found: '이 자리의 주소를 찾지 못했어요. 길이나 건물 위로 핀을 옮겨 주세요.',
  error: '주소를 찾지 못했어요. 지도를 조금 옮겨 다시 찾아 주세요.'
};

/**
 * 지도에서 장소 고르기 — 지도를 끌어 가운데 핀을 맞는 곳에 놓으면 그 자리의 주소로 바꾼다.
 *
 * 주소 검색으로 고른 건물의 핀이 실제 체육관·입구와 어긋날 때, 또는 주소 검색에 나오지 않는 곳(학교 체육관,
 * 공원 안)을 고를 때 쓴다. 핀은 지도 위에 고정하고 지도를 움직인다 — 휴대폰에서 작은 마커를 손가락으로
 * 집는 것보다 쉽다. 지도를 누르면 그곳이 가운데로 온다.
 *
 * 지도가 멈추면(idle) 가운데 좌표로 주소를 찾는다(coord2Address). 처음 열 때 이미 고른 주소가 있으면 그 주소를
 * 그대로 보여 준다 — 움직이지 않고 [이 위치로] 를 눌러도 고른 지번 주소가 도로명으로 바뀌지 않게.
 *
 * [이 위치로] 를 누르면 onSelect({ address, placeName, latitude, longitude }) — 닫는 것은 부모가 한다.
 */
function MapPickerDialog({ open, onClose, onSelect, latitude, longitude, address = '' }) {
  const containerRef = useRef(null);
  // loading | ready | unavailable(키 없음) | error
  const [state, setState] = useState('loading');
  // 핀 아래 자리: { status: looking|found|not_found|error, latitude, longitude, address?, placeName? }
  const [spot, setSpot] = useState(null);

  useEffect(() => {
    if (!open) return undefined;

    let cancelled = false;
    let detach = () => {};
    setState('loading');
    setSpot(null);

    const start = hasCoordinates({ latitude, longitude }) ? { latitude, longitude } : null;

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

        container.replaceChildren();
        const center = start || DEFAULT_MAP_CENTER;
        const map = new maps.Map(container, {
          center: new maps.LatLng(center.latitude, center.longitude),
          // 고른 곳이 있으면 건물이 보이게, 없으면 동네가 보이게
          level: start ? 3 : 7
        });
        if (maps.ZoomControl) map.addControl(new maps.ZoomControl(), maps.ControlPosition.RIGHT);

        // 지도를 연달아 옮기면 늦게 온 주소가 새 자리를 덮지 않도록 요청마다 번호를 붙인다
        let seq = 0;
        let last = null;
        const lookUp = async () => {
          const c = map.getCenter();
          const point = { latitude: c.getLat(), longitude: c.getLng() };
          if (sameSpot(point, last)) return;
          last = point;

          const mine = ++seq;
          setSpot({ status: 'looking', ...point });
          const found = await addressAt(maps, point);
          if (cancelled || mine !== seq) return;
          setSpot(found.ok
            ? { status: 'found', ...point, address: found.address, placeName: found.placeName }
            : { status: found.reason, ...point });
        };
        const onClick = (mouseEvent) => map.panTo(mouseEvent.latLng);
        // 휴대폰을 돌리는 등 칸 크기가 바뀌면 지도를 다시 맞추되 가운데는 그대로 둔다
        const onResize = () => {
          const c = map.getCenter();
          map.relayout();
          map.setCenter(c);
        };

        maps.event.addListener(map, 'idle', lookUp);
        maps.event.addListener(map, 'click', onClick);
        window.addEventListener('resize', onResize);
        detach = () => {
          maps.event.removeListener(map, 'idle', lookUp);
          maps.event.removeListener(map, 'click', onClick);
          window.removeEventListener('resize', onResize);
        };

        setState('ready');
        if (start && address) {
          last = start;
          setSpot({ status: 'found', ...start, address, placeName: '' });
        } else {
          lookUp();
        }
      } catch (error) {
        console.error('지도에서 고르기 불러오기 실패:', error);
        if (!cancelled) setState('error');
      }
    })();

    return () => {
      cancelled = true;
      detach();
    };
    // 좌표·주소는 열 때의 값만 쓴다 — 여는 동안에는 이 창이 고른다.
  }, [open]);

  const failed = state === 'unavailable' || state === 'error';
  const canPick = state === 'ready' && spot?.status === 'found';

  const confirm = () => {
    if (!canPick) return;
    onSelect?.({
      address: spot.address,
      placeName: spot.placeName,
      latitude: spot.latitude,
      longitude: spot.longitude
    });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="지도에서 고르기"
      description="지도를 움직여 가운데 핀을 장소에 맞춰 주세요. 지도를 누르면 그곳으로 옮겨져요."
      size="lg"
      footer={(
        <>
          <Button variant="outline" onClick={onClose}>취소</Button>
          <Button variant="primary" icon="check" onClick={confirm} disabled={!canPick}>이 위치로</Button>
        </>
      )}
    >
      {state === 'loading' && <Spinner inline label="지도를 여는 중" />}
      {state === 'unavailable' && (
        <Callout tone="neutral">
          지도 키가 아직 설정되지 않아 지도에서 고를 수 없어요. [주소 검색] 으로 골라 주세요.
        </Callout>
      )}
      {state === 'error' && (
        <Callout tone="danger">
          지도를 불러오지 못했어요. 인터넷 연결을 확인하고 다시 열어 주세요.
        </Callout>
      )}

      {/* 지도 칸은 늘 DOM 에 둔다 — 비동기 로딩 도중 ref 가 사라지지 않게(PlaceMap 과 같다). */}
      <div className="ui-map-picker" hidden={failed}>
        <div ref={containerRef} className="ui-map-picker__map" data-state={state} data-testid="map-picker" />
        {state === 'ready' && (
          <span className="ui-map-picker__pin" aria-hidden="true">
            <Icon name="mapPin" size={40} strokeWidth={2} />
          </span>
        )}
      </div>

      {state === 'ready' && spot && (
        <p className="ui-map-picker__spot" role="status" data-status={spot.status}>
          <Icon name="mapPin" size={18} />
          <span data-testid="map-picker-address">
            {spot.status === 'found' ? spot.address : SPOT_NOTES[spot.status]}
            {spot.status === 'found' && spot.placeName && (
              <span className="ui-map-picker__place"> · {spot.placeName}</span>
            )}
          </span>
        </p>
      )}
    </Modal>
  );
}

export default MapPickerDialog;
