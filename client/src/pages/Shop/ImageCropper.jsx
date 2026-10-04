import React, { useEffect, useRef, useState } from 'react';
import { DEFAULT_CROP, MAX_ZOOM, MIN_ZOOM, clampCrop, cropStyle, isDefaultCrop, panCrop } from '../../utils/imageCrop';
import { Button, Icon } from '../../components/ui';

const KEY_STEP = 0.05;
const WHEEL_STEP = 0.0015;

/**
 * 사진 자르기 — 정사각형 칸 안에서 사진을 끌어 보이는 부분을 고르고, 막대로 확대한다.
 * 칸에 보이는 그대로 잘려 올라간다(상점 카드·상세의 정사각형과 같다).
 * 마우스·손가락은 끌기, 키보드는 화살표(옮기기)·+/−(확대).
 */
function ImageCropper({ src, crop, onChange }) {
  const frameRef = useRef(null);
  const dragRef = useRef(null);
  const [size, setSize] = useState(null);
  const current = clampCrop(crop);

  // 확대 휠은 페이지 스크롤을 막아야 해서 passive 가 아닌 리스너로 단다(React onWheel 은 막지 못한다)
  const latest = useRef({ crop: current, onChange });
  latest.current = { crop: current, onChange };
  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return undefined;
    const onWheel = (event) => {
      event.preventDefault();
      const { crop: now, onChange: change } = latest.current;
      change(clampCrop({ ...now, zoom: now.zoom - event.deltaY * WHEEL_STEP }));
    };
    frame.addEventListener('wheel', onWheel, { passive: false });
    return () => frame.removeEventListener('wheel', onWheel);
  }, []);

  // 열리면 자를 칸에 포커스 — 키보드로 바로 옮길 수 있게
  useEffect(() => {
    frameRef.current?.focus();
  }, []);

  const pan = (dx, dy, from = current) => {
    if (size) onChange(panCrop(from, size, dx, dy));
  };

  const onPointerDown = (event) => {
    if (!size) return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    dragRef.current = { x: event.clientX, y: event.clientY, crop: current };
  };
  const onPointerMove = (event) => {
    const drag = dragRef.current;
    if (!drag) return;
    const side = frameRef.current?.clientWidth || 1;
    pan((event.clientX - drag.x) / side, (event.clientY - drag.y) / side, drag.crop);
  };
  const endDrag = () => {
    dragRef.current = null;
  };

  const onKeyDown = (event) => {
    const moves = { ArrowLeft: [KEY_STEP, 0], ArrowRight: [-KEY_STEP, 0], ArrowUp: [0, KEY_STEP], ArrowDown: [0, -KEY_STEP] };
    if (moves[event.key]) {
      event.preventDefault();
      pan(...moves[event.key]);
    } else if (event.key === '+' || event.key === '=') {
      event.preventDefault();
      onChange(clampCrop({ ...current, zoom: current.zoom + 0.1 }));
    } else if (event.key === '-') {
      event.preventDefault();
      onChange(clampCrop({ ...current, zoom: current.zoom - 0.1 }));
    }
  };

  return (
    <div className="shop-crop">
      <div
        ref={frameRef}
        className="shop-crop__frame"
        tabIndex={0}
        role="group"
        aria-label="자를 부분 — 끌거나 화살표 키로 옮기고, +/− 로 확대해요"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onKeyDown={onKeyDown}
      >
        <img
          src={src}
          alt="자를 사진"
          draggable={false}
          onLoad={(event) => setSize({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })}
          style={cropStyle(current)}
        />
        <span className="shop-crop__grid" aria-hidden="true" />
      </div>

      <div className="shop-crop__controls">
        <Icon name="image" size={14} />
        <input
          type="range"
          className="shop-crop__zoom"
          min={MIN_ZOOM}
          max={MAX_ZOOM}
          step={0.01}
          value={current.zoom}
          aria-label="확대"
          onChange={(event) => onChange(clampCrop({ ...current, zoom: Number(event.target.value) }))}
        />
        <Icon name="image" size={20} />
        <Button size="sm" variant="ghost" disabled={isDefaultCrop(current)} onClick={() => onChange(DEFAULT_CROP)}>
          처음대로
        </Button>
      </div>
    </div>
  );
}

export default ImageCropper;
