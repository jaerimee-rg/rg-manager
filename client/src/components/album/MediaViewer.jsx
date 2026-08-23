import React, { useEffect, useState } from 'react';
import { formatDuration } from '../../utils/mediaUrls';
import { formatTime, formatDayLabel, dayKeyOf, uploaderLabel } from '../../utils/albumFilter';

/**
 * 전체 화면 사진·영상 뷰어.
 *
 * 저장 버튼은 Drive 의 다운로드 주소를 새 창으로 연다 — 앱이 파일을 거치지 않고
 * 원본 화질 그대로 내려받는다. 영상은 Drive 플레이어(iframe)로 재생한다.
 */
function MediaViewer({ items = [], startId, onClose, onDelete }) {
  const [index, setIndex] = useState(() => {
    const found = items.findIndex((item) => item.id === startId);
    return found >= 0 ? found : 0;
  });

  const item = items[index];

  useEffect(() => {
    const onKey = (event) => {
      if (event.key === 'Escape') onClose?.();
      if (event.key === 'ArrowLeft') setIndex((i) => (i - 1 + items.length) % items.length);
      if (event.key === 'ArrowRight') setIndex((i) => (i + 1) % items.length);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [items.length, onClose]);

  // 목록이 바뀌어(삭제 등) 인덱스가 넘치면 되돌린다.
  useEffect(() => {
    if (index >= items.length) setIndex(Math.max(0, items.length - 1));
  }, [items.length, index]);

  if (!item) return null;

  const move = (step) => setIndex((i) => (i + step + items.length) % items.length);
  const isVideo = item.kind === 'video';

  return (
    <div
      role="dialog"
      aria-label="사진 보기"
      style={{
        position: 'fixed', inset: 0, zIndex: 240, background: '#000',
        display: 'flex', flexDirection: 'column'
      }}
    >
      <div style={{ padding: '12px 14px', display: 'flex', alignItems: 'center', gap: '8px', color: '#fff' }}>
        <button
          type="button"
          onClick={onClose}
          aria-label="닫기"
          style={{
            background: 'rgba(255,255,255,.16)', border: 'none', color: '#fff', width: '36px', height: '36px',
            borderRadius: '50%', fontSize: '1rem', cursor: 'pointer', fontFamily: 'inherit'
          }}
        >✕</button>
        <div style={{ flex: 1, textAlign: 'center', fontSize: '0.8125rem', fontWeight: 600, opacity: 0.85 }}>
          {index + 1} / {items.length}
        </div>
        <span style={{ width: '36px' }} />
      </div>

      <div style={{ flex: 1, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
        {isVideo ? (
          <div style={{ width: '100%', maxWidth: '900px', padding: '0 12px' }}>
            <div style={{ position: 'relative', width: '100%', aspectRatio: '16 / 9', background: '#111', borderRadius: '10px', overflow: 'hidden' }}>
              {item.previewUrl ? (
                <iframe
                  title={item.fileName || '영상'}
                  src={item.previewUrl}
                  allow="autoplay"
                  style={{ width: '100%', height: '100%', border: 'none' }}
                />
              ) : null}
            </div>
            <div style={{ color: 'rgba(255,255,255,.7)', fontSize: '0.75rem', textAlign: 'center', marginTop: '8px' }}>
              Google Drive 플레이어로 재생{formatDuration(item.durationMs) ? ` · ${formatDuration(item.durationMs)}` : ''}
            </div>
          </div>
        ) : (
          <img
            src={item.largeUrl || item.thumbnailUrl}
            alt={item.fileName || '사진'}
            style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
          />
        )}

        {items.length > 1 && (
          <>
            <NavButton side="left" onClick={() => move(-1)} />
            <NavButton side="right" onClick={() => move(1)} />
          </>
        )}
      </div>

      <div style={{
        padding: '12px 16px calc(14px + env(safe-area-inset-bottom))',
        background: 'rgba(0,0,0,.62)', color: '#fff'
      }}>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', fontSize: '0.8125rem', marginBottom: '10px' }}>
          <span style={{ opacity: 0.6 }}>📅</span>
          <span>{formatDayLabel(dayKeyOf(item.takenAt))} {formatTime(item.takenAt)}</span>
          <span style={{ opacity: 0.6, marginLeft: '4px' }}>👤</span>
          <span>{uploaderLabel(item.uploader)}</span>
          {(item.myTags || []).filter((tag) => tag.source !== 'candidate').map((tag) => (
            <span
              key={tag.studentId}
              style={{
                background: 'rgba(49,130,246,.9)', color: '#fff', fontSize: '0.6875rem', fontWeight: 800,
                padding: '3px 9px', borderRadius: 'var(--radius-full)'
              }}
            >{tag.name || '우리 아이'}</span>
          ))}
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          <a
            className="btn"
            href={item.downloadUrl || item.originalUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              flex: 1, background: 'var(--color-primary)', color: '#fff', minHeight: '42px',
              fontSize: '0.875rem', textDecoration: 'none'
            }}
          >⬇ 저장</a>
          <a
            className="btn"
            href={item.originalUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              flex: 1, background: 'rgba(255,255,255,.16)', color: '#fff', minHeight: '42px',
              fontSize: '0.875rem', textDecoration: 'none'
            }}
          >원본 보기</a>
          {item.canDelete && onDelete && (
            <button
              type="button"
              className="btn"
              onClick={() => onDelete(item)}
              style={{
                background: 'rgba(255,72,72,.22)', color: '#FFB4B4', minHeight: '42px',
                fontSize: '0.875rem', padding: '0 14px', border: 'none', fontFamily: 'inherit'
              }}
            >삭제</button>
          )}
        </div>
      </div>
    </div>
  );
}

function NavButton({ side, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={side === 'left' ? '이전 사진' : '다음 사진'}
      style={{
        position: 'absolute', top: '50%', transform: 'translateY(-50%)',
        [side]: '8px',
        background: 'rgba(0,0,0,.35)', border: 'none', color: '#fff',
        width: '38px', height: '38px', borderRadius: '50%', fontSize: '1.1rem',
        cursor: 'pointer', fontFamily: 'inherit'
      }}
    >{side === 'left' ? '‹' : '›'}</button>
  );
}

export default MediaViewer;
