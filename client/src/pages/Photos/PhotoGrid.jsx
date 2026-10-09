import React from 'react';
import { Icon } from '../../components/ui';
import { formatDuration } from '../../utils/mediaUrls';
import RetryImage from '../../components/album/RetryImage';

/**
 * 정사각형 사진 칸 (docs/photo-menu FR-524~525). 칸 수는 CSS(.ui-media-grid)가 정한다 — 휴대폰 3 · 태블릿 4 · 데스크탑 6.
 *
 * showUploader — 학부모가 올린 사진에 올린 사람 이름을 붙인다(선생님 화면에서만)
 * selectable   — 고르기 모드. 누르면 onToggle, 아니면 onOpen
 */
function PhotoGrid({ items = [], showUploader = false, selectable = false, selected = [], onOpen, onToggle }) {
  return (
    <div className="ui-media-grid">
      {items.map((item) => {
        const isSelected = selected.includes(item.id);
        const label = `${item.kind === 'video' ? '영상' : '사진'}${item.isHidden ? ' (숨김)' : ''}${isSelected ? ' · 고름' : ''}`;
        return (
          <button
            key={item.id}
            type="button"
            className="ui-media-tile"
            data-hidden={item.isHidden || undefined}
            data-selected={isSelected || undefined}
            aria-label={label}
            aria-pressed={selectable ? isSelected : undefined}
            onClick={() => (selectable ? onToggle?.(item) : onOpen?.(item))}
          >
            <RetryImage src={item.thumbnailUrl} loading="lazy" />
            {showUploader && item.uploaderRole === 'parent' && (
              <span className="ui-media-tile__who">{item.uploaderName || '학부모'}</span>
            )}
            {item.kind === 'video' && (
              <span className="ui-media-tile__video">
                <Icon name="play" size={10} />{item.durationMs ? formatDuration(item.durationMs) : '영상'}
              </span>
            )}
            {item.isHidden && (
              <span className="ui-media-tile__hidden"><Icon name="eyeOff" size={22} />숨김</span>
            )}
            {selectable && (
              <span className="ui-media-tile__check" aria-hidden="true"><Icon name="check" size={14} /></span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export default PhotoGrid;
