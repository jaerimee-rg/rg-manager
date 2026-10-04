import React from 'react';
import { render, screen, act, fireEvent, within } from '@testing-library/react';

jest.mock('../../../utils/api', () => ({ fetchWithAuth: jest.fn() }));

import { fetchWithAuth } from '../../../utils/api';
import ShopReservations from '../ShopReservations';

const RESERVATIONS = [
  {
    id: 3, productId: 21, productTitle: '레오타드 맞춤', imageUrl: 'https://cdn/l.jpg', name: '예림엄마', phone: '010-1234-5678',
    reservedDate: '2026-10-10', status: 'requested', createdAt: new Date(2026, 9, 4, 9, 5).toISOString(), updatedAt: 'x'
  },
  {
    id: 2, productId: null, productTitle: '지운 상품', imageUrl: null, name: '김지우', phone: '02-123-4567',
    reservedDate: '2026-10-12', status: 'confirmed', createdAt: new Date(2026, 9, 3, 18, 30).toISOString(), updatedAt: 'x'
  },
  {
    id: 1, productId: 21, productTitle: '레오타드 맞춤', imageUrl: null, name: '박서연', phone: '010-9999-0000',
    reservedDate: '2026-10-11', status: 'cancelled', createdAt: new Date(2026, 9, 2, 8, 0).toISOString(), updatedAt: 'x'
  }
];

const respond = (status, body) => Promise.resolve({ ok: status < 300, status, json: () => Promise.resolve(body) });

const renderTab = async (reservations = RESERVATIONS, patch) => {
  fetchWithAuth.mockImplementation((url, options = {}) => {
    if (options.method === 'PATCH') {
      if (patch) return patch(url, options);
      const id = Number(url.split('/')[4]);
      const { status } = JSON.parse(options.body);
      return respond(200, { reservation: { ...reservations.find((r) => r.id === id), status } });
    }
    return respond(200, { reservations });
  });
  const onRequestedChange = jest.fn();
  const showToast = jest.fn();
  await act(async () => {
    render(<ShopReservations onRequestedChange={onRequestedChange} showToast={showToast} />);
  });
  return { onRequestedChange, showToast };
};

const rowOf = (name) => screen.getByText(name).closest('tr');
const statusButton = (name, label) => within(rowOf(name)).getByRole('button', { name: label });

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

describe('ShopReservations — 예약 탭', () => {
  it('예약을 읽어 날짜·상품·이름·전화(누르면 전화)·요청 시각·상태를 보여 준다', async () => {
    const { onRequestedChange } = await renderTab();

    expect(fetchWithAuth).toHaveBeenCalledWith('/api/shop/reservations');
    const row = rowOf('예림엄마');
    expect(within(row).getByText('10월 10일 (토)')).toBeInTheDocument();
    expect(within(row).getByText('레오타드 맞춤')).toBeInTheDocument();
    expect(within(row).getByRole('link', { name: '010-1234-5678' })).toHaveAttribute('href', 'tel:01012345678');
    expect(within(row).getByText('10/4 09:05')).toBeInTheDocument();
    expect(statusButton('예림엄마', '요청')).toHaveAttribute('aria-pressed', 'true');
    expect(within(rowOf('김지우')).getByText('삭제된 상품')).toBeInTheDocument();
    expect(onRequestedChange).toHaveBeenLastCalledWith(1);
  });

  it('상태 칩에 개수가 붙고, 고른 상태만 보인다', async () => {
    await renderTab();
    const toolbar = screen.getByRole('toolbar', { name: '예약 상태' });
    expect(within(toolbar).getByRole('button', { name: '전체 3' })).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(within(toolbar).getByRole('button', { name: '확정 1' }));
    expect(screen.getByText('김지우')).toBeInTheDocument();
    expect(screen.queryByText('예림엄마')).not.toBeInTheDocument();
  });

  it('[확정] 을 누르면 바로 바꾸고 저장한 뒤 알려 준다 — 탭 숫자도 줄어든다', async () => {
    const { onRequestedChange, showToast } = await renderTab();
    await act(async () => {
      fireEvent.click(statusButton('예림엄마', '확정'));
    });

    expect(fetchWithAuth).toHaveBeenCalledWith('/api/shop/reservations/3/status', {
      method: 'PATCH',
      body: JSON.stringify({ status: 'confirmed' })
    });
    expect(statusButton('예림엄마', '확정')).toHaveAttribute('aria-pressed', 'true');
    expect(showToast).toHaveBeenCalledWith('예약을 확정했어요 · 학부모께 연락해 주세요');
    expect(onRequestedChange).toHaveBeenLastCalledWith(0);
  });

  it('취소한 예약도 다시 요청·확정으로 되돌릴 수 있다', async () => {
    const { showToast } = await renderTab();
    expect(rowOf('박서연')).toHaveAttribute('data-status', 'cancelled');
    await act(async () => {
      fireEvent.click(statusButton('박서연', '요청'));
    });
    expect(rowOf('박서연')).toHaveAttribute('data-status', 'requested');
    expect(showToast).toHaveBeenCalledWith('요청 상태로 되돌렸어요');
  });

  it('저장이 실패하면 그 행만 되돌리고 알려 준다', async () => {
    const { showToast } = await renderTab(RESERVATIONS, () => respond(500, { error: 'x' }));
    await act(async () => {
      fireEvent.click(statusButton('예림엄마', '취소'));
    });
    expect(statusButton('예림엄마', '요청')).toHaveAttribute('aria-pressed', 'true');
    expect(showToast).toHaveBeenCalledWith('상태를 바꾸지 못했어요');
  });

  it('지금 상태를 다시 누르면 아무것도 하지 않는다', async () => {
    await renderTab();
    await act(async () => {
      fireEvent.click(statusButton('예림엄마', '요청'));
    });
    expect(fetchWithAuth).toHaveBeenCalledTimes(1);
  });

  it('예약이 없으면 예약 받기를 켜는 법을 알려 준다', async () => {
    await renderTab([]);
    expect(screen.getByText('아직 예약 요청이 없어요')).toBeInTheDocument();
    expect(screen.getByText(/‘예약 받기’를 켜면/)).toBeInTheDocument();
  });

  it('불러오기에 실패하면 다시 시도할 수 있다', async () => {
    fetchWithAuth.mockImplementationOnce(() => respond(500, {}));
    fetchWithAuth.mockImplementation(() => respond(200, { reservations: RESERVATIONS }));
    await act(async () => {
      render(<ShopReservations />);
    });
    expect(screen.getByText(/예약을 불러오지 못했어요/)).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '다시 시도' }));
    });
    expect(screen.getByText('예림엄마')).toBeInTheDocument();
  });
});
