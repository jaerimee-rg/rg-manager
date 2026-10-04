import React, { useRef, useState } from 'react';
import { ACCEPT } from '../../utils/imageResize';
import { cropStyle } from '../../utils/imageCrop';
import { MAX_PRODUCT_IMAGES, moveImage } from '../../utils/productImages';
import { Badge, Button, Icon, IconButton, Progress } from '../../components/ui';

const STATUS_TEXT = { waiting: '기다리는 중', uploading: '올리는 중', error: '올리지 못함' };

const hasFiles = (event) => Array.from(event.dataTransfer?.types || []).includes('Files');

/**
 * 상품 사진 칸 — 여러 장, 첫 장이 대표. 순서는 ‹ › 또는 끌어다 놓기(데스크톱).
 * 새로 넣은 사진은 [자르기]로 보일 부분을 고른다(정사각형으로 잘려 올라간다).
 * 파일을 끌어다 놓아도 들어간다.
 *
 * items 는 productImages.js 의 칸 목록, statuses 는 저장 중 칸별 상태(key → waiting|uploading|done|error).
 */
function ProductImagesField({ items, onChange, onAddFiles, onRemove, onCrop, statuses = {}, busy = false }) {
  const fileInput = useRef(null);
  const [drag, setDrag] = useState(null); // { from, over } — 사진 칸을 옮기는 중

  const pick = () => fileInput.current?.click();
  const full = items.length >= MAX_PRODUCT_IMAGES;

  const onFileChange = (event) => {
    const files = Array.from(event.target.files || []);
    event.target.value = '';
    if (files.length) onAddFiles(files);
  };

  // 바깥에서 파일을 끌어다 놓으면 추가, 안에서 사진 칸을 끌면 순서 바꾸기
  const onFieldDragOver = (event) => {
    if (busy) return;
    if (drag || hasFiles(event)) event.preventDefault();
  };
  const onFieldDrop = (event) => {
    if (busy || drag || !hasFiles(event)) return;
    event.preventDefault();
    onAddFiles(Array.from(event.dataTransfer.files || []));
  };

  const dropAt = (over) => {
    if (!drag) return;
    const to = over > drag.from ? over - 1 : over;
    onChange(moveImage(items, drag.from, Math.min(to, items.length - 1)));
    setDrag(null);
  };

  const input = (
    <input ref={fileInput} type="file" accept={ACCEPT} multiple hidden aria-label="상품 사진 파일" onChange={onFileChange} />
  );

  if (!items.length) {
    return (
      <div className="ui-dropzone" onDragOver={onFieldDragOver} onDrop={onFieldDrop}>
        <Icon name="image" size={24} />
        <div className="ui-dropzone__title">상품 사진을 골라 주세요</div>
        <p className="ui-dropzone__hint">
          여러 장을 한 번에 골라도 돼요 · jpg · png · webp · gif, 한 장에 4MB 이하 — 정사각형으로 잘라 줄여서 올려요
        </p>
        <p className="ui-dropzone__hint shop-paste-hint">복사한 사진은 붙여 넣어도 돼요 (⌘V · Ctrl+V)</p>
        <Button size="sm" icon="upload" onClick={pick} disabled={busy}>사진 선택</Button>
        {input}
      </div>
    );
  }

  return (
    <div className="shop-images" onDragOver={onFieldDragOver} onDrop={onFieldDrop}>
      {items.map((item, index) => {
        const status = statuses[item.key];
        const label = `사진 ${index + 1}`;
        return (
          <div
            key={item.key}
            className="shop-images__tile"
            data-main={index === 0 || undefined}
            data-dragging={drag?.from === index || undefined}
            data-drop={drag && drag.over === index && drag.from !== index ? 'before' : undefined}
            draggable={!busy}
            onDragStart={(event) => {
              event.dataTransfer.effectAllowed = 'move';
              event.dataTransfer.setData('text/plain', String(index));
              setDrag({ from: index, over: null });
            }}
            onDragOver={(event) => {
              if (!drag) return;
              event.preventDefault();
              if (drag.over !== index) setDrag({ ...drag, over: index });
            }}
            onDrop={(event) => {
              if (!drag) return;
              event.preventDefault();
              dropAt(index);
            }}
            onDragEnd={() => setDrag(null)}
            data-testid="shop-image-tile"
          >
            <div className="shop-images__frame" data-state={status}>
              <img
                src={item.url}
                alt={index === 0 ? `${label} (대표)` : label}
                style={item.file ? cropStyle(item.crop) : undefined}
                draggable={false}
              />
              {index === 0 && <Badge tone="solid" className="shop-images__badge">대표</Badge>}
              {!busy && (
                <button type="button" className="shop-images__remove" aria-label={`${label} 빼기`} onClick={() => onRemove(item.key)}>
                  <Icon name="x" size={14} />
                </button>
              )}
              {!busy && item.file && (
                <button
                  type="button"
                  className="shop-images__crop"
                  aria-label={`${label} 자르기`}
                  data-crop-key={item.key}
                  onClick={() => onCrop(item.key)}
                >
                  <Icon name="crop" size={14} />
                  자르기
                </button>
              )}
              {STATUS_TEXT[status] && (
                <span className="shop-images__status">
                  {status === 'uploading' && <Progress value={60} label="올리는 중" />}
                  {STATUS_TEXT[status]}
                </span>
              )}
            </div>
            <div className="shop-images__moves">
              <IconButton
                icon="chevronLeft"
                label={`${label} 앞으로`}
                size="sm"
                variant="plain"
                disabled={busy || index === 0}
                onClick={() => onChange(moveImage(items, index, index - 1))}
              />
              <IconButton
                icon="chevronRight"
                label={`${label} 뒤로`}
                size="sm"
                variant="plain"
                disabled={busy || index === items.length - 1}
                onClick={() => onChange(moveImage(items, index, index + 1))}
              />
            </div>
          </div>
        );
      })}

      {!full && !busy && (
        <button
          type="button"
          className="shop-images__add"
          onClick={pick}
          onDragOver={(event) => {
            if (!drag) return;
            event.preventDefault();
            if (drag.over !== items.length) setDrag({ ...drag, over: items.length });
          }}
          onDrop={(event) => {
            if (!drag) return;
            event.preventDefault();
            dropAt(items.length);
          }}
        >
          <Icon name="plus" size={20} />
          <b>사진 추가</b>
          <span>여러 장 가능</span>
        </button>
      )}
      {input}
    </div>
  );
}

export default ProductImagesField;
