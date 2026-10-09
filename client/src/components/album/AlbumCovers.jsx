import React from 'react';
import RetryImage from './RetryImage';

/**
 * 앨범 카드 표지에 선생님이 고른 대표 사진들(고른 순서, 최대 4장). 선생님 사진 목록과 학부모 사진 탭이 같이 쓴다.
 * 놓는 모양은 장수에 따라 CSS(.ui-album-card__cover[data-covers])가 정한다 —
 * 1장: 표지를 꽉 채운다 · 2장: 나란히 · 3장: 첫 장이 왼쪽에 크게, 나머지 둘이 오른쪽에 위아래로 · 4장: 2×2.
 */
function AlbumCovers({ urls = [], ...rest }) {
  const shown = urls.slice(0, 4);
  return (
    <div className="ui-album-card__cover" data-covers={shown.length} {...rest}>
      {shown.map((url) => <RetryImage key={url} src={url} loading="lazy" />)}
    </div>
  );
}

export default AlbumCovers;
