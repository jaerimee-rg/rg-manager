import React, { useEffect, useRef, useState } from 'react';
import { Button, Icon, Modal, Stack } from '../../components/ui';
import RetryImage from '../../components/album/RetryImage';
import {
  DEFAULT_CROP, MAX_COVER_ZOOM, coverImageUrl, cropStyle, panCrop, sameCrop, toCrop, zoomCrop
} from '../../utils/coverCrop';

const KEY_STEP_PX = 12;      // 화살표 한 번에 옮기는 거리(칸 위의 px)
const ZOOM_STEP = 0.1;       // +/− 한 번
const WHEEL_STEP = 0.0015;   // 휠 한 칸(deltaY ≈ 100) ≈ 0.15배

/**
 * 대표 사진의 보일 부분 고르기 — 대표 사진 칸의 "사진 목록에서 이렇게 보여요" 에서 사진을 누르면 열린다.
 * 사진 목록 카드 표지와 같은 모양(장수에 따라 놓는 모양이 다르다)을 크게 그리고, 고른 칸의 사진을 끌어 옮기고(마우스·손가락,
 * 화살표 키) 막대·휠·+/− 로 확대한다. 다른 칸은 흐리게 그대로 보여 준다 — 카드 전체가 어떻게 보일지 보면서 고르게.
 * [적용] 은 앨범 화면의 초안만 바꾼다 — 사진 목록에 반영되는 것은 [저장하기] 를 누를 때다.
 *
 * covers — 초안의 대표 사진들 [{ id, kind, driveFileId, thumbnailUrl, crop }] · index — 고를 칸
 * onApply(crop) — { x, y, zoom } · onClose()
 */
function CoverCropDialog({ covers = [], index = 0, onApply, onClose }) {
  const cover = covers[index];
  const [crop, setCrop] = useState(() => toCrop(cover?.crop));
  const slotRef = useRef(null);
  const dragRef = useRef(null);

  // 이 칸의 크기와 사진 원래 크기 — 끈 거리(px)를 위치(%)로 바꿀 때 쓴다
  const measure = () => {
    const slot = slotRef.current;
    const img = slot?.querySelector('img');
    if (!slot || !img?.naturalWidth) return null;
    const rect = slot.getBoundingClientRect();
    return { boxWidth: rect.width, boxHeight: rect.height, imageWidth: img.naturalWidth, imageHeight: img.naturalHeight };
  };
  const pan = (dx, dy, from = crop) => {
    const size = measure();
    if (size) setCrop(panCrop(from, { dx, dy, ...size }));
  };

  // 휠 확대는 페이지 스크롤을 막아야 해서 passive 가 아닌 리스너로 단다(React onWheel 은 막지 못한다)
  const latest = useRef(crop);
  latest.current = crop;
  useEffect(() => {
    const slot = slotRef.current;
    if (!slot) return undefined;
    const onWheel = (event) => {
      event.preventDefault();
      setCrop(zoomCrop(latest.current, latest.current.zoom - event.deltaY * WHEEL_STEP));
    };
    slot.addEventListener('wheel', onWheel, { passive: false });
    return () => slot.removeEventListener('wheel', onWheel);
  }, []);

  // 열리면 고를 칸에 포커스 — 키보드로 바로 옮길 수 있게
  useEffect(() => { slotRef.current?.focus(); }, []);

  if (!cover) return null;

  const onPointerDown = (event) => {
    if (event.button > 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    dragRef.current = { x: event.clientX, y: event.clientY, crop };
  };
  const onPointerMove = (event) => {
    const drag = dragRef.current;
    if (!drag) return;
    pan(event.clientX - drag.x, event.clientY - drag.y, drag.crop);
  };
  const endDrag = () => { dragRef.current = null; };

  const onKeyDown = (event) => {
    // 화살표는 사진을 그쪽으로 옮긴다(끌기와 같은 방향)
    const moves = { ArrowLeft: [-KEY_STEP_PX, 0], ArrowRight: [KEY_STEP_PX, 0], ArrowUp: [0, -KEY_STEP_PX], ArrowDown: [0, KEY_STEP_PX] };
    if (moves[event.key]) {
      event.preventDefault();
      pan(...moves[event.key]);
    } else if (event.key === '+' || event.key === '=') {
      event.preventDefault();
      setCrop(zoomCrop(crop, crop.zoom + ZOOM_STEP));
    } else if (event.key === '-') {
      event.preventDefault();
      setCrop(zoomCrop(crop, crop.zoom - ZOOM_STEP));
    }
  };

  const single = covers.length === 1;
  const changed = !sameCrop(crop, cover.crop);

  return (
    <Modal
      open
      onClose={onClose}
      title={`대표 사진 ${index + 1} — 보일 부분`}
      description="사진을 끌어서 옮기고, 아래 막대로 확대해요. 사진 목록 카드에서 이렇게 보여요."
      footer={(
        <>
          <Button block onClick={onClose}>취소</Button>
          <Button variant="primary" block disabled={!changed} onClick={() => onApply?.(crop)}>적용</Button>
        </>
      )}
    >
      <Stack gap={3}>
        <div className="ui-album-card__cover ui-cover-crop__stage" data-covers={covers.length} data-testid="cover-crop-stage">
          {covers.map((one, i) => (i === index ? (
            <div
              key={one.id}
              ref={slotRef}
              className="ui-album-card__cover-slot ui-cover-crop__active"
              tabIndex={0}
              role="group"
              aria-label="보일 부분 — 끌거나 화살표 키로 옮기고, +/− 로 확대해요"
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
              onKeyDown={onKeyDown}
            >
              {/* 확대해도 다시 받지 않게 가장 큰 크기로 한 번 받는다 */}
              <RetryImage
                src={coverImageUrl(one.driveFileId, { single: true, zoom: MAX_COVER_ZOOM }) || one.thumbnailUrl}
                draggable={false}
                style={cropStyle(crop)}
              />
            </div>
          ) : (
            <span key={one.id} className="ui-album-card__cover-slot ui-cover-crop__other" aria-hidden="true">
              <RetryImage
                src={coverImageUrl(one.driveFileId, { single, zoom: one.crop?.zoom }) || one.thumbnailUrl}
                draggable={false}
                style={cropStyle(one.crop)}
              />
            </span>
          )))}
        </div>

        <div className="ui-cover-crop__controls">
          <Icon name="image" size={14} />
          <input
            type="range"
            className="ui-cover-crop__zoom"
            min={1}
            max={MAX_COVER_ZOOM}
            step={0.05}
            value={crop.zoom}
            aria-label="확대"
            onChange={(event) => setCrop(zoomCrop(crop, Number(event.target.value)))}
          />
          <Icon name="image" size={20} />
          <span className="ui-cover-crop__zoom-value" aria-live="polite">{crop.zoom.toFixed(1)}배</span>
          <Button size="sm" variant="ghost" disabled={sameCrop(crop, DEFAULT_CROP)} onClick={() => setCrop(toCrop(DEFAULT_CROP))}>
            가운데로
          </Button>
        </div>
      </Stack>
    </Modal>
  );
}

export default CoverCropDialog;
