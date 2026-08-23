import React from 'react';
import { formatDuration } from '../../utils/mediaUrls';
import { groupByDay } from '../../utils/albumFilter';

/**
 * 썸네일 그리드. 선생님·학부모가 같이 쓴다.
 *
 * - 날짜별로 묶어 최신이 위로 온다
 * - 썸네일은 Drive 주소를 그대로 쓴다 (앨범 폴더가 링크 공유되어 있어야 보인다)
 * - 선택 모드(selectable)에서는 눌러도 열리지 않고 선택만 된다 (선생님 일괄 작업)
 */
function MediaGrid({
  items = [],
  columns = 3,
  onOpen,
  selectable = false,
  selectedIds = [],
  onToggleSelect,
  renderBadge
}) {
  if (!items.length) return null;

  const selected = new Set(selectedIds);
  const groups = groupByDay(items);

  return (
    <div>
      {groups.map((group) => (
        <div key={group.dayKey}>
          <div style={{
            fontSize: '0.8125rem', fontWeight: 800, color: 'var(--color-gray-700)',
            margin: '14px 2px 8px', display: 'flex', alignItems: 'baseline', gap: '6px'
          }}>
            {group.label}
            <small style={{ fontSize: '0.6875rem', color: 'var(--color-gray-400)', fontWeight: 600 }}>
              {group.items.length}개
            </small>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${columns}, 1fr)`, gap: '4px' }}>
            {group.items.map((item) => (
              <Tile
                key={item.id}
                item={item}
                selectable={selectable}
                isSelected={selected.has(item.id)}
                onOpen={onOpen}
                onToggleSelect={onToggleSelect}
                renderBadge={renderBadge}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function Tile({ item, selectable, isSelected, onOpen, onToggleSelect, renderBadge }) {
  const duration = formatDuration(item.durationMs);
  const isVideo = item.kind === 'video';

  const handleClick = () => {
    if (selectable) onToggleSelect?.(item.id);
    else onOpen?.(item);
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label={`${isVideo ? '영상' : '사진'} 열기`}
      aria-pressed={selectable ? isSelected : undefined}
      style={{
        position: 'relative', aspectRatio: '1 / 1', borderRadius: '6px', overflow: 'hidden',
        background: 'var(--color-gray-200)', cursor: 'pointer', padding: 0,
        border: 'none', fontFamily: 'inherit',
        outline: isSelected ? '3px solid var(--color-primary)' : 'none', outlineOffset: '-3px'
      }}
    >
      {item.thumbnailUrl ? (
        <img
          src={item.thumbnailUrl}
          alt=""
          loading="lazy"
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          onError={(event) => { event.currentTarget.style.visibility = 'hidden'; }}
        />
      ) : null}

      {isVideo && (
        <>
          <span style={{
            position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff', fontSize: '1.4rem', textShadow: '0 1px 6px rgba(0,0,0,.6)'
          }}>▶</span>
          {duration && (
            <span style={{
              position: 'absolute', left: '5px', bottom: '5px', background: 'rgba(0,0,0,.6)', color: '#fff',
              fontSize: '0.625rem', fontWeight: 700, padding: '2px 6px', borderRadius: 'var(--radius-full)'
            }}>{duration}</span>
          )}
        </>
      )}

      {selectable && (
        <span style={{
          position: 'absolute', left: '6px', top: '6px', width: '22px', height: '22px', borderRadius: '50%',
          border: '2px solid rgba(255,255,255,.9)',
          background: isSelected ? 'var(--color-primary)' : 'rgba(0,0,0,.25)',
          color: '#fff', fontSize: '0.7rem', fontWeight: 900,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center'
        }}>{isSelected ? '✓' : ''}</span>
      )}

      {renderBadge ? renderBadge(item) : (
        item.myTags?.length ? (
          <span style={{
            position: 'absolute', right: '4px', top: '4px', background: 'rgba(49,130,246,.95)', color: '#fff',
            fontSize: '0.625rem', fontWeight: 800, padding: '2px 6px', borderRadius: 'var(--radius-full)'
          }}>{item.myTags.map((tag) => tag.name).filter(Boolean).join('·') || '우리 아이'}</span>
        ) : null
      )}

      {item.uploader === 'me' && (
        <span style={{
          position: 'absolute', right: '4px', bottom: '4px', background: 'rgba(255,255,255,.9)',
          color: 'var(--color-gray-700)', fontSize: '0.625rem', fontWeight: 700,
          padding: '1px 5px', borderRadius: 'var(--radius-full)'
        }}>내 사진</span>
      )}
    </button>
  );
}

export default MediaGrid;
