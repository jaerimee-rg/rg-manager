import React, { useLayoutEffect, useRef, useState } from 'react';
import { Badge, Button, Card, Icon } from '../../components/ui';
import RetryImage from '../../components/album/RetryImage';
import AlbumCovers from '../../components/album/AlbumCovers';
import { dropIndex, dropMarker, moveItem } from '../../utils/reorder';

const DRAG_SLOP = 6; // 이만큼은 움직여야 끌기다 — 누르기만 한 손가락이 순서를 바꾸지 않게

/**
 * 앨범의 대표 사진(사진 목록 카드의 표지) 칸 — 고른 순서대로 번호를 달아 보여 주고, 옆에는 사진 목록 카드에 어떻게 놓이는지
 * 미리 보기(AlbumCovers 그대로).
 * [수정] 을 누르면(또는 고르기의 [대표 사진 만들기] · 사진 보기의 [대표 사진으로] 로 고치기 시작하면) 고치는 중이 되어, 끌어서 놓아
 * (마우스·손가락) 또는 칸에 포커스를 두고 ←→ 키로 순서를 바꾸고 ✕ 로 뺀다. **이 칸은 저장하지 않는다** — 바뀐 목록을 onChange 로
 * 넘기고, 앨범 화면의 [저장하기] 가 한 번에 보낸다(사용자 요청 2026-10-09).
 *
 * covers   — [{ id, kind, thumbnailUrl }] 보여 줄 대표 사진, 순서대로 (고치는 중이면 초안, 아니면 GET …/album 의 covers)
 * editing  — 고치는 중인지. 아닐 때는 칸을 끌 수 없고 [수정] 버튼만 있다
 * onEdit() — [수정] · onChange(covers) — 순서를 바꾸거나 뺀 새 목록
 * 끌 자리 계산은 추천 상품 순서 바꾸기와 같다(utils/reorder.js) — 세로 대신 가로 가운데를 잰다.
 */
function CoverOrderPanel({ covers = [], max = 4, editing = false, disabled = false, onEdit, onChange, className }) {
  const order = covers;
  const [drag, setDrag] = useState(null);       // { from, to, dx } — 끄는 중
  // 포인터 이벤트 사이에 쓰는 값 — { from, to, startX, pointerX, minDx, maxDx, moved }
  const dragRef = useRef(null);
  const listRef = useRef(null);
  const refocusId = useRef(null);

  // 키보드로 옮기면 그 사진 칸에 포커스를 남긴다(칸이 옮겨지며 포커스가 빠지지 않게)
  useLayoutEffect(() => {
    if (refocusId.current == null) return;
    listRef.current?.querySelector(`[data-cover-id="${refocusId.current}"]`)?.focus();
    refocusId.current = null;
  });

  const locked = disabled || !editing;
  const commit = (from, to) => {
    if (from === to) return;
    onChange?.(moveItem(order, from, to));
  };
  const remove = (id) => onChange?.(order.filter((cover) => cover.id !== id));

  // 칸 위치는 그때그때 잰다. 끄는 칸은 빼고 가로 가운데만 본다(칸은 한 줄이다).
  const measure = (pointerX) => {
    const state = dragRef.current;
    const slots = Array.from(listRef.current?.querySelectorAll('[data-cover-index]') || []);
    const mids = slots
      .filter((slot) => Number(slot.dataset.coverIndex) !== state.from)
      .map((slot) => {
        const rect = slot.getBoundingClientRect();
        return rect.left + rect.width / 2;
      });
    state.to = dropIndex(mids, pointerX);
    // 끄는 칸은 줄 안에서만 움직인다
    const dx = Math.min(state.maxDx, Math.max(state.minDx, pointerX - state.startX));
    setDrag({ from: state.from, to: state.to, dx });
  };

  const startDrag = (index) => (event) => {
    if (locked || event.button > 0 || order.length < 2) return;
    event.preventDefault(); // 글자 선택·이미지 끌기·페이지 스크롤 대신 끌기
    event.currentTarget.setPointerCapture?.(event.pointerId);
    const slot = event.currentTarget.getBoundingClientRect();
    const list = listRef.current?.getBoundingClientRect();
    const last = listRef.current?.querySelector(`[data-cover-index="${order.length - 1}"]`)?.getBoundingClientRect();
    dragRef.current = {
      from: index,
      to: index,
      startX: event.clientX,
      pointerX: event.clientX,
      minDx: list ? list.left - slot.left : -Infinity,
      maxDx: last ? last.right - slot.right : Infinity,
      moved: false
    };
  };
  const moveDrag = (event) => {
    const state = dragRef.current;
    if (!state) return;
    state.pointerX = event.clientX;
    if (!state.moved && Math.abs(event.clientX - state.startX) < DRAG_SLOP) return;
    state.moved = true;
    measure(event.clientX);
  };
  const endDrag = (save) => () => {
    const state = dragRef.current;
    dragRef.current = null;
    setDrag(null);
    if (save && state?.moved) commit(state.from, state.to);
  };

  const onKeyDown = (index, cover) => (event) => {
    const step = { ArrowLeft: -1, ArrowRight: 1 }[event.key];
    if (!step || locked) return;
    event.preventDefault();
    const to = index + step;
    if (to < 0 || to >= order.length) return;
    refocusId.current = cover.id;
    commit(index, to);
  };

  const marker = drag ? dropMarker(drag.from, drag.to, order.length) : null;
  const empty = Math.max(0, max - order.length);

  return (
    <Card as="section" padding="md" className={className} aria-label="대표 사진">
      <div className="ui-stack" data-gap="3">
        <div className="ui-row" data-gap="2" data-justify="between">
          <div className="ui-row" data-gap="2">
            <h3 className="ui-card__title">대표 사진</h3>
            <Badge tone={order.length ? 'neutral' : 'muted'}>{order.length}/{max}</Badge>
            {editing && <Badge tone="warning">수정 중</Badge>}
          </div>
          {!editing && order.length > 0 && (
            <Button size="sm" icon="edit" disabled={disabled} onClick={onEdit}>수정</Button>
          )}
        </div>

        {order.length === 0 ? (
          <p className="ui-hand">
            {editing
              ? '대표 사진을 모두 뺐어요. 이대로 저장하면 최근 사진이 표지가 돼요.'
              : `사진을 크게 열어 [대표 사진으로] 를 누르거나, [고르기] 로 ${max}장까지 골라 [대표 사진 만들기] 를 누른 뒤
            [저장하기] 를 누르면 사진 목록에서 이 폴더의 표지가 돼요. 안 고르면 최근 사진이 표지예요.`}
          </p>
        ) : (
          <div className="ui-cover-order">
            <ol className="ui-cover-order__slots" ref={listRef} aria-label="대표 사진 순서">
              {order.map((cover, index) => {
                const dragging = drag?.from === index;
                return (
                  <li
                    key={cover.id}
                    className="ui-cover-order__slot"
                    data-cover-index={index}
                    data-dragging={dragging || undefined}
                    data-drop={marker?.index === index ? marker.edge : undefined}
                    style={dragging ? { transform: `translateX(${drag.dx}px)` } : undefined}
                  >
                    {editing ? (
                      <>
                        <button
                          type="button"
                          className="ui-cover-order__item"
                          data-cover-id={cover.id}
                          disabled={disabled}
                          aria-label={`대표 사진 ${index + 1}${cover.kind === 'video' ? ' (영상)' : ''} — 끌거나 ←→ 키로 순서 바꾸기`}
                          title="끌어서 순서 바꾸기"
                          onPointerDown={startDrag(index)}
                          onPointerMove={moveDrag}
                          onPointerUp={endDrag(true)}
                          onPointerCancel={endDrag(false)}
                          onKeyDown={onKeyDown(index, cover)}
                        >
                          <RetryImage src={cover.thumbnailUrl} draggable={false} />
                          <span className="ui-cover-order__num" aria-hidden="true">{index + 1}</span>
                        </button>
                        <button
                          type="button"
                          className="ui-cover-order__remove"
                          disabled={disabled}
                          aria-label={`${index + 1}번 대표 사진 빼기`}
                          title="대표 사진에서 빼기"
                          onClick={() => remove(cover.id)}
                        >
                          <Icon name="x" size={12} />
                        </button>
                      </>
                    ) : (
                      <span
                        className="ui-cover-order__item"
                        data-cover-id={cover.id}
                        role="img"
                        aria-label={`대표 사진 ${index + 1}${cover.kind === 'video' ? ' (영상)' : ''}`}
                      >
                        <RetryImage src={cover.thumbnailUrl} draggable={false} />
                        <span className="ui-cover-order__num" aria-hidden="true">{index + 1}</span>
                      </span>
                    )}
                  </li>
                );
              })}
              {Array.from({ length: empty }, (_, i) => (
                <li key={`empty-${i}`} className="ui-cover-order__slot" data-empty aria-hidden="true">
                  <span className="ui-cover-order__item">{order.length + i + 1}</span>
                </li>
              ))}
            </ol>
            <figure className="ui-cover-order__preview">
              <div className="ui-cover-order__preview-box">
                <AlbumCovers urls={order.map((cover) => cover.thumbnailUrl)} data-testid="cover-preview" />
              </div>
              <figcaption className="ui-cover-order__hint">사진 목록에서 이렇게 보여요</figcaption>
            </figure>
          </div>
        )}
        {editing && order.length > 0 && (
          <p className="ui-hand">
            {order.length > 1 ? '끌어서 놓으면 순서가 바뀌어요 · 1번이 표지 맨 앞(3장이면 가장 크게)이에요 · ' : ''}
            ✕ 로 빼요 · [저장하기] 를 눌러야 사진 목록에 반영돼요.
          </p>
        )}
      </div>
    </Card>
  );
}

export default CoverOrderPanel;
