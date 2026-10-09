import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Button, Card, Chip, EmptyState, Icon, Skeleton, Toolbar } from '../components/ui';
import ProductCard from '../components/shop/ProductCard';
import ProductDetail from '../components/shop/ProductDetail';
import { trackClick, trackViewOnce } from '../utils/shopTracking';

/**
 * 공개 추천 상품 /shop/:publicId (docs/recommended-shop).
 * 로그인 없이 열리는 단독 화면 — 앱 헤더·학부모 하단 탭이 없고, 로그인한 사람이 열어도 같다(FR-404).
 * 학부모 앱의 [추천 상품] 탭도 이 화면을 연다. 그때만 돌아갈 학부모 화면을 기록 state(backTo)로 받아
 * 제목 위에 [돌아가기]를 붙인다 — 주소에는 싣지 않으므로 공유 링크는 그대로다.
 */
function PublicShop() {
  const { publicId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [state, setState] = useState({ status: 'loading' });

  // 학부모 화면으로만 돌아간다. 카테고리를 바꾸거나 상세를 여닫아도 잃지 않게 이동마다 같이 싣는다(carry)
  const backTo = typeof location.state?.backTo === 'string' && location.state.backTo.startsWith('/parent/')
    ? location.state.backTo
    : null;
  const carry = backTo ? { backTo } : undefined;
  const backLink = backTo && (
    <button type="button" className="ui-page-header__back" onClick={() => navigate(backTo)}>
      <Icon name="arrowLeft" size={16} />
      돌아가기
    </button>
  );

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
            action={closed && !backTo ? null : (
              <>
                {!closed && <Button icon="refresh" onClick={load}>다시 시도</Button>}
                {backTo && <Button icon="arrowLeft" onClick={() => navigate(backTo)}>돌아가기</Button>}
              </>
            )}
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
              {backLink}
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
    setSearchParams(next, { replace: true, state: carry });
  };

  // 상품 상세는 주소의 ?p= — 뒤로 가기로 닫히고, 그 주소를 보내면 상세가 바로 열린다
  const detailSearch = (productId) => {
    const next = new URLSearchParams(searchParams);
    next.set('p', String(productId));
    return `?${next.toString()}`;
  };
  const openedId = Number(searchParams.get('p'));
  const opened = products.find((p) => p.id === openedId) || null;
  const closeDetail = () => {
    // 카드를 눌러 열었으면 그 기록을 되돌리고, 링크로 바로 들어왔으면 주소에서 ?p= 만 뺀다
    if (location.state?.shopDetail) {
      navigate(-1);
      return;
    }
    const next = new URLSearchParams(searchParams);
    next.delete('p');
    setSearchParams(next, { replace: true, state: carry });
  };
  // 목록에서 상품을 누른 것이 클릭이다(FR-440). 그렇게 연 상세의 쇼핑몰 버튼은 같은 클릭이라 다시 세지 않고,
  // 공유된 ?p= 주소로 바로 들어온 상세에서만 쇼핑몰 버튼을 센다
  const countClick = (product) => trackClick(publicId, product.id);
  const countLinkClick = (product) => {
    if (!location.state?.shopDetail) countClick(product);
  };

  return (
    <div className="shop-public">
      <header className="shop-public__header">
        <div className="shop-public__inner">
          <div className="ui-page-header">
            {backLink}
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
                    to={detailSearch(product.id)}
                    state={{ ...carry, shopDetail: true }}
                    onOpen={countClick}
                  />
                ))}
              </div>
            </>
          )}
          {shop.notice && <p className="shop-public__foot">{shop.notice}</p>}
        </div>
      </main>

      {opened && (
        <ProductDetail
          key={opened.id}
          product={opened}
          categoryName={names.get(opened.categoryId)}
          publicId={publicId}
          onClose={closeDetail}
          onOpenLink={countLinkClick}
        />
      )}
    </div>
  );
}

export default PublicShop;
