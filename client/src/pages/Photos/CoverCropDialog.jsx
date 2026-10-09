import React, { useEffect, useRef, useState } from 'react';
import { Button, Icon, Modal, Stack } from '../../components/ui';
import RetryImage from '../../components/album/RetryImage';
import {
  DEFAULT_CROP, MAX_COVER_ZOOM, coverImageUrl, cropStyle, panCrop, pinchCrop, sameCrop, toCrop, zoomCrop
} from '../../utils/coverCrop';

const KEY_STEP_PX = 12;      // 화살표 한 번에 옮기는 거리(칸 위의 px)
const ZOOM_STEP = 0.1;       // +/− 한 번
const WHEEL_STEP = 0.0015;   // 휠 한 칸(deltaY ≈ 100) ≈ 0.15배

/** 손가락(포인터)들의 가운데와 두 손가락 사이 거리 — 칸 왼쪽 위 기준 px. 한 손가락이면 거리는 1(확대 없이 옮기기만) */
const centerOf = (points, rect) => {
  const [a, b] = points;
  if (!b) return { x: a.x - rect.left, y: a.y - rect.top, distance: 1 };
  return {
    x: (a.x + b.x) / 2 - rect.left,
    y: (a.y + b.y) / 2 - rect.top,
    distance: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y))
  };
};

/**
 * 대표 사진의 보일 부분 고르기 — 대표 사진 칸의 "사진 목록에서 이렇게 보여요" 에서 사진을 누르면 열린다.
 * 사진 목록 카드 표지와 같은 모양(장수에 따라 놓는 모양이 다르다)을 크게 그리고, **모든 대표 사진을 한 번에** 고친다 — 칸을 누르면
 * 그 사진을 고르는 중이 되고(노란 테두리), 끌어서 옮기고, 두 손가락으로 벌려 확대·옮기고(휴대폰의 사진 보기처럼), 막대·휠·+/− 로
 * 확대한다. [적용] 은 고친 사진 모두를 앨범 화면의 초안에 넣는다 — 사진 목록에 반영되는 것은 [저장하기] 를 누를 때다.
 *
 * 손가락은 칸이 아니라 표지 전체(stage)가 받는다 — 두 손가락이 옆 칸에 걸쳐도 처음 누른 칸의 사진을 키운다. 손가락 수가 바뀌면
 * (두 번째 손가락이 닿거나 하나를 뗀다) 그때의 보일 부분에서 새로 시작해 사진이 튀지 않는다.
 *
 * covers — 초안의 대표 사진들 [{ id, kind, driveFileId, thumbnailUrl, crop }] · index — 처음 고를 칸
 * onApply(crops) — covers 와 같은 순서의 보일 부분 [{ x, y, zoom }] · onClose()
 */
function CoverCropDialog({ covers = [], index = 0, onApply, onClose }) {
  const [crops, setCrops] = useState(() => covers.map((cover) => toCrop(cover.crop)));
  const [active, setActive] = useState(Math.min(Math.max(0, index), Math.max(0, covers.length - 1)));
  const stageRef = useRef(null);
  const pointers = useRef(new Map());   // pointerId → { x, y } (화면 기준)
  const gesture = useRef(null);         // { index, crop, start, rect, size }
  const latest = useRef(crops);
  latest.current = crops;

  const setCropAt = (i, next) => setCrops((prev) => prev.map((one, j) => (j === i ? next : one)));
  const slotOf = (i) => stageRef.current?.querySelector(`[data-slot-index="${i}"]`);
  // 그 칸의 크기·자리와 사진 원래 크기 — 손가락 움직임(px)을 위치(%)·확대로 바꿀 때 쓴다
  const measure = (i) => {
    const slot = slotOf(i);
    const img = slot?.querySelector('img');
    if (!slot || !img?.naturalWidth) return null;
    const rect = slot.getBoundingClientRect();
    return { rect, size: { boxWidth: rect.width, boxHeight: rect.height, imageWidth: img.naturalWidth, imageHeight: img.naturalHeight } };
  };

  // 지금 닿아 있는 손가락들로 몸짓을 (다시) 시작한다 — 그때의 보일 부분에서. 사진이 아직 안 떴으면(크기를 모른다) 그 칸만 기억해 두고
  // 다음 움직임에서 다시 시작한다 — 느린 휴대폰에서 사진이 뜨기 전에 손가락을 댔다고 몸짓이 사라지지 않게
  const begin = (i) => {
    const measured = measure(i);
    const points = [...pointers.current.values()];
    if (!points.length) { gesture.current = null; return; }
    gesture.current = measured
      ? { index: i, crop: latest.current[i], start: centerOf(points, measured.rect), ...measured }
      : { index: i, pending: true };
  };

  // 휠 확대는 페이지 스크롤을 막아야 해서 passive 가 아닌 리스너로 단다(React onWheel 은 막지 못한다). 마우스 자리를 중심으로 키운다
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return undefined;
    const onWheel = (event) => {
      const slot = event.target.closest?.('[data-slot-index]');
      if (!slot) return;
      event.preventDefault();
      const i = Number(slot.dataset.slotIndex);
      setActive(i);
      const measured = measure(i);
      const current = latest.current[i];
      const factor = Math.max(0.1, 1 - event.deltaY * WHEEL_STEP);
      if (!measured) {
        setCropAt(i, zoomCrop(current, current.zoom * factor));
        return;
      }
      const at = { x: event.clientX - measured.rect.left, y: event.clientY - measured.rect.top };
      setCropAt(i, pinchCrop(current, { start: { ...at, distance: 1 }, now: { ...at, distance: factor }, ...measured.size }));
    };
    stage.addEventListener('wheel', onWheel, { passive: false });
    return () => stage.removeEventListener('wheel', onWheel);
  }, []);

  // 열리면 처음 고를 칸에 포커스 — 키보드로 바로 옮길 수 있게
  useEffect(() => { slotOf(active)?.focus(); }, []);   // eslint-disable-line react-hooks/exhaustive-deps

  if (!covers.length) return null;

  const onPointerDown = (event) => {
    if (event.button > 0) return;
    const slot = event.target.closest?.('[data-slot-index]');
    if (!pointers.current.size && !slot) return;
    event.preventDefault();
    stageRef.current?.setPointerCapture?.(event.pointerId);
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    // 첫 손가락이 누른 칸을 고른다. 두 번째 손가락은 어디에 닿든 그 칸을 키운다
    const i = pointers.current.size === 1 ? Number(slot.dataset.slotIndex) : gesture.current?.index;
    if (i === undefined || Number.isNaN(i)) return;
    if (pointers.current.size === 1) {
      setActive(i);
      slot.focus({ preventScroll: true });
    }
    begin(i);
  };
  const onPointerMove = (event) => {
    if (!pointers.current.has(event.pointerId)) return;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const g = gesture.current;
    if (!g) return;
    if (g.pending) { begin(g.index); return; }
    const now = centerOf([...pointers.current.values()], g.rect);
    setCropAt(g.index, pinchCrop(g.crop, { start: g.start, now, ...g.size }));
  };
  const onPointerEnd = (event) => {
    if (!pointers.current.delete(event.pointerId)) return;
    const g = gesture.current;
    if (g && pointers.current.size) begin(g.index);
    else gesture.current = null;
  };

  const onKeyDown = (i) => (event) => {
    const current = crops[i];
    // 화살표는 사진을 그쪽으로 옮긴다(끌기와 같은 방향)
    const moves = { ArrowLeft: [-KEY_STEP_PX, 0], ArrowRight: [KEY_STEP_PX, 0], ArrowUp: [0, -KEY_STEP_PX], ArrowDown: [0, KEY_STEP_PX] };
    if (moves[event.key]) {
      event.preventDefault();
      const measured = measure(i);
      if (measured) setCropAt(i, panCrop(current, { dx: moves[event.key][0], dy: moves[event.key][1], ...measured.size }));
    } else if (event.key === '+' || event.key === '=') {
      event.preventDefault();
      setCropAt(i, zoomCrop(current, current.zoom + ZOOM_STEP));
    } else if (event.key === '-') {
      event.preventDefault();
      setCropAt(i, zoomCrop(current, current.zoom - ZOOM_STEP));
    }
  };

  const crop = crops[active];
  const changed = crops.some((one, i) => !sameCrop(one, covers[i]?.crop));
  const several = covers.length > 1;

  return (
    <Modal
      open
      onClose={onClose}
      title="대표 사진 — 보일 부분"
      description={several
        ? '칸을 눌러 사진을 바꿔 가며 한 번에 고쳐요. 끌어서 옮기고, 두 손가락으로 벌리거나 아래 막대로 확대해요.'
        : '사진을 끌어서 옮기고, 두 손가락으로 벌리거나 아래 막대로 확대해요.'}
      footer={(
        <>
          <Button block onClick={onClose}>취소</Button>
          <Button variant="primary" block disabled={!changed} onClick={() => onApply?.(crops)}>적용</Button>
        </>
      )}
    >
      <Stack gap={3}>
        <div
          ref={stageRef}
          className="ui-album-card__cover ui-cover-crop__stage"
          data-covers={covers.length}
          data-testid="cover-crop-stage"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerEnd}
          onPointerCancel={onPointerEnd}
        >
          {covers.map((one, i) => (
            <div
              key={one.id}
              data-slot-index={i}
              data-active={i === active || undefined}
              className="ui-album-card__cover-slot ui-cover-crop__slot"
              tabIndex={0}
              role="group"
              aria-label={`${i + 1}번 사진 보일 부분 — 끌거나 화살표 키로 옮기고, 두 손가락이나 +/− 로 확대해요`}
              aria-current={i === active || undefined}
              onFocus={() => setActive(i)}
              onKeyDown={onKeyDown(i)}
            >
              {/* 확대해도 다시 받지 않게 가장 큰 크기로 한 번 받는다 */}
              <RetryImage
                src={coverImageUrl(one.driveFileId, { single: true, zoom: MAX_COVER_ZOOM }) || one.thumbnailUrl}
                draggable={false}
                style={cropStyle(crops[i])}
              />
              {several && <span className="ui-cover-crop__num" aria-hidden="true">{i + 1}</span>}
            </div>
          ))}
        </div>

        <div className="ui-cover-crop__controls">
          {several && <span className="ui-cover-crop__which">{active + 1}번 사진</span>}
          <Icon name="image" size={14} />
          <input
            type="range"
            className="ui-cover-crop__zoom"
            min={1}
            max={MAX_COVER_ZOOM}
            step={0.05}
            value={crop.zoom}
            aria-label={several ? `${active + 1}번 사진 확대` : '확대'}
            onChange={(event) => setCropAt(active, zoomCrop(crop, Number(event.target.value)))}
          />
          <Icon name="image" size={20} />
          <span className="ui-cover-crop__zoom-value" aria-live="polite">{crop.zoom.toFixed(1)}배</span>
          <Button
            size="sm"
            variant="ghost"
            disabled={sameCrop(crop, DEFAULT_CROP)}
            onClick={() => setCropAt(active, toCrop(DEFAULT_CROP))}
          >
            가운데로
          </Button>
        </div>
      </Stack>
    </Modal>
  );
}

export default CoverCropDialog;
