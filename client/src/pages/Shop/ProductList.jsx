import React, { useMemo, useState } from 'react';
import { filterByCategory, formatPrice, hostnameOf, matchProductTitle } from '../../utils/shopFormat';
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
        </div>
        <div className="ui-list-row__subtitle">{subtitle}</div>
      </div>
    </div>
  );
}

const subtitleOf = (product) =>
  hostnameOf(product.url) || <span className="ui-text-subtle">링크 없음 — 누를 수 없는 카드</span>;

/**
 * 상품 탭 — 검색 + 카테고리 칩 + DataTable (데스크탑 표 / 모바일 카드는 CSS 가 정한다).
 * 표 순서가 곧 공개 상점 순서다. 걸러 보는 중에는 순서를 바꾸지 않는다(옆 칸이 숨어 있어 헷갈린다).
 */
function ProductList({ products, categories, onCreate, onEdit, onDelete, onToggle, onMove }) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState(null);

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

  const columns = [
    {
      key: 'order',
      header: '순서',
      width: '84px',
      render: (product) => {
        const index = products.findIndex((p) => p.id === product.id);
        return (
          <div className="shop-order">
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
      render: (product) => (product.url ? product.clickCount || 0 : <span className="ui-text-subtle">—</span>)
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

      <DataTable
        columns={columns}
        rows={rows}
        caption={filtering
          ? `${rows.length}개 보는 중 — 순서는 검색·필터를 풀면 바꿀 수 있어요`
          : `전체 ${products.length}개 · 공개 ${visibleCount}개 — 위에서부터 공개 상점에 보이는 순서예요`}
        empty={<Card><EmptyState icon="search" title="찾는 상품이 없어요" description="다른 이름이나 카테고리로 찾아보세요." /></Card>}
      />
    </>
  );
}

export default ProductList;
