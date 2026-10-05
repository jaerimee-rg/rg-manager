import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { filterByCategory, formatPrice, hostnameOf, isClickableProduct, matchProductTitle } from '../../utils/shopFormat';
import { dropIndex, dropMarker } from '../../utils/reorder';
import {
  Badge, Button, Callout, Card, Chip, DataTable, EmptyState, Icon, IconButton, Row, SearchInput, Switch, Toolbar
} from '../../components/ui';

/** 상품 썸네일 + 타이틀 + 링크 도메인. 통계 표도 같은 모양을 쓴다. */
export function ProductItem({ product, subtitle }) {
  const hidden = product.isVisible === false;
  return (
    <div className="shop-item" data-hidden={hidden || undefined}>
      <span className="shop-thumb">
        {product.imageUrl ? <img src={product.imageUrl} alt="" /> : <Icon name="image" size={18} />}
      </span>
      <div className="shop-item__text">
        <div className="ui-list-row__title" style={{ whiteSpace: 'normal', wordBreak: 'keep-all' }}>
          {product.title}
          {hidden && <> <Badge tone="neutral">숨김</Badge></>}
          {product.isReservable && <> <Badge tone="brand">예약</Badge></>}
        </div>
        <div className="ui-list-row__subtitle">{subtitle}</div>
      </div>
    </div>
  );
}

const subtitleOf = (product) => {
  const photos = product.images?.length || 0;
  const host = hostnameOf(product.url);
  const link = host || (
    <span className="ui-text-subtle">
      {product.isReservable
        ? '링크 없음 — 상세에서 예약을 받아요'
        : photos ? '링크 없음 — 상세에서 사진만 보여요' : '링크 없음 — 누를 수 없는 카드'}
    </span>
  );
  return photos > 1 ? <>{link} · 사진 {photos}장</> : link;
};

const EDGE = 72; // 화면 위·아래 끝에서 이만큼 안으로 끌면 그쪽으로 저절로 스크롤한다
const EDGE_SPEED = 14;
const DRAG_SLOP = 12;

/**
 * 상품 탭 — 검색 + 카테고리 칩 + DataTable (데스크탑 표 / 모바일 카드는 CSS 가 정한다).
 * 표 순서가 곧 공개 상점 순서다. 순서는 손잡이(⠿)를 끌어서(마우스·손가락), ▲▼ 로, 손잡이에서 ↑↓ 키로 바꾼다.
 * 걸러 보는 중에는 순서를 바꾸지 않는다(옆 칸이 숨어 있어 헷갈린다).
 */
function ProductList({ products, categories, onCreate, onEdit, onDelete, onToggle, onMove, onReorder }) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState(null);
  const [drag, setDrag] = useState(null); // { from, to, dy } — 끄는 중
  // 포인터 이벤트 사이에 쓰는 값 — { from, to, startY, startScroll, pointerY, minDy, maxDy }
  const dragRef = useRef(null);
  const tableRef = useRef(null);
  const refocusId = useRef(null);

  // 행 위치는 그때그때 잰다(스크롤·끄는 행의 이동이 반영되게). 끄는 행은 빼고 잰다.
  const measure = (pointerY) => {
    const state = dragRef.current;
    const rows = Array.from(tableRef.current?.querySelectorAll('tbody tr[data-product-index]') || []);
    const mids = rows
      .filter((row) => Number(row.dataset.productIndex) !== state.from)
      .map((row) => {
        const rect = row.getBoundingClientRect();
        return rect.top + rect.height / 2;
      });
    state.to = dropIndex(mids, pointerY);
    // 끄는 행은 목록 안에서만 움직인다 — 밖으로 나가면 페이지가 길어져 저절로 스크롤이 끝없이 이어진다
    const dy = pointerY - state.startY + (window.scrollY - state.startScroll);
    setDrag({ from: state.from, to: state.to, dy: Math.min(state.maxDy, Math.max(state.minDy, dy)) });
  };

  // 화면 끝 가까이에서 손을 멈추고 있어도 계속 스크롤되게 — 끄는 동안만 돈다
  const dragging = Boolean(drag);
  useEffect(() => {
    if (!dragging) return undefined;
    let frame;
    const tick = () => {
      const state = dragRef.current;
      // 화면 끝에서 손잡이를 잡자마자 저절로 스크롤되지 않게, 조금이라도 끈 뒤부터
      if (state && Math.abs(state.pointerY - state.startY) > DRAG_SLOP) {
        const y = state.pointerY;
        const list = tableRef.current?.querySelector('tbody')?.getBoundingClientRect();
        let step = y < EDGE ? -EDGE_SPEED : y > window.innerHeight - EDGE ? EDGE_SPEED : 0;
        // 목록 끝이 이미 화면 안이면 그쪽으로는 더 스크롤하지 않는다
        if (list && ((step > 0 && list.bottom <= window.innerHeight - EDGE / 2) || (step < 0 && list.top >= EDGE / 2))) step = 0;
        if (step) {
          window.scrollBy(0, step);
          measure(y);
        }
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [dragging]);

  // 키보드로 옮기면 그 상품의 손잡이에 포커스를 남긴다(행이 옮겨지며 포커스가 빠지지 않게)
  useLayoutEffect(() => {
    if (refocusId.current == null) return;
    tableRef.current?.querySelector(`[data-grip-id="${refocusId.current}"]`)?.focus();
    refocusId.current = null;
  });

  const startDrag = (index) => (event) => {
    if (event.button > 0) return;
    event.preventDefault(); // 글자 선택·페이지 스크롤 대신 끌기
    event.currentTarget.setPointerCapture?.(event.pointerId);
    const row = event.currentTarget.closest('tr')?.getBoundingClientRect();
    const list = tableRef.current?.querySelector('tbody')?.getBoundingClientRect();
    dragRef.current = {
      from: index,
      to: index,
      startY: event.clientY,
      startScroll: window.scrollY,
      pointerY: event.clientY,
      minDy: row && list ? list.top - row.top : -Infinity,
      maxDy: row && list ? list.bottom - row.bottom : Infinity
    };
    setDrag({ from: index, to: index, dy: 0 });
  };
  const moveDrag = (event) => {
    if (!dragRef.current) return;
    dragRef.current.pointerY = event.clientY;
    measure(event.clientY);
  };
  const endDrag = (commit) => () => {
    const state = dragRef.current;
    dragRef.current = null;
    setDrag(null);
    if (commit && state && state.to !== state.from) onReorder(state.from, state.to);
  };

  const names = useMemo(() => new Map(categories.map((c) => [c.id, c.name])), [categories]);

  const counts = useMemo(() => {
    const map = new Map();
    products.forEach((p) => {
      const key = p.categoryId != null && names.has(p.categoryId) ? p.categoryId : 'none';
      map.set(key, (map.get(key) || 0) + 1);
    });
    return map;
  }, [products, names]);

  if (!products.length) {
    return (
      <>
        {categories.length > 0 && (
          <Callout tone="brand" style={{ marginTop: 'var(--space-4)' }}>
            카테고리 {categories.length}개({categories.map((c) => c.name).join('·')})가 준비돼 있어요. 설정 탭에서 바꿀 수 있어요.
          </Callout>
        )}
        <Card style={{ marginTop: 'var(--space-4)' }}>
          <EmptyState
            icon="inbox"
            title="아직 등록된 상품이 없어요"
            description="타이틀만 입력해도 바로 등록돼요. 링크·사진·가격은 나중에 채워도 괜찮아요."
            action={<Button variant="primary" icon="plus" onClick={onCreate}>상품</Button>}
          />
        </Card>
      </>
    );
  }

  const query = search.trim();
  const filtering = Boolean(query) || filter != null;
  const rows = filterByCategory(products, filter).filter((p) => matchProductTitle(query, p.title));
  const visibleCount = products.filter((p) => p.isVisible !== false).length;

  const marker = drag ? dropMarker(drag.from, drag.to, products.length) : null;

  const columns = [
    {
      key: 'order',
      header: '순서',
      width: '124px',
      render: (product) => {
        const index = products.findIndex((p) => p.id === product.id);
        return (
          <div className="shop-order">
            <button
              type="button"
              className="ui-icon-btn shop-order__grip"
              data-size="sm"
              data-variant="plain"
              data-grip-id={product.id}
              disabled={filtering}
              aria-label={`${product.title} 순서 — 끌어서 옮기거나 ↑↓ 키`}
              title={filtering ? '검색·필터를 풀면 끌어서 옮길 수 있어요' : '끌어서 순서 바꾸기'}
              onPointerDown={startDrag(index)}
              onPointerMove={moveDrag}
              onPointerUp={endDrag(true)}
              onPointerCancel={endDrag(false)}
              onKeyDown={(event) => {
                const step = { ArrowUp: -1, ArrowDown: 1 }[event.key];
                if (!step) return;
                event.preventDefault();
                refocusId.current = product.id;
                onMove(index, step);
              }}
            >
              <Icon name="grip" size={16} strokeWidth={3} />
            </button>
            <IconButton
              icon="chevronUp" size="sm" variant="ghost" label="위로"
              disabled={filtering || index === 0}
              onClick={() => onMove(index, -1)}
            />
            <IconButton
              icon="chevronDown" size="sm" variant="ghost" label="아래로"
              disabled={filtering || index === products.length - 1}
              onClick={() => onMove(index, 1)}
            />
          </div>
        );
      }
    },
    { key: 'title', header: '상품', render: (product) => <ProductItem product={product} subtitle={subtitleOf(product)} /> },
    {
      key: 'category',
      header: '카테고리',
      width: '112px',
      render: (product) =>
        names.has(product.categoryId)
          ? <Badge tone="neutral">{names.get(product.categoryId)}</Badge>
          : <span className="ui-text-subtle">카테고리 없음</span>
    },
    {
      key: 'price',
      header: '가격',
      width: '104px',
      numeric: true,
      render: (product) => formatPrice(product.price) || <span className="ui-text-subtle">—</span>
    },
    {
      key: 'visible',
      header: '공개',
      width: '72px',
      render: (product) => (
        <Switch
          checked={product.isVisible !== false}
          onChange={(e) => onToggle(product, e.target.checked)}
          aria-label={`${product.title} 공개`}
        />
      )
    },
    {
      key: 'clicks',
      header: '누적 클릭',
      width: '88px',
      numeric: true,
      // 공개 목록에서 누를 수 없는 카드(링크·사진·예약 모두 없음)는 셀 클릭이 없다
      render: (product) => (isClickableProduct(product) ? product.clickCount || 0 : <span className="ui-text-subtle">—</span>)
    },
    {
      key: 'actions',
      header: '관리',
      width: '140px',
      hideLabelOnMobile: true,
      render: (product) => (
        <Row gap={2}>
          <Button size="sm" onClick={() => onEdit(product)} aria-label={`${product.title} 수정`}>수정</Button>
          <Button size="sm" variant="danger-quiet" onClick={() => onDelete(product)} aria-label={`${product.title} 삭제`}>삭제</Button>
        </Row>
      )
    }
  ];

  return (
    <>
      <div className="shop-tools">
        <SearchInput
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onClear={() => setSearch('')}
          placeholder="상품 이름 검색 (초성 가능)"
          aria-label="상품 검색"
        />
        <Toolbar aria-label="카테고리">
          <Chip selected={filter == null} count={products.length} onClick={() => setFilter(null)}>전체</Chip>
          {categories.filter((c) => counts.get(c.id)).map((c) => (
            <Chip key={c.id} selected={filter === c.id} count={counts.get(c.id)} onClick={() => setFilter(c.id)}>
              {c.name}
            </Chip>
          ))}
          {counts.get('none') ? (
            <Chip selected={filter === 'none'} count={counts.get('none')} onClick={() => setFilter('none')}>카테고리 없음</Chip>
          ) : null}
        </Toolbar>
      </div>

      <div ref={tableRef}>
        <DataTable
          className="shop-list"
          data-dragging={drag ? 'true' : undefined}
          columns={columns}
          rows={rows}
          rowProps={(product) => {
            const index = products.findIndex((p) => p.id === product.id);
            const lifted = drag && drag.from === index;
            return {
              'data-product-index': index,
              'data-dragging': lifted ? 'true' : undefined,
              'data-drop': marker && marker.index === index ? marker.edge : undefined,
              style: lifted ? { transform: `translateY(${drag.dy}px)` } : undefined
            };
          }}
          caption={filtering
            ? `${rows.length}개 보는 중 — 순서는 검색·필터를 풀면 바꿀 수 있어요`
            : `전체 ${products.length}개 · 공개 ${visibleCount}개 — 위에서부터 공개 상점에 보이는 순서예요`}
          empty={<Card><EmptyState icon="search" title="찾는 상품이 없어요" description="다른 이름이나 카테고리로 찾아보세요." /></Card>}
        />
      </div>
    </>
  );
}

export default ProductList;
