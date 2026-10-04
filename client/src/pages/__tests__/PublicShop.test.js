import React from 'react';
import { render, screen, act, fireEvent, within, cleanup } from '@testing-library/react';
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
    {
      id: 12, title: '사사키 리본 6m', description: '6m 새틴 리본\n막대 포함', url: 'https://www.coupang.com/vp/products/1',
      images: ['https://cdn/r1.jpg', 'https://cdn/r2.jpg', 'https://cdn/r3.jpg'], price: 32000, categoryId: 3
    },
    { id: 9, title: '연습용 발레복', description: null, url: 'https://musinsa.com/9', images: [], price: null, categoryId: 1 },
    { id: 5, title: '곤봉', description: '수업 때 보여 드릴게요', url: null, images: ['https://cdn/c.jpg'], price: null, categoryId: 3 },
    { id: 4, title: '위험한 링크', description: null, url: 'javascript:alert(1)', images: [], price: 1000, categoryId: null }
  ]
};

const respond = (status, body) => Promise.resolve({ ok: status >= 200 && status < 300, status, json: () => Promise.resolve(body) });

let currentLocation;
function LocationProbe() {
  currentLocation = useLocation();
  return null;
}

const cleanupAll = () => cleanup();

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

  it('카드는 대표 사진·사진 수·제목 아래 설명·가격·도메인을 보여 주고, 누르면 상세 주소(?p=)로 간다', async () => {
    await renderShop();

    const card = screen.getByRole('link', { name: '사사키 리본 6m 자세히 보기' });
    expect(card).toHaveAttribute('href', '/shop/pub123?p=12');
    expect(card).not.toHaveAttribute('target');
    expect(card.querySelector('img')).toHaveAttribute('src', 'https://cdn/r1.jpg');
    expect(within(card).getByLabelText('사진 3장')).toBeInTheDocument();
    expect(within(card).getByText(/6m 새틴 리본/)).toBeInTheDocument();
    expect(within(card).getByText('32,000원')).toBeInTheDocument();
    expect(within(card).getByText('coupang.com')).toBeInTheDocument();
  });

  it('사진도 링크도 없으면 누를 수 없는 카드 — http(s) 가 아닌 주소는 링크로 치지 않는다 (FR-462)', async () => {
    await renderShop();

    expect(screen.getByText('위험한 링크').closest('a')).toBeNull();
    // 링크는 없지만 사진이 있는 곤봉은 사진을 보려고 상세가 열린다
    expect(screen.getByRole('link', { name: '곤봉 자세히 보기' })).toBeInTheDocument();
    expect(screen.getAllByRole('link')).toHaveLength(3);
  });

  it('카드를 누르면 상세가 열리고, 카드 클릭은 통계로 세지 않는다', async () => {
    await renderShop();
    fireEvent.click(screen.getByRole('link', { name: '사사키 리본 6m 자세히 보기' }));

    expect(currentLocation.search).toBe('?p=12');
    const dialog = screen.getByRole('dialog', { name: '사사키 리본 6m' });
    expect(within(dialog).getByText('6m 새틴 리본\n막대 포함', { normalizer: (t) => t })).toBeInTheDocument();
    expect(within(dialog).getByText('1 / 3')).toBeInTheDocument();
    expect(trackClick).not.toHaveBeenCalled();
  });

  it('상세의 [쇼핑몰에서 보기] 는 새 창 링크이고, 누르면 클릭을 기록한다 (가운데 버튼도)', async () => {
    await renderShop('/shop/pub123?p=12');
    const button = screen.getByRole('link', { name: 'coupang.com에서 보기' });
    expect(button).toHaveAttribute('href', 'https://www.coupang.com/vp/products/1');
    expect(button).toHaveAttribute('target', '_blank');
    expect(button).toHaveAttribute('rel', 'noopener noreferrer');

    button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(trackClick).toHaveBeenCalledWith('pub123', 12);

    button.dispatchEvent(new MouseEvent('auxclick', { bubbles: true, button: 1 }));
    expect(trackClick).toHaveBeenCalledTimes(2);
  });

  it('작은 사진·점을 누르면 그 사진으로 바뀌고, ←/→ 키로도 넘긴다', async () => {
    await renderShop('/shop/pub123?p=12');
    const dialog = screen.getByRole('dialog');

    fireEvent.click(within(dialog).getByRole('button', { name: '3번째 사진 보기' }));
    expect(within(dialog).getByText('3 / 3')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: '3번째 사진 보기' })).toHaveAttribute('aria-current', 'true');
    expect(within(dialog).getByRole('button', { name: '다음 사진' })).toBeDisabled();

    fireEvent.keyDown(document, { key: 'ArrowLeft' });
    expect(within(dialog).getByText('2 / 3')).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole('button', { name: '1번째 사진' }));
    expect(within(dialog).getByText('1 / 3')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: '이전 사진' })).toBeDisabled();
  });

  it('주소로 바로 들어온 상세는 닫으면 ?p= 만 빠지고 상점이 남는다', async () => {
    await renderShop('/shop/pub123?c=3&p=5');
    expect(screen.getByRole('dialog', { name: '곤봉' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /에서 보기/ })).not.toBeInTheDocument();
    expect(screen.getByText(/쇼핑몰 링크가 없는 상품이에요/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '닫기' }));
    expect(currentLocation.search).toBe('?c=3');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('사진이 한 장이면 넘기기 표시가 없다 · 공개 목록에 없는 ?p= 는 무시한다', async () => {
    await renderShop('/shop/pub123?p=5');
    expect(screen.queryByText('1 / 1')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '다음 사진' })).not.toBeInTheDocument();
    cleanupAll();

    await renderShop('/shop/pub123?p=999');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
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
