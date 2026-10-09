import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';

jest.mock('../../../utils/api', () => ({ fetchWithAuth: jest.fn() }));

import { fetchWithAuth } from '../../../utils/api';
import ParentShop, { returnPathFrom, shopPath } from '../ParentShop';

const respond = (status, body) => Promise.resolve({ ok: status >= 200 && status < 300, status, json: () => Promise.resolve(body) });

const SHOP_A = { publicId: 'pubA', title: '이재림 선생님 추천 상품', teacherName: '이재림' };
const SHOP_B = { publicId: 'pubB', title: '박선생 추천 상품', teacherName: '박선생' };

let currentLocation;
function LocationProbe() {
  currentLocation = useLocation();
  return null;
}

/** 탭을 누른 것처럼 연다 — ParentLayout 의 탭이 지금 화면을 state.backTo 로 넘긴다 */
const renderTab = async (shops, entryState = { backTo: '/parent/photos' }) => {
  fetchWithAuth.mockImplementation(() => (shops instanceof Error ? Promise.reject(shops) : respond(200, { shops })));
  await act(async () => {
    render(
      <MemoryRouter initialEntries={['/parent/photos', { pathname: '/parent/shop', state: entryState }]} initialIndex={1}>
        <Routes>
          <Route path="/parent/shop" element={<><ParentShop /><LocationProbe /></>} />
          <Route path="/parent/photos" element={<><div>사진 탭</div><LocationProbe /></>} />
          <Route path="/shop/:publicId" element={<><div>공개 상점 화면</div><LocationProbe /></>} />
        </Routes>
      </MemoryRouter>
    );
  });
};

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

describe('ParentShop — 추천 상품 탭', () => {
  it('연결된 선생님의 상점 목록을 학부모 API 로 묻는다', async () => {
    await renderTab([SHOP_A]);
    expect(fetchWithAuth).toHaveBeenCalledWith('/api/parent/shops');
  });

  it('상점이 하나면 공유 링크와 같은 /shop/:publicId 전체 화면으로 바로 간다 — 돌아갈 곳은 탭 전 화면', async () => {
    await renderTab([SHOP_A]);

    expect(screen.getByText('공개 상점 화면')).toBeInTheDocument();
    expect(currentLocation.pathname).toBe('/shop/pubA');
    expect(currentLocation.search).toBe('');
    expect(currentLocation.state).toEqual({ backTo: '/parent/photos' });
  });

  it('여러 선생님이 상점을 열었으면 고르게 하고, 고른 상점의 [돌아가기] 는 이 목록으로 온다', async () => {
    await renderTab([SHOP_A, SHOP_B]);

    expect(screen.getByRole('heading', { level: 1, name: '추천 상품' })).toBeInTheDocument();
    expect(screen.getByText('이재림 선생님')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /박선생 추천 상품/ }));

    expect(currentLocation.pathname).toBe('/shop/pubB');
    expect(currentLocation.state).toEqual({ backTo: '/parent/shop' });
  });

  it('상점이 없으면 탭 안에 안내만 — 아래 탭 바는 그대로다', async () => {
    await renderTab([]);

    expect(screen.getByText('아직 추천 상품이 없어요')).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: '학부모 메뉴' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '추천 상품' })).toHaveAttribute('aria-current', 'page');
  });

  it('불러오지 못하면 [다시 시도]', async () => {
    await renderTab(new Error('offline'));
    expect(screen.getByText('추천 상품을 불러오지 못했어요')).toBeInTheDocument();

    fetchWithAuth.mockImplementation(() => respond(200, { shops: [SHOP_A] }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '다시 시도' }));
    });
    expect(currentLocation.pathname).toBe('/shop/pubA');
  });
});

describe('returnPathFrom — 상점 화면의 [돌아가기] 가 갈 곳', () => {
  it('탭 전 학부모 화면 (쿼리 포함)', () => {
    expect(returnPathFrom({ backTo: '/parent/photos/12' })).toBe('/parent/photos/12');
    expect(returnPathFrom({ backTo: '/parent/schedule?past=1' })).toBe('/parent/schedule?past=1');
  });

  it('주소로 바로 들어왔거나, 학부모 화면이 아니거나, 이 탭 자신이면 일정', () => {
    expect(returnPathFrom(null)).toBe('/parent/schedule');
    expect(returnPathFrom({})).toBe('/parent/schedule');
    expect(returnPathFrom({ backTo: '/students' })).toBe('/parent/schedule');
    expect(returnPathFrom({ backTo: 'https://evil.example/parent/' })).toBe('/parent/schedule');
    // 상점이 하나면 이 탭은 곧장 상점으로 가므로, 여기로 돌아오면 다시 상점으로 튕긴다
    expect(returnPathFrom({ backTo: '/parent/shop' })).toBe('/parent/schedule');
  });

  it('공개 id 는 주소에 안전하게 싣는다', () => {
    expect(shopPath('ab_C-1')).toBe('/shop/ab_C-1');
    expect(shopPath('a/b')).toBe('/shop/a%2Fb');
  });
});
