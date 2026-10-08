import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { formatDuration } from '../../utils/mediaUrls';
import { drivePlayerFrame } from '../../utils/drivePlayer';
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
 *
 * 좁은 화면에서는 플레이어를 넓게 그린 뒤 줄여 보여 준다(DrivePlayer, utils/drivePlayer.js) —
 * 그래야 Drive 가 컨트롤을 영상 한가운데가 아니라 맨 아래 막대로 그린다.
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
            <DrivePlayer key={item.id} src={item.previewUrl} title={item.fileName || '영상'} />
            <div style={{ color: 'rgba(255,255,255,.7)', fontSize: '0.75rem', textAlign: 'center', padding: '8px 16px 0' }}>
              Google Drive 플레이어로 재생{duration ? ` · ${duration}` : ''}
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
          {/* 선생님 화면은 학부모가 올린 사진에 그 학부모의 이름이 온다(uploaderName). 학부모 화면에는 이름이 오지 않는다 */}
          <span>{item.uploaderRole === 'parent' && item.uploaderName ? item.uploaderName : uploaderLabel(item.uploader)}</span>
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

/**
 * Drive 플레이어. 칸(남은 높이 전부)의 크기를 재서, 좁으면 iframe 을 넓게 그리고 줄여 보여 준다.
 * 줄인 결과는 칸과 같은 크기라 화면에서는 꽉 찬 플레이어로 보인다.
 */
function DrivePlayer({ src, title }) {
  const boxRef = useRef(null);
  const [box, setBox] = useState({ width: 0, height: 0 });

  useLayoutEffect(() => {
    const element = boxRef.current;
    if (!element) return undefined;

    const measure = () => {
      const next = { width: element.clientWidth, height: element.clientHeight };
      setBox((prev) => (prev.width === next.width && prev.height === next.height ? prev : next));
    };
    measure();

    // 휴대폰을 돌리거나 창 크기가 바뀌면 다시 잰다
    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const frame = drivePlayerFrame(box.width, box.height);
  const scaled = frame.scale < 1;

  return (
    <div ref={boxRef} style={{ flex: 1, minHeight: 0, position: 'relative', overflow: 'hidden', background: '#000' }}>
      {src ? (
        <iframe
          title={title}
          src={src}
          allow="autoplay; fullscreen"
          allowFullScreen
          style={{
            position: 'absolute', top: 0, left: 0, border: 'none', background: '#000',
            width: scaled ? `${frame.width}px` : '100%',
            height: scaled ? `${frame.height}px` : '100%',
            transform: scaled ? `scale(${frame.scale})` : 'none',
            transformOrigin: 'top left'
          }}
        />
      ) : null}
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
