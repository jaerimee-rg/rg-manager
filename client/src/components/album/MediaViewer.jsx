import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Button, Field, Icon, Textarea } from '../ui';
import { formatDuration } from '../../utils/mediaUrls';
import { PAGE_GAP } from '../../utils/viewerSwipe';
import { CAPTION_MAX, captionChanged, cleanCaption } from '../../utils/mediaCaption';
import { useSwipeToPage } from '../../hooks/useSwipeToPage';
import { useKeyboardInset } from '../../hooks/useKeyboardInset';
import {
  drivePlayerFrame, hasSeenFrameTap, isTouchDevice, readyPreviewUrl, rememberFrameTap, shouldCoverForSwipe, shouldPrewarm,
  swipeBands
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
 *
 * 휴대폰에서는 옆으로 밀어 이전·다음 장(사진이든 영상이든)으로 넘긴다(hooks/useSwipeToPage). 양옆 장은 화면 밖에
 * 미리 그려 두어 밀 때 손가락을 따라 들어온다(영상은 미리보기 사진으로). Drive 플레이어 안의 터치는 다른 출처의
 * iframe 이라 우리에게 오지 않으므로, 플레이어 위에 Drive 버튼 자리만 비운 투명한 판을 덮어 그 위에서 민 것을 받는다
 * (어디를 비우는지는 utils/drivePlayer.js).
 *
 * 선생님이 붙인 설명(item.caption)은 아래 정보 줄 위에 보인다 — 사진이면 사진 위에 겹쳐, 영상이면 플레이어 아래에.
 * onCaptionSave(item, caption) 를 주면(선생님 화면) 그 자리에 [설명 추가]·[설명 수정] 이 생기고, 누르면 뷰어 안에서
 * 아래쪽 입력 창이 열린다. 저장에 실패하면 Error(message) 를 던진다 — 창에 그 글을 보여 주고 열어 둔다.
 * 쓰는 동안에는 넘기기(밀기 · 화살표 키)를 멈추고, Esc 는 뷰어가 아니라 입력 창을 닫는다.
 *
 * onCoverChange(item, on) 를 주면(선생님 화면) 정보 줄에 [대표 사진으로] 가 생긴다 — 사진 목록 카드의 표지로 쓸 사진(coverLimit 장까지).
 * coverIds 에 든 장에서는 [대표 사진 n] 으로 눌린 채 보이고, 다시 누르면 푼다. 이미 coverLimit 장이면 다른 장의 버튼은 잠긴다.
 * coverPending 이면(고친 대표 사진을 아직 저장하지 않았다) 버튼 옆에 "[저장하기] 를 눌러야 반영돼요" 를 붙인다.
 * 숨긴 사진은 표지로 쓰이지 않아 버튼이 없다.
 */
function MediaViewer({
  items = [], startId, onClose, onDelete, onCaptionSave, coverIds = [], coverLimit = 4, coverPending = false, onCoverChange,
  onShow, showViews = false
}) {
  const [index, setIndex] = useState(() => {
    const found = items.findIndex((item) => item.id === startId);
    return found >= 0 ? found : 0;
  });

  const item = items[index];
  const dialogRef = useRef(null);
  const trackRef = useRef(null);
  const hasNav = items.length > 1;
  const [editing, setEditing] = useState(false);
  const [coverSaving, setCoverSaving] = useState(false);
  const canEditCaption = typeof onCaptionSave === 'function';

  useSwipeToPage({
    enabled: hasNav && !editing,
    areaRef: dialogRef,
    trackRef,
    onStep: (step) => setIndex((i) => (i + step + items.length) % items.length)
  });

  useEffect(() => {
    const onKey = (event) => {
      // 설명을 쓰는 중 — 화살표는 글 안에서 커서를 옮기고, Esc 는 입력 창이 받는다(CaptionEditor)
      if (editing) return;
      if (event.key === 'Escape') onClose?.();
      if (event.key === 'ArrowLeft') setIndex((i) => (i - 1 + items.length) % items.length);
      if (event.key === 'ArrowRight') setIndex((i) => (i + 1) % items.length);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [items.length, onClose, editing]);

  // 지금 장이 바뀔 때마다(열기 · 넘기기) 알린다 — 학부모 화면이 본 기록을 남긴다
  const shownId = items[index]?.id;
  useEffect(() => {
    if (shownId != null) onShow?.(items[index]);
    // 장이 바뀔 때만 — 같은 장에서 목록만 새로 받으면 다시 알리지 않는다
  }, [shownId]);

  // 목록이 바뀌어(삭제 등) 인덱스가 넘치면 되돌린다.
  useEffect(() => {
    if (index >= items.length) setIndex(Math.max(0, items.length - 1));
  }, [items.length, index]);

  if (!item) return null;

  const move = (step) => setIndex((i) => (i + step + items.length) % items.length);
  const isVideo = item.kind === 'video';
  const onEditCaption = canEditCaption ? () => setEditing(true) : undefined;
  const coverOrder = coverIds.indexOf(item.id) + 1;
  const cover = typeof onCoverChange === 'function' && !item.isHidden ? {
    on: coverOrder > 0,
    order: coverOrder,
    full: coverOrder === 0 && coverIds.length >= coverLimit,
    limit: coverLimit,
    pending: coverPending,
    saving: coverSaving,
    toggle: async () => {
      setCoverSaving(true);
      try {
        await onCoverChange(item, coverOrder === 0);
      } finally {
        setCoverSaving(false);
      }
    }
  } : undefined;

  return (
    <div
      ref={dialogRef}
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

      <div style={{ flex: 1, minHeight: 0, position: 'relative', overflow: 'hidden' }}>
        {/* 손가락을 따라 옆으로 움직이는 줄 — 지금 장 + 양옆 장. 장이 바뀌어도 같은 요소로 남아야 한다 */}
        <div
          ref={trackRef}
          data-testid="viewer-track"
          style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
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
                canPage={hasNav}
              />
              <MediaInfo item={item} onEditCaption={onEditCaption} cover={cover} showViews={showViews} />
            </div>
          ) : (
            <>
              <img
                src={item.largeUrl || item.thumbnailUrl}
                alt={item.fileName || '사진'}
                style={{ display: 'block', width: '100%', height: '100%', objectFit: 'contain' }}
              />
              <MediaInfo item={item} overlay onEditCaption={onEditCaption} cover={cover} showViews={showViews} />
            </>
          )}

          {hasNav && (
            <>
              <PeekPage item={items[(index - 1 + items.length) % items.length]} side={-1} />
              <PeekPage item={items[(index + 1) % items.length]} side={1} />
            </>
          )}
        </div>

        {!isVideo && hasNav && (
          <>
            <NavButton side="left" onClick={() => move(-1)} />
            <NavButton side="right" onClick={() => move(1)} />
          </>
        )}
      </div>

      {editing && (
        <CaptionEditor
          key={item.id}
          kind={item.kind}
          initial={item.caption}
          onCancel={() => setEditing(false)}
          onSave={async (caption) => {
            await onCaptionSave(item, caption);
            setEditing(false);
          }}
        />
      )}
    </div>
  );
}

/**
 * 화면 밖에 대기하는 옆 장 — 밀면 손가락을 따라 들어온다. 그림만 있고(영상은 미리보기 사진 + 재생 표시)
 * 화면 읽기 프로그램에는 보이지 않는다. 미리 받아 두므로 넘기는 순간 그 장이 바로 뜬다.
 */
function PeekPage({ item, side }) {
  const src = item.largeUrl || item.thumbnailUrl;
  return (
    <div
      data-testid="viewer-peek"
      aria-hidden="true"
      style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        transform: `translateX(calc(${side * 100}% + ${side * PAGE_GAP}px))`,
        display: 'flex', alignItems: 'center', justifyContent: 'center'
      }}
    >
      {src ? (
        <img src={src} alt="" style={{ display: 'block', width: '100%', height: '100%', objectFit: 'contain' }} />
      ) : null}
      {item.kind === 'video' && (
        <span style={{
          position: 'absolute', width: '64px', height: '64px', borderRadius: '50%', paddingLeft: '4px',
          background: 'rgba(0,0,0,.55)', color: '#fff',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center'
        }}>
          <Icon name="play" size={28} />
        </span>
      )}
    </div>
  );
}

/**
 * 선생님이 붙인 설명 · 날짜 · 올린 사람 · (영상 길이).
 * overlay 면 사진 아래쪽에 겹쳐 뜬다 — 누를 것([더 보기] · [설명 수정])만 터치를 받고 나머지는 그대로 사진으로 지나간다.
 * onEditCaption 이 있으면(선생님 화면) 정보 줄 끝에 [설명 추가]·[설명 수정] 이 붙는다.
 * cover 가 있으면(선생님 화면) 그 뒤에 [대표 사진으로] — 지금 대표 사진이면 노란 [대표 사진 n] 으로 눌려 있고,
 * 대표가 꽉 찼으면 [대표 사진 4장 다 골랐어요] 로 잠긴다.
 */
function MediaInfo({ item, overlay = false, onEditCaption, cover, showViews = false }) {
  const duration = formatDuration(item.durationMs);
  const entry = { display: 'inline-flex', alignItems: 'center', gap: '5px' };
  const pill = {
    ...entry, pointerEvents: 'auto', border: 'none', borderRadius: '999px', padding: '5px 11px',
    background: 'rgba(255,255,255,.18)', color: '#fff', textShadow: 'none',
    fontFamily: 'inherit', fontSize: '0.8125rem', fontWeight: 700, cursor: 'pointer'
  };

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
      {item.caption && <MediaCaption key={item.id} text={item.caption} />}
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
      {/* 선생님 화면 — 학부모가 이 사진을 크게 본 횟수 */}
      {showViews && (
        <span style={entry} data-testid="media-views">
          <Icon name="eye" size={14} />
          {item.viewCount || 0}번 봤어요
        </span>
      )}
      {/* 얼굴 매칭으로 붙은 아이 이름은 보이지 않는다 — 매칭이 틀릴 수 있다(2026-10) */}
      {onEditCaption && (
        <button type="button" onClick={onEditCaption} style={pill}>
          <Icon name={item.caption ? 'edit' : 'plus'} size={14} />
          {item.caption ? '설명 수정' : '설명 추가'}
        </button>
      )}
      {cover && (
        <button
          type="button"
          aria-pressed={cover.on}
          disabled={cover.saving || cover.full}
          title={cover.on ? '누르면 대표 사진을 풀어요'
            : cover.full ? '다른 대표 사진을 먼저 풀어 주세요' : `사진 목록에서 이 폴더의 표지가 돼요 (${cover.limit}장까지)`}
          onClick={cover.toggle}
          style={{
            ...pill,
            ...(cover.on ? { background: 'var(--star)', color: 'var(--ink)' } : {}),
            ...(cover.saving ? { opacity: 0.6, cursor: 'wait' } : {}),
            ...(cover.full ? { opacity: 0.6, cursor: 'not-allowed' } : {})
          }}
        >
          <Icon name="star" size={14} fill={cover.on ? 'currentColor' : 'none'} />
          {cover.on ? `대표 사진 ${cover.order}` : cover.full ? `대표 사진 ${cover.limit}장 다 골랐어요` : '대표 사진으로'}
        </button>
      )}
      {cover?.pending && <span style={entry}>[저장하기] 를 눌러야 반영돼요</span>}
    </div>
  );
}

/**
 * 설명 글. 세 줄까지 보이고, 넘치면 [더 보기] 로 펼친다 — 긴 설명이 사진을 덮지 않게.
 * 펼친 글은 화면 높이의 40% 안에서 위아래로 넘겨 읽는다. 줄바꿈은 쓴 그대로 보인다.
 */
function MediaCaption({ text }) {
  const textRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [clamped, setClamped] = useState(false);

  useLayoutEffect(() => {
    const element = textRef.current;
    if (!element || open) return undefined;
    const measure = () => setClamped(element.scrollHeight > element.clientHeight + 1);
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [text, open]);

  return (
    <div data-testid="media-caption" style={{ flexBasis: '100%', minWidth: 0 }}>
      <p
        ref={textRef}
        style={{
          margin: 0, fontSize: '0.9375rem', lineHeight: 1.5, fontWeight: 500,
          whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', wordBreak: 'keep-all',
          ...(open ? {
            maxHeight: '40vh', overflowY: 'auto', pointerEvents: 'auto', overscrollBehavior: 'contain'
          } : {
            display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: 3, overflow: 'hidden'
          })
        }}
      >
        {text}
      </p>
      {(clamped || open) && (
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
          style={{
            pointerEvents: 'auto', border: 'none', background: 'none', padding: '2px 0 0', color: 'rgba(255,255,255,.75)',
            fontFamily: 'inherit', fontSize: '0.8125rem', fontWeight: 700, cursor: 'pointer', textShadow: 'inherit'
          }}
        >
          {open ? '접기' : '더 보기'}
        </button>
      )}
    </div>
  );
}

/**
 * 설명 입력 창 — 뷰어 안 아래쪽에 열린다(앱의 Modal 은 뷰어보다 아래 층에 그려진다).
 * 버튼은 글 칸 위에 둔다: 휴대폰 키보드가 올라와도 [저장] 이 키보드 뒤로 숨지 않는다.
 * 뒤쪽 사진을 눌러도 닫히지 않는다 — 쓰던 글이 실수로 사라지지 않게.
 */
function CaptionEditor({ kind, initial, onCancel, onSave }) {
  const [text, setText] = useState(initial || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const keyboard = useKeyboardInset();
  const changed = captionChanged(text, initial);
  const label = kind === 'video' ? '영상 설명' : '사진 설명';

  // Esc 는 뷰어가 아니라 이 창만 닫는다. 한글을 조합하는 중의 Esc 와 저장하는 중에는 닫지 않는다
  // (저장 중에 닫으면 실패했을 때 알릴 곳이 없다)
  const cancelRef = useRef(onCancel);
  cancelRef.current = onCancel;
  useEffect(() => {
    const onKey = (event) => {
      if (event.key !== 'Escape' || event.isComposing || saving) return;
      cancelRef.current?.();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [saving]);

  const submit = async (event) => {
    event.preventDefault();
    if (saving || !changed) return;
    setSaving(true);
    setError('');
    try {
      await onSave(cleanCaption(text));
    } catch (saveError) {
      setError(saveError?.message || '설명을 저장하지 못했어요.');
      setSaving(false);
    }
  };

  return (
    <div
      data-testid="caption-editor"
      style={{
        position: 'absolute', inset: 0, zIndex: 5, background: 'rgba(0,0,0,.55)',
        display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', paddingBottom: `${keyboard}px`
      }}
    >
      <form
        aria-label={label}
        onSubmit={submit}
        style={{
          width: '100%', maxWidth: '640px', margin: '0 auto', boxSizing: 'border-box',
          background: 'var(--surface)', color: 'var(--ink)',
          borderRadius: 'var(--radius-2xl) var(--radius-2xl) 0 0',
          padding: `14px 16px ${keyboard ? '14px' : 'calc(14px + env(safe-area-inset-bottom))'}`,
          display: 'flex', flexDirection: 'column', gap: '10px'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <b style={{ flex: 1, fontSize: '1rem' }}>{initial ? `${label} 수정` : `${label} 추가`}</b>
          <Button size="sm" variant="ghost" disabled={saving} onClick={onCancel}>취소</Button>
          <Button size="sm" variant="primary" type="submit" loading={saving} disabled={!changed}>저장</Button>
        </div>
        <Field
          hint="학부모가 사진·영상을 볼 때 화면 아래쪽에 보여요. 비우고 저장하면 설명이 지워져요."
          error={error}
          counter={{ value: text.length, max: CAPTION_MAX }}
        >
          {(props) => (
            <Textarea
              {...props}
              aria-label={label}
              value={text}
              maxLength={CAPTION_MAX}
              rows={3}
              autoFocus
              placeholder="예) 단체전 결승 무대 — 리본 연기"
              onChange={(event) => { setText(event.target.value); if (error) setError(''); }}
            />
          )}
        </Field>
      </form>
    </div>
  );
}

/**
 * Drive 플레이어. 칸(남은 높이 전부)의 크기를 재서, 좁으면 iframe 을 넓게 그리고 줄여 보여 준다.
 * 줄인 결과는 칸과 같은 크기라 화면에서는 꽉 찬 플레이어로 보인다.
 *
 * 휴대폰에서는 플레이어를 준비 상태로 띄우고 그 위에 미리보기 사진을 겹쳐, 누르는 즉시 재생되게 한다
 * (왜, 언제 켜는지는 utils/drivePlayer.js). canPage 면 손가락 기기에서 넘기기 판을 덮는다.
 */
function DrivePlayer({ src, title, poster, canPage = false }) {
  const boxRef = useRef(null);
  const frameRef = useRef(null);
  const [box, setBox] = useState({ width: 0, height: 0 });
  // 띄울 때 한 번 정한다 — 도중에 바뀌면 iframe 주소가 바뀌어 재생이 끊긴다
  const [touch] = useState(isTouchDevice);
  const [prewarm] = useState(() => shouldPrewarm({ src, touch, sawTap: hasSeenFrameTap() }));
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

      {/* 넘기기 판 — 그 위의 터치는 뷰어의 넘기기로 간다. Drive 버튼 자리(가운데 · 위 · 아래)는 비어 있어 그대로 눌린다 */}
      {src && shouldCoverForSwipe({ touch, canPage }) && (
        <div data-testid="video-swipe-cover" aria-hidden="true" style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
          {swipeBands({ scale: frame.scale }).map(({ key, ...edges }) => (
            <div key={key} data-band={key} style={{ position: 'absolute', ...edges, pointerEvents: 'auto' }} />
          ))}
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
