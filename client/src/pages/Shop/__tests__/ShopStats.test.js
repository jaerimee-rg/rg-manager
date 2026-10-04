import React from 'react';
import { render, screen, act, fireEvent, within } from '@testing-library/react';

jest.mock('../../../utils/api', () => ({ fetchWithAuth: jest.fn() }));

import { fetchWithAuth } from '../../../utils/api';
import ShopStats from '../ShopStats';

const STATS = {
  range: '30',
  since: '2026-09-04T03:00:00.000Z',
  summary: { views: 124, visitors: 41, clicks: 96, clickVisitors: 29 },
  products: [
    { rank: 1, id: 12, title: '사사키 리본', categoryName: '기구', hasUrl: true, isVisible: true, clicks: 31, visitors: 18, lastClickedAt: '2026-10-03T11:20:00.000Z' },
    { rank: 2, id: 8, title: '스타킹', categoryName: '카테고리 없음', hasUrl: true, isVisible: false, clicks: 9, visitors: 6, lastClickedAt: null },
    { rank: 3, id: 6, title: '연습용 볼', categoryName: '기구', hasUrl: true, isVisible: true, clicks: 0, visitors: 0, lastClickedAt: null },
    { rank: null, id: 5, title: '곤봉', categoryName: '기구', hasUrl: false, isVisible: true, clicks: 0, visitors: 0, lastClickedAt: null }
  ],
  categories: [{ id: 3, name: '기구', clicks: 31 }, { id: null, name: '카테고리 없음', clicks: 9 }]
};

const respond = (body) => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) });

const renderStats = async (data = STATS) => {
  fetchWithAuth.mockImplementation(() => respond(data));
  const onCopyLink = jest.fn();
  await act(async () => {
    render(<ShopStats onCopyLink={onCopyLink} />);
  });
  return { onCopyLink };
};

beforeEach(() => jest.clearAllMocks());

describe('ShopStats (FR-450~455)', () => {
  it('기본 30일로 불러와 요약 4개를 보여 준다', async () => {
    await renderStats();
    expect(fetchWithAuth).toHaveBeenCalledWith('/api/shop/stats?days=30');
    expect(screen.getByText('상점 방문').closest('.ui-stat')).toHaveTextContent('124');
    expect(screen.getByText('클릭한 방문자', { selector: '.ui-stat__label' }).closest('.ui-stat')).toHaveTextContent('방문자의 71%');
    expect(screen.getByText(/9월 4일부터/)).toBeInTheDocument();
  });

  it('방문은 상점 페이지, 클릭은 구매 링크라고 구분해 적는다 — "링크를 연 횟수" 가 클릭 합계로 읽혔다', async () => {
    await renderStats();
    const tile = (label) => screen.getByText(label, { selector: '.ui-stat__label' }).closest('.ui-stat');

    expect(tile('상점 방문')).toHaveTextContent('상점 페이지를 연 횟수');
    expect(tile('상품 클릭')).toHaveTextContent('구매 링크를 누른 횟수');
    expect(screen.queryByText('링크를 연 횟수')).not.toBeInTheDocument();
  });

  it('기간을 바꾸면 다시 부른다', async () => {
    await renderStats();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '최근 7일' }));
    });
    expect(fetchWithAuth).toHaveBeenLastCalledWith('/api/shop/stats?days=7');
  });

  it('순위 표 — 클릭 0 상품도, 숨김 배지도, 링크 없는 상품은 순위 없이', async () => {
    await renderStats();
    const row = (title) => screen.getByText(title).closest('tr');

    expect(within(row('사사키 리본')).getByText('10/3 20:20')).toBeInTheDocument();
    expect(within(row('스타킹')).getByText('숨김')).toBeInTheDocument();
    expect(within(row('연습용 볼')).getByText('0', { selector: 'b' })).toBeInTheDocument();
    expect(within(row('곤봉')).getByText('링크 없음')).toBeInTheDocument();
    expect(within(row('곤봉')).queryByRole('progressbar')).not.toBeInTheDocument();
  });

  it('카테고리별 클릭 막대', async () => {
    await renderStats();
    expect(screen.getByRole('progressbar', { name: '기구 클릭' })).toHaveAttribute('aria-valuenow', '31');
    expect(screen.getByRole('progressbar', { name: '카테고리 없음 클릭' })).toBeInTheDocument();
  });

  it('기록이 없으면 링크를 보내 보라고 안내한다 (FR-454)', async () => {
    const { onCopyLink } = await renderStats({
      ...STATS,
      summary: { views: 0, visitors: 0, clicks: 0, clickVisitors: 0 }
    });
    expect(screen.getByText('아직 기록이 없어요')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '링크 복사' }));
    expect(onCopyLink).toHaveBeenCalled();
  });
});
