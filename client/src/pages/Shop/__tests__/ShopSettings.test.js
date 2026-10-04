import React from 'react';
import { render, screen, act, fireEvent, within } from '@testing-library/react';

jest.mock('../../../utils/api', () => ({ fetchWithAuth: jest.fn() }));

import { fetchWithAuth } from '../../../utils/api';
import ShopSettings from '../ShopSettings';

const SHOP = { id: 1, publicId: 'pub', title: '이재림 선생님 추천 상품', intro: '소개', notice: null, isActive: true };
const CATEGORIES = [
  { id: 1, name: '발레복', productCount: 1 },
  { id: 3, name: '기구', productCount: 4 },
  { id: 5, name: '용품', productCount: 0 }
];

const respond = (status, body) => Promise.resolve({ ok: status < 300, status, json: () => Promise.resolve(body) });

const setup = () => {
  const props = {
    onShopSaved: jest.fn(),
    onCategoriesChanged: jest.fn(() => Promise.resolve()),
    showToast: jest.fn()
  };
  render(<ShopSettings shop={SHOP} categories={CATEGORIES} {...props} />);
  return props;
};

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

describe('ShopSettings — 상점 정보 (FR-402)', () => {
  it('이름이 비면 저장하지 않는다', async () => {
    setup();
    fireEvent.change(screen.getByLabelText(/상점 이름/), { target: { value: ' ' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '저장' }));
    });
    expect(screen.getByText('상점 이름을 입력해 주세요')).toBeInTheDocument();
    expect(fetchWithAuth).not.toHaveBeenCalled();
  });

  it('공개를 끄고 저장하면 PUT 하고 안내한다', async () => {
    fetchWithAuth.mockReturnValue(respond(200, { shop: { ...SHOP, isActive: false } }));
    const { onShopSaved, showToast } = setup();

    fireEvent.click(screen.getByRole('button', { name: '예시 문구 넣기' }));
    fireEvent.click(screen.getByRole('switch', { name: '상점 공개' }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '저장' }));
    });

    const body = JSON.parse(fetchWithAuth.mock.calls[0][1].body);
    expect(fetchWithAuth.mock.calls[0][0]).toBe('/api/shop');
    expect(body.isActive).toBe(false);
    expect(body.notice).toMatch(/쿠팡 파트너스/);
    expect(onShopSaved).toHaveBeenCalledWith({ ...SHOP, isActive: false });
    expect(showToast.mock.calls[0][0]).toMatch(/링크를 열어도 상점이 보이지 않아요/);
  });
});

describe('ShopSettings — 카테고리 (FR-421 · 422)', () => {
  it('추가 — 같은 이름이면 서버 안내를 그대로 보여 준다', async () => {
    fetchWithAuth.mockReturnValue(respond(409, { error: '같은 이름의 카테고리가 있어요.' }));
    const { onCategoriesChanged } = setup();
    fireEvent.change(screen.getByLabelText('새 카테고리 이름'), { target: { value: '기구' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '추가' }));
    });
    expect(fetchWithAuth).toHaveBeenCalledWith('/api/shop/categories', { method: 'POST', body: JSON.stringify({ name: '기구' }) });
    expect(screen.getByText('같은 이름의 카테고리가 있어요.')).toBeInTheDocument();
    expect(onCategoriesChanged).not.toHaveBeenCalled();
  });

  it('이름 바꾸기 — 행 안에서 고치고 저장', async () => {
    fetchWithAuth.mockReturnValue(respond(200, { category: { id: 5, name: '용품·가방' } }));
    const { onCategoriesChanged } = setup();
    fireEvent.click(screen.getByRole('button', { name: '용품 이름 바꾸기' }));
    fireEvent.change(screen.getByLabelText('카테고리 이름'), { target: { value: '용품·가방' } });
    await act(async () => {
      const row = screen.getByLabelText('카테고리 이름').closest('.ui-list-row');
      fireEvent.click(within(row).getByRole('button', { name: '저장' }));
    });
    expect(fetchWithAuth.mock.calls[0]).toEqual(['/api/shop/categories/5', { method: 'PUT', body: JSON.stringify({ name: '용품·가방' }) }]);
    expect(onCategoriesChanged).toHaveBeenCalled();
  });

  it('삭제 — 몇 개 상품이 카테고리 없음이 되는지 확인한다', async () => {
    fetchWithAuth.mockReturnValue(respond(200, { affectedProducts: 4 }));
    const { onCategoriesChanged, showToast } = setup();
    fireEvent.click(screen.getByRole('button', { name: '기구 삭제' }));

    const dialog = screen.getByRole('dialog', { name: '카테고리를 삭제할까요?' });
    expect(dialog).toHaveTextContent('상품 4개가 ‘카테고리 없음’이 돼요');
    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: '삭제' }));
    });
    expect(fetchWithAuth).toHaveBeenCalledWith('/api/shop/categories/3', { method: 'DELETE' });
    expect(onCategoriesChanged).toHaveBeenCalled();
    expect(showToast.mock.calls[0][0]).toMatch(/상품 4개/);
  });

  it('▲ 로 순서를 바꾸면 전체 순서를 저장한다', async () => {
    fetchWithAuth.mockReturnValue(respond(200, { ok: true }));
    setup();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '기구 위로' }));
    });
    expect(fetchWithAuth).toHaveBeenCalledWith('/api/shop/categories/order', { method: 'PUT', body: JSON.stringify({ ids: [3, 1, 5] }) });
  });
});
