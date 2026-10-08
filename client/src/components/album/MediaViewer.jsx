import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Icon } from '../ui';
import { formatDuration } from '../../utils/mediaUrls';
import {
  drivePlayerFrame, hasSeenFrameTap, isTouchDevice, readyPreviewUrl, rememberFrameTap, shouldPrewarm
} from '../../utils/drivePlayer';
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
 *
 * 배치: 사진은 화면 전체를 쓰고, 위쪽 막대(닫기 · 몇 번째 · 저장)와 아래 정보(날짜 · 올린 사람)는
 * 사진 위에 겹쳐 뜬다. 영상은 겹치지 않는다 — 위쪽 막대는 플레이어 위에, 정보는 플레이어 아래에
 * 자리를 잡는다(겹치면 맨 아래 Drive 컨트롤과 오른쪽 위 Drive 버튼을 가린다).
 * 저장·삭제는 위쪽 막대 오른쪽의 동그란 아이콘 버튼이다.
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

  return (
    <div
      role="dialog"
      aria-label="사진 보기"
      style={{
        position: 'fixed', inset: 0, zIndex: 240, background: '#000',
        display: 'flex', flexDirection: 'column'
      }}
    >
      <div
        data-testid="viewer-top"
        style={{
          ...(isVideo ? {} : {
            position: 'absolute', top: 0, left: 0, right: 0, zIndex: 2,
            background: 'linear-gradient(rgba(0,0,0,.55), rgba(0,0,0,0))'
          }),
          padding: 'calc(12px + env(safe-area-inset-top)) 14px 12px',
          display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', gap: '8px', color: '#fff'
        }}
      >
        <div style={{ justifySelf: 'start', display: 'flex' }}>
          <RoundButton label="닫기" icon="x" onClick={onClose} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '0.8125rem', fontWeight: 600 }}>
          {isVideo && hasNav && <NavButton side="left" inline onClick={() => move(-1)} />}
          <span style={{ opacity: 0.85, textShadow: '0 1px 3px rgba(0,0,0,.6)' }}>{index + 1} / {items.length}</span>
          {isVideo && hasNav && <NavButton side="right" inline onClick={() => move(1)} />}
        </div>
        <div style={{ justifySelf: 'end', display: 'flex', gap: '8px' }}>
          {item.canDelete && onDelete && (
            <RoundButton label="삭제" icon="trash" tone="danger" onClick={() => onDelete(item)} />
          )}
          <RoundButton
            as="a"
            label="저장"
            icon="download"
            tone="accent"
            href={item.downloadUrl || item.originalUrl}
            target="_blank"
            rel="noopener noreferrer"
          />
        </div>
      </div>

      <div style={{ flex: 1, minHeight: 0, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
        {isVideo ? (
          <div
            data-testid="video-stage"
            style={{ alignSelf: 'stretch', width: '100%', maxWidth: '900px', display: 'flex', flexDirection: 'column' }}
          >
            <DrivePlayer
              key={item.id}
              src={item.previewUrl}
              title={item.fileName || '영상'}
              poster={item.largeUrl || item.thumbnailUrl}
            />
            <MediaInfo item={item} />
          </div>
        ) : (
          <>
            <img
              src={item.largeUrl || item.thumbnailUrl}
              alt={item.fileName || '사진'}
              style={{ display: 'block', width: '100%', height: '100%', objectFit: 'contain' }}
            />
            <MediaInfo item={item} overlay />
          </>
        )}

        {!isVideo && hasNav && (
          <>
            <NavButton side="left" onClick={() => move(-1)} />
            <NavButton side="right" onClick={() => move(1)} />
          </>
        )}
      </div>
    </div>
  );
}

/**
 * 날짜 · 올린 사람 · (영상 길이) · 우리 아이 태그.
 * overlay 면 사진 아래쪽에 겹쳐 뜬다 — 누를 것이 없으므로 터치는 그대로 사진으로 지나간다.
 */
function MediaInfo({ item, overlay = false }) {
  const duration = formatDuration(item.durationMs);
  const entry = { display: 'inline-flex', alignItems: 'center', gap: '5px' };

  return (
    <div
      data-testid="media-info"
      style={{
        ...(overlay ? {
          position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 1, pointerEvents: 'none',
          padding: '40px 16px calc(14px + env(safe-area-inset-bottom))',
          background: 'linear-gradient(rgba(0,0,0,0), rgba(0,0,0,.7))',
          textShadow: '0 1px 3px rgba(0,0,0,.6)'
        } : {
          padding: '10px 16px calc(12px + env(safe-area-inset-bottom))'
        }),
        display: 'flex', gap: '6px 12px', alignItems: 'center', flexWrap: 'wrap',
        color: '#fff', fontSize: '0.8125rem'
      }}
    >
      <span style={entry}>
        <Icon name="calendar" size={14} />
        {formatDayLabel(dayKeyOf(item.takenAt))} {formatTime(item.takenAt)}
      </span>
      <span style={entry}>
        <Icon name="user" size={14} />
        {/* 선생님 화면은 학부모가 올린 사진에 그 학부모의 이름이 온다(uploaderName). 학부모 화면에는 이름이 오지 않는다 */}
        {item.uploaderRole === 'parent' && item.uploaderName ? item.uploaderName : uploaderLabel(item.uploader)}
      </span>
      {duration && (
        <span style={entry}>
          <Icon name="clock" size={14} />
          {duration}
        </span>
      )}
      {/* 얼굴 매칭으로 붙은 아이 이름은 보이지 않는다 — 매칭이 틀릴 수 있다(2026-10) */}
    </div>
  );
}

/**
 * Drive 플레이어. 칸(남은 높이 전부)의 크기를 재서, 좁으면 iframe 을 넓게 그리고 줄여 보여 준다.
 * 줄인 결과는 칸과 같은 크기라 화면에서는 꽉 찬 플레이어로 보인다.
 *
 * 휴대폰에서는 플레이어를 준비 상태로 띄우고 그 위에 미리보기 사진을 겹쳐, 누르는 즉시 재생되게 한다
 * (왜, 언제 켜는지는 utils/drivePlayer.js).
 */
function DrivePlayer({ src, title, poster }) {
  const boxRef = useRef(null);
  const frameRef = useRef(null);
  const [box, setBox] = useState({ width: 0, height: 0 });
  // 띄울 때 한 번 정한다 — 도중에 바뀌면 iframe 주소가 바뀌어 재생이 끊긴다
  const [prewarm] = useState(() => shouldPrewarm({ src, touch: isTouchDevice(), sawTap: hasSeenFrameTap() }));
  const [tapped, setTapped] = useState(false);

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

  // 플레이어 안을 누르면 포커스가 iframe 으로 넘어간다 — 그 순간 겹친 사진을 치우고, 이 기기가 신호를 준다는 것을 기억한다.
  // blur 를 주지 않고 포커스만 옮기는 브라우저도 있어 짧게 되풀이해 본다.
  useEffect(() => {
    if (tapped) return undefined;

    const check = () => {
      if (!frameRef.current || document.activeElement !== frameRef.current) return;
      rememberFrameTap();
      setTapped(true);
    };
    window.addEventListener('blur', check);
    const timer = setInterval(check, 120);
    return () => {
      window.removeEventListener('blur', check);
      clearInterval(timer);
    };
  }, [tapped]);

  const frame = drivePlayerFrame(box.width, box.height);
  const scaled = frame.scale < 1;

  return (
    <div ref={boxRef} style={{ flex: 1, minHeight: 0, position: 'relative', overflow: 'hidden', background: '#000' }}>
      {src ? (
        <iframe
          ref={frameRef}
          title={title}
          src={prewarm ? readyPreviewUrl(src) : src}
          // 준비 상태로 세워 두려면 자동 재생 권한을 넘기지 않아야 한다 — 넘기면 뷰어를 열자마자 사진 뒤에서 재생된다
          allow={prewarm ? 'fullscreen' : 'autoplay; fullscreen'}
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

      {prewarm && !tapped && (
        <div
          data-testid="video-poster"
          aria-hidden="true"
          style={{
            position: 'absolute', inset: 0, pointerEvents: 'none', background: '#000',
            display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}
        >
          {poster ? (
            <img
              src={poster}
              alt=""
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain' }}
              onError={(event) => { event.currentTarget.style.visibility = 'hidden'; }}
            />
          ) : null}
          <span style={{
            position: 'relative', width: '64px', height: '64px', borderRadius: '50%', paddingLeft: '4px',
            background: 'rgba(0,0,0,.55)', color: '#fff',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center'
          }}>
            <Icon name="play" size={28} />
          </span>
        </div>
      )}
    </div>
  );
}

const ROUND_TONES = {
  plain: { background: 'rgba(255,255,255,.16)', color: '#fff' },
  // 사진 위에 떠 있을 때 — 밝은 사진에서도 보이게 어둡게
  floating: { background: 'rgba(0,0,0,.35)', color: '#fff' },
  // 저장 — 앱의 단 하나뿐인 강조색(별 노랑) 위에 잉크
  accent: { background: 'var(--star)', color: 'var(--ink)' },
  danger: { background: 'rgba(255,72,72,.22)', color: 'var(--alert-soft)' }
};

/** 뷰어의 동그란 아이콘 버튼. label 은 스크린리더용 이름이자 툴팁이다. */
function RoundButton({ as: As = 'button', label, icon, tone = 'plain', size = 36, style, ...rest }) {
  return (
    <As
      type={As === 'button' ? 'button' : undefined}
      aria-label={label}
      title={label}
      data-tone={tone}
      style={{
        ...ROUND_TONES[tone],
        width: `${size}px`, height: `${size}px`, borderRadius: '50%', border: 'none', padding: 0, flexShrink: 0,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        cursor: 'pointer', textDecoration: 'none', fontFamily: 'inherit',
        ...style
      }}
      {...rest}
    >
      <Icon name={icon} size={18} />
    </As>
  );
}

/** 사진 위 양옆에 떠 있는 버튼. inline 이면 위쪽 막대 안에 자리를 차지한다(영상). */
function NavButton({ side, onClick, inline = false }) {
  return (
    <RoundButton
      label={side === 'left' ? '이전 사진' : '다음 사진'}
      icon={side === 'left' ? 'chevronLeft' : 'chevronRight'}
      tone={inline ? 'plain' : 'floating'}
      size={38}
      onClick={onClick}
      style={inline ? undefined : { position: 'absolute', top: '50%', transform: 'translateY(-50%)', [side]: '8px', zIndex: 1 }}
    />
  );
}

export default MediaViewer;
