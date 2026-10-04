import React, { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { Button, Card, Chip, EmptyState, Skeleton, Toolbar } from '../components/ui';
import ProductCard from '../components/shop/ProductCard';
import { trackClick, trackViewOnce } from '../utils/shopTracking';

/**
 * 공개 추천 상품 /shop/:publicId (docs/recommended-shop).
 * 로그인 없이 열리는 단독 화면 — 앱 헤더·학부모 하단 탭이 없고, 로그인한 사람이 열어도 같다(FR-404).
 */
function PublicShop() {
  const { publicId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const [state, setState] = useState({ status: 'loading' });

  const load = async () => {
    setState({ status: 'loading' });
    try {
      const response = await fetch(`/api/shop/public/${encodeURIComponent(publicId)}`);
      if (response.status === 404) {
        setState({ status: 'closed' });
        return;
      }
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      setState({ status: 'ready', ...data });
      trackViewOnce(publicId);
    } catch (error) {
      console.error('추천 상품 불러오기 실패:', error);
      setState({ status: 'error' });
    }
  };

  useEffect(() => {
    load();
  }, [publicId]);

  useEffect(() => {
    if (state.status === 'ready') document.title = state.shop.title;
  }, [state]);

  if (state.status === 'closed' || state.status === 'error') {
    const closed = state.status === 'closed';
    return (
      <div className="shop-public">
        <div className="shop-state">
          <EmptyState
            icon={closed ? 'link' : 'alert'}
            title={closed ? '지금은 볼 수 없는 페이지예요' : '상품을 불러오지 못했어요'}
            description={closed
              ? '링크가 바뀌었거나 선생님이 상점을 잠시 닫았어요. 링크를 보낸 선생님께 확인해 주세요.'
              : '인터넷 연결을 확인하고 다시 시도해 주세요.'}
            action={closed ? null : <Button icon="refresh" onClick={load}>다시 시도</Button>}
          />
        </div>
      </div>
    );
  }

  if (state.status === 'loading') {
    return (
      <div className="shop-public" aria-busy="true" aria-label="불러오는 중">
        <header className="shop-public__header">
          <div className="shop-public__inner">
            <div className="ui-page-header">
              <Skeleton width="58%" height={32} radius="var(--radius-sm)" />
              <Skeleton width="76%" height={14} />
            </div>
          </div>
        </header>
        <main className="shop-public__main">
          <div className="shop-public__inner">
            <div className="ui-toolbar" />
            <div className="shop-grid">
              {Array.from({ length: 8 }, (_, i) => (
                <Card padding="none" className="shop-product" key={i}>
                  <Skeleton height="auto" radius={0} style={{ aspectRatio: '1 / 1' }} />
                  <div className="shop-product__body">
                    <Skeleton width="36%" height={12} />
                    <Skeleton width="88%" height={14} style={{ marginTop: 6 }} />
                  </div>
                </Card>
              ))}
            </div>
          </div>
        </main>
      </div>
    );
  }

  const { shop, categories = [], products = [] } = state;
  const names = new Map(categories.map((c) => [c.id, c.name]));
  const requested = Number(searchParams.get('c'));
  const selected = names.has(requested) ? requested : null;
  const visible = selected == null ? products : products.filter((p) => p.categoryId === selected);

  // 칩은 주소의 ?c= 에 남겨 새로고침·공유해도 유지된다(FR-431)
  const choose = (categoryId) => {
    const next = new URLSearchParams(searchParams);
    if (categoryId == null) next.delete('c');
    else next.set('c', String(categoryId));
    setSearchParams(next, { replace: true });
  };

  return (
    <div className="shop-public">
      <header className="shop-public__header">
        <div className="shop-public__inner">
          <div className="ui-page-header">
            <div className="ui-page-header__top">
              <div>
                <h1 className="ui-page-header__title">{shop.title}</h1>
                {shop.intro && <p className="ui-page-header__description shop-public__intro">{shop.intro}</p>}
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="shop-public__main">
        <div className="shop-public__inner">
          {products.length === 0 ? (
            <Card style={{ marginTop: 'var(--space-3)' }}>
              <EmptyState icon="inbox" title="아직 등록된 상품이 없어요" description="선생님이 추천 상품을 올리면 여기에 모여요." />
            </Card>
          ) : (
            <>
              {categories.length > 0 && (
                <Toolbar aria-label="카테고리">
                  <Chip selected={selected == null} onClick={() => choose(null)}>전체</Chip>
                  {categories.map((c) => (
                    <Chip key={c.id} selected={selected === c.id} onClick={() => choose(c.id)}>{c.name}</Chip>
                  ))}
                </Toolbar>
              )}
              <div className="shop-grid" style={categories.length ? undefined : { marginTop: 'var(--space-4)' }}>
                {visible.map((product) => (
                  <ProductCard
                    key={product.id}
                    product={product}
                    categoryName={names.get(product.categoryId)}
                    onOpen={(p) => trackClick(publicId, p.id)}
                  />
                ))}
              </div>
            </>
          )}
          {shop.notice && <p className="shop-public__foot">{shop.notice}</p>}
        </div>
      </main>
    </div>
  );
}

export default PublicShop;
