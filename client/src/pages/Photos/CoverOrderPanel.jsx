import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Badge, Card } from '../../components/ui';
import RetryImage from '../../components/album/RetryImage';
import AlbumCovers from '../../components/album/AlbumCovers';
import { dropIndex, dropMarker, moveItem } from '../../utils/reorder';

const DRAG_SLOP = 6; // 이만큼은 움직여야 끌기다 — 누르기만 한 손가락이 순서를 바꾸지 않게

/**
 * 앨범의 대표 사진(사진 목록 카드의 표지) 칸 — 고른 순서대로 번호를 달아 보여 주고, 끌어서 놓아(마우스·손가락) 또는
 * 칸에 포커스를 두고 ←→ 키로 순서를 바꾼다. 옆에는 사진 목록 카드에 어떻게 놓이는지 미리 보기(AlbumCovers 그대로).
 *
 * covers   — [{ id, kind, thumbnailUrl }] 지금 대표 사진, 고른 순서 (GET …/album 의 covers)
 * onReorder(ids) — 바뀐 순서. 저장이 실패하면 화면이 covers 를 다시 받아 되돌린다.
 * 끌 자리 계산은 추천 상품 순서 바꾸기와 같다(utils/reorder.js) — 세로 대신 가로 가운데를 잰다.
 */
function CoverOrderPanel({ covers = [], max = 4, disabled = false, onReorder, className }) {
  const [order, setOrder] = useState(covers);   // 끈 결과를 저장이 끝나기 전에 먼저 보여 준다
  useEffect(() => { setOrder(covers); }, [covers]);
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

  const commit = (from, to) => {
    if (from === to) return;
    const next = moveItem(order, from, to);
    setOrder(next);
    onReorder?.(next.map((cover) => cover.id));
  };

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
    if (disabled || event.button > 0 || order.length < 2) return;
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
    if (!step || disabled) return;
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
        <div className="ui-row" data-gap="2">
          <h3 className="ui-card__title">대표 사진</h3>
          <Badge tone={order.length ? 'neutral' : 'muted'}>{order.length}/{max}</Badge>
        </div>

        {order.length === 0 ? (
          <p className="ui-hand">
            사진을 크게 열어 [대표 사진으로] 를 누르거나, [고르기] 로 {max}장까지 골라 [대표 사진 만들기] 를 누르면
            사진 목록에서 이 폴더의 표지가 돼요. 안 고르면 최근 사진이 표지예요.
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
        {order.length > 1 && <p className="ui-hand">끌어서 놓으면 순서가 바뀌어요 · 1번이 표지 맨 앞(3장이면 가장 크게)이에요.</p>}
      </div>
    </Card>
  );
}

export default CoverOrderPanel;
