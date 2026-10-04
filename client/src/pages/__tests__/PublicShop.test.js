import React from 'react';
import { render, screen, act, fireEvent, within } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';

jest.mock('../../utils/shopTracking', () => ({
  trackClick: jest.fn(),
  trackViewOnce: jest.fn()
}));

import { trackClick, trackViewOnce } from '../../utils/shopTracking';
import PublicShop from '../PublicShop';

const DATA = {
  shop: { title: '이재림 선생님 추천 상품', intro: '수업에서 쓰는 용품이에요.\n사이즈는 문의 주세요.', notice: '쿠팡 파트너스 고지' },
  categories: [{ id: 1, name: '발레복' }, { id: 3, name: '기구' }],
  products: [
    { id: 12, title: '사사키 리본 6m', url: 'https://www.coupang.com/vp/products/1', imageUrl: 'https://cdn/r.jpg', price: 32000, categoryId: 3 },
    { id: 9, title: '연습용 발레복', url: 'https://musinsa.com/9', imageUrl: null, price: null, categoryId: 1 },
    { id: 5, title: '곤봉', url: null, imageUrl: null, price: null, categoryId: 3 },
    { id: 4, title: '위험한 링크', url: 'javascript:alert(1)', imageUrl: null, price: 1000, categoryId: null }
  ]
};

const respond = (status, body) => Promise.resolve({ ok: status >= 200 && status < 300, status, json: () => Promise.resolve(body) });

let currentLocation;
function LocationProbe() {
  currentLocation = useLocation();
  return null;
}

const renderShop = async (path = '/shop/pub123') => {
  await act(async () => {
    render(
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/shop/:publicId" element={<><PublicShop /><LocationProbe /></>} />
        </Routes>
      </MemoryRouter>
    );
  });
};

beforeEach(() => {
  jest.clearAllMocks();
  global.fetch = jest.fn(() => respond(200, DATA));
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

describe('PublicShop — 로그인 없이 보는 추천 상품', () => {
  it('토큰 없이 공개 API 를 부르고, 상점 이름·소개·안내문을 보여 준다', async () => {
    await renderShop();

    expect(global.fetch).toHaveBeenCalledWith('/api/shop/public/pub123');
    expect(screen.getByRole('heading', { name: '이재림 선생님 추천 상품' })).toBeInTheDocument();
    expect(screen.getByText(/수업에서 쓰는 용품이에요/)).toBeInTheDocument();
    expect(screen.getByText('쿠팡 파트너스 고지')).toBeInTheDocument();
    expect(document.title).toBe('이재림 선생님 추천 상품');
    expect(trackViewOnce).toHaveBeenCalledWith('pub123');
  });

  it('링크 있는 카드는 새 창 링크, 가격·도메인을 보여 준다', async () => {
    await renderShop();

    const link = screen.getByRole('link', { name: '사사키 리본 6m (새 창에서 열림)' });
    expect(link).toHaveAttribute('href', 'https://www.coupang.com/vp/products/1');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    expect(within(link).getByText('32,000원')).toBeInTheDocument();
    expect(within(link).getByText('coupang.com')).toBeInTheDocument();
  });

  it('링크 없는 카드·http(s) 가 아닌 주소는 누를 수 없는 카드로 그린다 (FR-462)', async () => {
    await renderShop();

    expect(screen.getByText('곤봉').closest('a')).toBeNull();
    expect(screen.getByText('위험한 링크').closest('a')).toBeNull();
    expect(screen.getAllByRole('link')).toHaveLength(2);
  });

  it('카드를 누르면 클릭을 기록한다 (이동은 막지 않는다)', async () => {
    await renderShop();
    const link = screen.getByRole('link', { name: /사사키 리본/ });
    const event = new MouseEvent('click', { bubbles: true, cancelable: true });
    link.dispatchEvent(event);
    expect(trackClick).toHaveBeenCalledWith('pub123', 12);
  });

  it('가운데 버튼으로 새 탭에 열어도 센다 (auxclick)', async () => {
    await renderShop();
    const link = screen.getByRole('link', { name: /사사키 리본/ });
    link.dispatchEvent(new MouseEvent('auxclick', { bubbles: true, button: 1 }));
    expect(trackClick).toHaveBeenCalledWith('pub123', 12);
  });

  it('카테고리 칩은 주소의 ?c= 에 남고, 그 카테고리만 보인다 (FR-431)', async () => {
    await renderShop();
    fireEvent.click(screen.getByRole('button', { name: '기구' }));

    expect(currentLocation.search).toBe('?c=3');
    expect(screen.getByText('사사키 리본 6m')).toBeInTheDocument();
    expect(screen.getByText('곤봉')).toBeInTheDocument();
    expect(screen.queryByText('연습용 발레복')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '전체' }));
    expect(currentLocation.search).toBe('');
    expect(screen.getByText('연습용 발레복')).toBeInTheDocument();
  });

  it('주소에 ?c= 가 있으면 그 칩으로 열린다', async () => {
    await renderShop('/shop/pub123?c=1');
    expect(screen.getByRole('button', { name: '발레복' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByText('사사키 리본 6m')).not.toBeInTheDocument();
  });

  it('없는 카테고리 ?c= 는 전체로 본다', async () => {
    await renderShop('/shop/pub123?c=999');
    expect(screen.getByRole('button', { name: '전체' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('비공개·없는 링크(404)는 같은 안내 화면', async () => {
    global.fetch.mockImplementation(() => respond(404, { error: '페이지를 찾을 수 없습니다.' }));
    await renderShop();
    expect(screen.getByText('지금은 볼 수 없는 페이지예요')).toBeInTheDocument();
    expect(trackViewOnce).not.toHaveBeenCalled();
  });

  it('네트워크 오류면 [다시 시도] 로 다시 부른다', async () => {
    global.fetch.mockImplementationOnce(() => Promise.reject(new Error('offline')));
    await renderShop();
    expect(screen.getByText('상품을 불러오지 못했어요')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '다시 시도' }));
    });
    expect(screen.getByText('사사키 리본 6m')).toBeInTheDocument();
  });

  it('상품이 없으면 빈 상태', async () => {
    global.fetch.mockImplementation(() => respond(200, { ...DATA, categories: [], products: [] }));
    await renderShop();
    expect(screen.getByText('아직 등록된 상품이 없어요')).toBeInTheDocument();
  });
});
