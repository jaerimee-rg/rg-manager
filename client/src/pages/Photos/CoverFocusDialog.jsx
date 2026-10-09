import React, { useRef, useState } from 'react';
import { Button, Modal } from '../../components/ui';
import { CENTER, coverCellAspect, focusToPosition, nudgeFocus, panFocus, sameFocus } from '../../utils/coverFocus';

/**
 * 대표 사진의 보일 부분 고르기 — 사진 목록 카드에서 이 사진이 놓일 칸과 같은 모양의 틀 안에서 사진을 끌어(마우스·손가락)
 * 또는 화살표 키로 옮긴다. 틀 안에 보이는 그대로가 카드에 보인다. [가운데로] 는 처음 상태.
 *
 * cover    — { id, editUrl, imageUrl, focus } (GET …/album 의 covers 한 줄)
 * count · index — 지금 대표 사진 장수와 이 사진의 자리(틀 모양을 정한다, utils/coverFocus.coverCellAspect)
 * onSave(focus) — 저장. 실패하면 Error(message) 를 던진다 — 창에 그 글을 보여 주고 열어 둔다.
 */
function CoverFocusDialog({ cover, count, index, onClose, onSave }) {
  const [focus, setFocus] = useState(cover.focus || CENTER);
  const [natural, setNatural] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const frameRef = useRef(null);
  const dragRef = useRef(null);   // { x, y, focus } — 누른 자리와 그때의 보일 부분
  const aspect = coverCellAspect(count, index);

  const frameSize = () => {
    const rect = frameRef.current?.getBoundingClientRect();
    return rect ? { width: rect.width, height: rect.height } : null;
  };

  const onPointerDown = (event) => {
    if (event.button > 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    dragRef.current = { x: event.clientX, y: event.clientY, focus };
  };
  const onPointerMove = (event) => {
    const start = dragRef.current;
    if (!start) return;
    setFocus(panFocus(start.focus, { dx: event.clientX - start.x, dy: event.clientY - start.y }, frameSize(), natural));
  };
  const endDrag = () => { dragRef.current = null; };

  const onKeyDown = (event) => {
    const next = nudgeFocus(focus, event.key);
    if (!next) return;
    event.preventDefault();
    setFocus(next);
  };

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      await onSave(sameFocus(focus, CENTER) ? null : focus);
    } catch (saveError) {
      setError(saveError?.message || '저장하지 못했어요.');
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      onClose={saving ? undefined : onClose}
      title="보일 부분 고르기"
      description="사진을 끌어서 사진 목록 카드에 보일 부분을 맞춰요."
      footer={(
        <>
          <Button block disabled={saving} onClick={onClose}>취소</Button>
          <Button variant="primary" block loading={saving} disabled={sameFocus(focus, cover.focus)} onClick={save}>저장</Button>
        </>
      )}
    >
      <div className="ui-cover-focus">
        <div
          ref={frameRef}
          className="ui-cover-focus__frame"
          // 칸 모양(비율)을 지키며 화면 높이의 60% 안에 들게 — 높이를 자르면 비율이 어긋나니 폭을 줄인다
          style={{ aspectRatio: String(aspect), width: `min(100%, calc(60vh * ${aspect.toFixed(3)}))` }}
          role="slider"
          tabIndex={0}
          aria-label="보일 부분 — 끌거나 화살표 키로 옮기기"
          aria-valuetext={`가로 ${Math.round(focus.x)}% · 세로 ${Math.round(focus.y)}%`}
          data-testid="cover-focus-frame"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onKeyDown={onKeyDown}
        >
          <img
            src={cover.editUrl || cover.imageUrl}
            alt=""
            draggable={false}
            style={{ objectPosition: focusToPosition(focus) }}
            onLoad={(event) => setNatural({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })}
          />
        </div>
        <div className="ui-row" data-gap="2" data-justify="between">
          <p className="ui-hand">{index + 1}번 칸 모양 그대로예요 · 틀 밖은 카드에서 잘려요</p>
          <Button size="sm" variant="ghost" disabled={saving || sameFocus(focus, CENTER)} onClick={() => setFocus(CENTER)}>가운데로</Button>
        </div>
        {error && <p className="ui-field__error" role="alert">{error}</p>}
      </div>
    </Modal>
  );
}

export default CoverFocusDialog;
