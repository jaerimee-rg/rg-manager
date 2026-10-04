import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchWithAuth } from '../../utils/api';
import { copyToClipboard } from '../../utils/copyToClipboard';
import { moveItem } from '../../utils/reorder';
import { shopPublicUrl } from '../../utils/shopFormat';
import {
  Badge, Button, Callout, Card, ConfirmDialog, Input, PageHeader, Row, SkeletonList, Tabs, Toast
} from '../../components/ui';
import ProductList from './ProductList';
import ProductFormModal from './ProductFormModal';
import ShopStats from './ShopStats';
import ShopReservations from './ShopReservations';
import ShopSettings from './ShopSettings';

const TAB_PATHS = {
  products: '/products',
  reservations: '/products/reservations',
  stats: '/products/stats',
  settings: '/products/settings'
};

/**
 * 선생님 — 추천 상품 (docs/recommended-shop). 상품 · 예약 · 통계 · 설정 탭.
 * 상점은 처음 들어올 때 서버가 만든다(GET /api/shop). 공개 링크 카드는 탭과 상관없이 맨 위에 둔다.
 */
function ShopManager({ initialTab = 'products' }) {
  const navigate = useNavigate();
  const [tab, setTab] = useState(initialTab);
  const [shop, setShop] = useState(null);
  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);
  const [storageReady, setStorageReady] = useState(true);
  const [requestedReservations, setRequestedReservations] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState('');
  const toastTimer = useRef(null);

  const showToast = (message) => {
    setToast(message);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 2600);
  };
  useEffect(() => () => clearTimeout(toastTimer.current), []);

  useEffect(() => setTab(initialTab), [initialTab]);

  const loadShop = async () => {
    const response = await fetchWithAuth('/api/shop');
    if (!response.ok) throw new Error(`상점 조회 실패 (${response.status})`);
    const data = await response.json();
    setShop(data.shop);
    setCategories(data.categories || []);
    setStorageReady(data.storageReady !== false);
    setRequestedReservations(data.requestedReservations || 0);
  };

  const loadProducts = async () => {
    const response = await fetchWithAuth('/api/shop/products');
    if (!response.ok) throw new Error(`상품 조회 실패 (${response.status})`);
    const data = await response.json();
    setProducts(data.products || []);
  };

  const loadAll = async () => {
    try {
      // 상점을 먼저 — 첫 진입이면 여기서 상점과 기본 카테고리가 만들어진다
      await loadShop();
      await loadProducts();
      setLoadError(false);
    } catch (error) {
      console.error('추천 상품 불러오기 실패:', error);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  const changeTab = (next) => {
    setTab(next);
    navigate(TAB_PATHS[next]);
  };

  const publicUrl = shopPublicUrl(shop?.publicId);

  const copyLink = async () => {
    const ok = await copyToClipboard(publicUrl);
    showToast(ok ? '공개 링크를 복사했어요 · 학부모 단톡방에 붙여 넣으세요' : publicUrl);
  };

  // 카테고리별 상품 수가 바뀌므로 상점(카테고리)도 다시 읽는다
  const refreshCategories = () => loadShop().catch((error) => console.error('카테고리 갱신 실패:', error));

  const handleSaved = (product, { created, imageError }) => {
    setEditing(null);
    setProducts((list) => (created ? [product, ...list] : list.map((p) => (p.id === product.id ? product : p))));
    refreshCategories();
    showToast(imageError || (created ? '상품을 등록했어요' : '상품을 수정했어요'));
  };

  const toggleVisibility = async (product, isVisible) => {
    setProducts((list) => list.map((p) => (p.id === product.id ? { ...p, isVisible } : p)));
    try {
      const response = await fetchWithAuth(`/api/shop/products/${product.id}/visibility`, {
        method: 'PATCH',
        body: JSON.stringify({ isVisible })
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      showToast(isVisible ? '공개 상점에 보여요' : '공개 상점에서 숨겼어요 · 클릭 기록은 남아요');
    } catch (error) {
      console.error('공개 여부 변경 실패:', error);
      setProducts((list) => list.map((p) => (p.id === product.id ? { ...p, isVisible: !isVisible } : p)));
      showToast('공개 여부를 바꾸지 못했어요');
    }
  };

  // 끌어서 놓기·▲▼·↑↓ 모두 여기로 — 화면을 먼저 바꾸고, 저장이 실패하면 서버 순서로 되돌린다
  const reorder = async (from, to) => {
    const next = moveItem(products, from, to);
    if (next === products) return;
    setProducts(next);
    try {
      const response = await fetchWithAuth('/api/shop/products/order', {
        method: 'PUT',
        body: JSON.stringify({ ids: next.map((p) => p.id) })
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
    } catch (error) {
      console.error('순서 저장 실패:', error);
      showToast('순서를 저장하지 못했어요');
      loadProducts().catch(() => {});
    }
  };
  const move = (index, direction) => reorder(index, index + direction);

  const confirmDelete = async () => {
    if (!deleting) return;
    setBusy(true);
    try {
      const response = await fetchWithAuth(`/api/shop/products/${deleting.id}`, { method: 'DELETE' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      setProducts((list) => list.filter((p) => p.id !== deleting.id));
      refreshCategories();
      showToast('상품을 삭제했어요');
      setDeleting(null);
    } catch (error) {
      console.error('상품 삭제 실패:', error);
      showToast('삭제하지 못했어요');
    } finally {
      setBusy(false);
    }
  };

  const header = (
    <PageHeader
      title="추천 상품"
      description="학부모에게 권하는 상품을 등록하면, 로그인 없이 볼 수 있는 상점 페이지에 모여요."
      actions={tab === 'products' && shop ? (
        <Button variant="primary" icon="plus" onClick={() => setEditing({ product: null })}>상품</Button>
      ) : null}
    />
  );

  if (loading) {
    return (
      <>
        {header}
        <SkeletonList rows={3} />
      </>
    );
  }

  if (loadError || !shop) {
    return (
      <>
        {header}
        <Callout tone="danger">
          추천 상품을 불러오지 못했어요.{' '}
          <button type="button" className="ui-link" onClick={() => { setLoading(true); loadAll(); }}>다시 시도</button>
        </Callout>
      </>
    );
  }

  return (
    <>
      {header}

      <Card>
        <Row gap={2}>
          <h3 className="ui-card__title">공개 링크</h3>
          <Badge tone={shop.isActive ? 'success' : 'neutral'} dot>{shop.isActive ? '공개 중' : '비공개'}</Badge>
        </Row>
        <p className="ui-card__description">
          {shop.isActive
            ? '이 주소를 학부모 단톡방에 보내면 로그인 없이 상점을 볼 수 있어요.'
            : '지금은 비공개예요. 설정 탭에서 공개로 바꾸면 같은 링크가 다시 열려요.'}
        </p>
        <div className="shop-link">
          <Input readOnly value={publicUrl} aria-label="공개 링크" onFocus={(e) => e.target.select()} />
          <Button icon="link" onClick={copyLink}>링크 복사</Button>
          <Button as="a" variant="ghost" iconEnd="external" href={publicUrl} target="_blank" rel="noopener noreferrer">
            미리 보기
          </Button>
        </div>
      </Card>

      <Tabs
        style={{ marginTop: 'var(--space-5)' }}
        value={tab}
        onChange={changeTab}
        items={[
          { id: 'products', label: '상품', count: products.length },
          // 숫자는 아직 확정·취소하지 않은 요청만 — 없으면 붙이지 않는다
          { id: 'reservations', label: '예약', count: requestedReservations || undefined },
          { id: 'stats', label: '통계' },
          { id: 'settings', label: '설정' }
        ]}
      />

      {tab === 'products' && (
        <ProductList
          products={products}
          categories={categories}
          onCreate={() => setEditing({ product: null })}
          onEdit={(product) => setEditing({ product })}
          onDelete={setDeleting}
          onToggle={toggleVisibility}
          onMove={move}
          onReorder={reorder}
        />
      )}
      {tab === 'reservations' && (
        <ShopReservations onRequestedChange={setRequestedReservations} showToast={showToast} />
      )}
      {tab === 'stats' && <ShopStats onCopyLink={copyLink} />}
      {tab === 'settings' && (
        <ShopSettings
          shop={shop}
          categories={categories}
          onShopSaved={setShop}
          onCategoriesChanged={async () => {
            await refreshCategories();
            await loadProducts().catch(() => {});
          }}
          showToast={showToast}
        />
      )}

      {editing && (
        <ProductFormModal
          product={editing.product}
          categories={categories}
          storageReady={storageReady}
          onClose={() => setEditing(null)}
          onSaved={handleSaved}
          onManageCategories={() => {
            setEditing(null);
            changeTab('settings');
          }}
        />
      )}

      <ConfirmDialog
        open={Boolean(deleting)}
        title="상품을 삭제할까요?"
        message={deleting ? (
          <>
            ‘{deleting.title}’ 과 이 상품의 <b>클릭 기록 {deleting.clickCount || 0}건</b>이 함께 지워져요.
            <br />기록을 남기려면 삭제 대신 공개 스위치를 꺼서 숨기세요.
          </>
        ) : null}
        confirmLabel="삭제"
        tone="danger"
        busy={busy}
        onConfirm={confirmDelete}
        onCancel={() => setDeleting(null)}
      />

      <Toast>{toast}</Toast>
    </>
  );
}

export default ShopManager;
