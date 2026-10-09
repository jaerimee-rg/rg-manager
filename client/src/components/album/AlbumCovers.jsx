import React from 'react';
import RetryImage from './RetryImage';
import { cropStyle } from '../../utils/coverCrop';

/**
 * 앨범 카드 표지에 선생님이 고른 대표 사진들(고른 순서, 최대 4장). 선생님 사진 목록과 학부모 사진 탭이 같이 쓴다.
 * 놓는 모양은 장수에 따라 CSS(.ui-album-card__cover[data-covers])가 정한다 —
 * 1장: 표지를 꽉 채운다 · 2장: 나란히 · 3장: 첫 장이 왼쪽에 크게, 나머지 둘이 오른쪽에 위아래로 · 4장: 2×2.
 *
 * crops  — 같은 순서로 대표 사진마다 보일 부분 { x, y, zoom } (없거나 null 이면 가운데). 사진은 칸마다 따로 잘린다
 *          (.ui-album-card__cover-slot) — 확대한 사진이 옆 칸을 덮지 않게.
 * onSelect(index) — 주면 칸마다 버튼이 된다(대표 사진 칸의 미리 보기: 눌러서 보일 부분 고르기). slotLabel(index) 이 그 이름.
 */
function AlbumCovers({ urls = [], crops = [], onSelect, slotLabel, ...rest }) {
  const shown = urls.slice(0, 4);
  return (
    <div className="ui-album-card__cover" data-covers={shown.length} {...rest}>
      {shown.map((url, index) => {
        const image = <RetryImage src={url} loading="lazy" style={cropStyle(crops[index])} />;
        return onSelect ? (
          <button
            key={url}
            type="button"
            className="ui-album-card__cover-slot"
            aria-label={slotLabel ? slotLabel(index) : `대표 사진 ${index + 1}`}
            onClick={() => onSelect(index)}
          >
            {image}
          </button>
        ) : (
          <span key={url} className="ui-album-card__cover-slot">{image}</span>
        );
      })}
    </div>
  );
}

export default AlbumCovers;
