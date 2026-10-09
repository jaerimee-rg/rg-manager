import React, { useCallback, useEffect, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import ParentLayout from '../../components/parent/ParentLayout';
import { Button, EmptyState, IconTile, List, ListRow, Spinner } from '../../components/ui';
import { fetchWithAuth } from '../../utils/api';

export const SHOP_TAB_PATH = '/parent/shop';
const HOME = '/parent/schedule';

/** 상점 화면의 [돌아가기]가 갈 곳 — 탭을 누르기 전 학부모 화면. 이 탭 자신이면 다시 상점으로 튕기므로 일정으로 */
export const returnPathFrom = (state) => {
  const backTo = state?.backTo;
  if (typeof backTo !== 'string' || !backTo.startsWith('/parent/') || backTo.startsWith(SHOP_TAB_PATH)) return HOME;
  return backTo;
};

export const shopPath = (publicId) => `/shop/${encodeURIComponent(publicId)}`;

/**
 * 추천 상품 탭 — 선생님이 보내는 공유 링크(/shop/:publicId)와 같은 전체 화면을 연다.
 * 상점이 하나면 곧장 그 화면으로 가고(이 주소는 기록에서 지워 뒤로 가기가 탭 전 화면으로 간다),
 * 여러 선생님이 상점을 열었으면 고르게 한다. 상점 화면은 backTo 를 받아 [돌아가기]를 붙인다.
 */
function ParentShop() {
  const location = useLocation();
  const navigate = useNavigate();
  const [state, setState] = useState({ status: 'loading' });

  const load = useCallback(async () => {
    setState({ status: 'loading' });
    try {
      const response = await fetchWithAuth('/api/parent/shops');
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      setState({ status: 'ready', shops: data.shops || [] });
    } catch (error) {
      console.error('추천 상품 목록 조회 실패:', error);
      setState({ status: 'error' });
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (state.status === 'ready' && state.shops.length === 1) {
    return <Navigate to={shopPath(state.shops[0].publicId)} replace state={{ backTo: returnPathFrom(location.state) }} />;
  }

  if (state.status === 'loading') {
    return (
      <ParentLayout title="추천 상품">
        <Spinner />
      </ParentLayout>
    );
  }

  if (state.status === 'error') {
    return (
      <ParentLayout title="추천 상품">
        <EmptyState
          icon="alert"
          title="추천 상품을 불러오지 못했어요"
          description="인터넷 연결을 확인하고 다시 시도해 주세요."
          action={<Button icon="refresh" onClick={load}>다시 시도</Button>}
        />
      </ParentLayout>
    );
  }

  if (!state.shops.length) {
    return (
      <ParentLayout title="추천 상품">
        <EmptyState
          icon="bag"
          title="아직 추천 상품이 없어요"
          description="선생님이 추천 상품을 올리면 여기에서 볼 수 있어요."
        />
      </ParentLayout>
    );
  }

  // 여러 선생님 — 고른 상점에서 [돌아가기]를 누르면 이 목록으로 온다
  return (
    <ParentLayout title="추천 상품" subtitle="선생님을 골라 주세요">
      <List aria-label="선생님별 추천 상품">
        {state.shops.map((shop) => (
          <ListRow
            key={shop.publicId}
            leading={<IconTile icon="bag" />}
            title={shop.title}
            subtitle={`${shop.teacherName} 선생님`}
            chevron
            onClick={() => navigate(shopPath(shop.publicId), { state: { backTo: SHOP_TAB_PATH } })}
          />
        ))}
      </List>
    </ParentLayout>
  );
}

export default ParentShop;
