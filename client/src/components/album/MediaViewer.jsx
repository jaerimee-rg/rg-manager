import React, { useEffect, useState } from 'react';
import { formatDuration } from '../../utils/mediaUrls';
import { formatTime, formatDayLabel, dayKeyOf, uploaderLabel } from '../../utils/albumFilter';

/**
 * 전체 화면 사진·영상 뷰어.
 *
 * 저장 버튼은 Drive 의 다운로드 주소를 새 창으로 연다 — 앱이 파일을 거치지 않고
 * 원본 화질 그대로 내려받는다. 영상은 Drive 플레이어(iframe)로 재생한다.
 *
 * 영상 플레이어는 뷰어 가운데 칸을 꽉 채운다. 16:9 상자에 넣으면 휴대폰 폭에서 높이가
 * 200px 남짓이 되어, Drive 플레이어가 컨트롤과 어두운 막을 영상 위에 겹쳐 그리고
 * 재생 버튼이 잘린다(세로 영상은 더 작아진다). 플레이어 위에 우리 버튼을 얹으면 Drive
 * 컨트롤을 가리므로, 영상일 때 이전/다음은 위쪽 막대로 옮긴다.
 * (Drive 파일 주소를 <video> 로 직접 틀면 Drive 가 다른 사이트 요청을 403 으로 막는다.)
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
  const hasNav = items.length > 1;
  const duration = formatDuration(item.durationMs);

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
        <div style={{
          flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px',
          fontSize: '0.8125rem', fontWeight: 600
        }}>
          {isVideo && hasNav && <NavButton side="left" inline onClick={() => move(-1)} />}
          <span style={{ opacity: 0.85 }}>{index + 1} / {items.length}</span>
          {isVideo && hasNav && <NavButton side="right" inline onClick={() => move(1)} />}
        </div>
        <span style={{ width: '36px' }} />
      </div>

      <div style={{ flex: 1, minHeight: 0, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
        {isVideo ? (
          <div
            data-testid="video-stage"
            style={{ alignSelf: 'stretch', width: '100%', maxWidth: '900px', display: 'flex', flexDirection: 'column' }}
          >
            {item.previewUrl ? (
              <iframe
                key={item.id}
                title={item.fileName || '영상'}
                src={item.previewUrl}
                allow="autoplay; fullscreen"
                allowFullScreen
                style={{ flex: 1, minHeight: 0, width: '100%', border: 'none', background: '#000' }}
              />
            ) : null}
            <div style={{ color: 'rgba(255,255,255,.7)', fontSize: '0.75rem', textAlign: 'center', padding: '8px 16px 0' }}>
              Google Drive 플레이어로 재생{duration ? ` · ${duration}` : ''} · 안 되면 ‘원본 보기’
            </div>
          </div>
        ) : (
          <img
            src={item.largeUrl || item.thumbnailUrl}
            alt={item.fileName || '사진'}
            style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
          />
        )}

        {!isVideo && hasNav && (
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
                background: 'var(--star)', color: 'var(--ink)', fontSize: '0.6875rem', fontWeight: 800,
                padding: '3px 9px', borderRadius: 'var(--shape-tag)'
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
              flex: 1, background: 'var(--star)', color: 'var(--ink)', minHeight: '42px',
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
                background: 'rgba(255,72,72,.22)', color: 'var(--alert-soft)', minHeight: '42px',
                fontSize: '0.875rem', padding: '0 14px', border: 'none', fontFamily: 'inherit'
              }}
            >삭제</button>
          )}
        </div>
      </div>
    </div>
  );
}

/** 사진 위 양옆에 떠 있는 버튼. inline 이면 위쪽 막대 안에 자리를 차지한다(영상). */
function NavButton({ side, onClick, inline = false }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={side === 'left' ? '이전 사진' : '다음 사진'}
      style={{
        ...(inline
          ? { flexShrink: 0, background: 'rgba(255,255,255,.16)' }
          : { position: 'absolute', top: '50%', transform: 'translateY(-50%)', [side]: '8px', background: 'rgba(0,0,0,.35)' }),
        border: 'none', color: '#fff',
        width: '38px', height: '38px', borderRadius: '50%', fontSize: '1.1rem',
        cursor: 'pointer', fontFamily: 'inherit'
      }}
    >{side === 'left' ? '‹' : '›'}</button>
  );
}

export default MediaViewer;
