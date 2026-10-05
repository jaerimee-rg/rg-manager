import React from 'react';
import { render, screen, act, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

jest.mock('../../../utils/api', () => ({ fetchWithAuth: jest.fn() }));
jest.mock('../../../utils/copyToClipboard', () => ({ copyToClipboard: jest.fn() }));

import { fetchWithAuth } from '../../../utils/api';
import { copyToClipboard } from '../../../utils/copyToClipboard';
import ShopManager from '../ShopManager';

const SHOP = { id: 1, publicId: 'pub123', title: '이재림 선생님 추천 상품', intro: null, notice: null, isActive: true };
const CATEGORIES = [
  { id: 1, name: '발레복', sortOrder: 0, productCount: 1 },
  { id: 3, name: '기구', sortOrder: 1, productCount: 1 }
];
const PRODUCTS = [
  { id: 12, title: '사사키 리본', url: 'https://www.coupang.com/x', price: 32000, categoryId: 3, imageUrl: null, isVisible: true, clickCount: 58 },
  { id: 9, title: '연습용 발레복', url: 'https://musinsa.com/9', price: null, categoryId: 1, imageUrl: null, isVisible: true, clickCount: 3 },
  { id: 5, title: '스타킹', url: null, price: 12000, categoryId: null, imageUrl: null, isVisible: false, clickCount: 0 }
];
const CLUBS = {
  id: 4, title: '곤봉', url: null, price: null, categoryId: 3, imageUrl: 'https://cdn/c1.jpg', isVisible: true, clickCount: 0,
  images: [{ id: 1, url: 'https://cdn/c1.jpg' }, { id: 2, url: 'https://cdn/c2.jpg' }]
};

const respond = (status, body) => Promise.resolve({ ok: status < 300, status, json: () => Promise.resolve(body) });

const route = (products = PRODUCTS, requestedReservations = 0) => (url, options = {}) => {
  const method = options.method || 'GET';
  if (url === '/api/shop' && method === 'GET') {
    return respond(200, { shop: SHOP, categories: CATEGORIES, storageReady: true, requestedReservations });
  }
  if (url === '/api/shop/reservations' && method === 'GET') return respond(200, { reservations: [] });
  if (url === '/api/shop/products' && method === 'GET') return respond(200, { products });
  return respond(200, { ok: true });
};

const renderManager = async (props = {}, products) => {
  fetchWithAuth.mockImplementation(route(products));
  await act(async () => {
    render(
      <MemoryRouter>
        <ShopManager {...props} />
      </MemoryRouter>
    );
  });
};

const rowOf = (title) => screen.getByText(title).closest('tr');

beforeEach(() => {
  jest.clearAllMocks();
  copyToClipboard.mockResolvedValue(true);
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

describe('ShopManager — 상품 탭', () => {
  it('상점(첫 진입이면 서버가 만든다)과 상품을 읽고, 공개 링크를 보여 준다', async () => {
    await renderManager();

    expect(fetchWithAuth.mock.calls.map((c) => c[0])).toEqual(['/api/shop', '/api/shop/products']);
    expect(screen.getByRole('heading', { name: '추천 상품' })).toBeInTheDocument();
    expect(screen.getByLabelText('공개 링크')).toHaveValue(`${window.location.origin}/shop/pub123`);
    expect(screen.getByRole('tab', { name: '상품 (3)' })).toHaveAttribute('aria-selected', 'true');
  });

  it('[링크 복사] 는 공개 주소를 클립보드에 넣는다', async () => {
    await renderManager();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '링크 복사' }));
    });
    expect(copyToClipboard).toHaveBeenCalledWith(`${window.location.origin}/shop/pub123`);
    expect(screen.getByRole('status')).toHaveTextContent('공개 링크를 복사했어요');
  });

  it('표에 가격·도메인·누적 클릭·숨김 상태가 보인다', async () => {
    await renderManager();
    const ribbon = rowOf('사사키 리본');
    expect(within(ribbon).getByText('32,000원')).toBeInTheDocument();
    expect(within(ribbon).getByText('coupang.com')).toBeInTheDocument();
    expect(within(ribbon).getByText('58')).toBeInTheDocument();

    const stocking = rowOf('스타킹');
    expect(within(stocking).getByText('숨김')).toBeInTheDocument();
    expect(within(stocking).getByText('링크 없음 — 누를 수 없는 카드')).toBeInTheDocument();
    expect(within(stocking).getByRole('switch')).not.toBeChecked();
  });

  it('링크는 없어도 사진이 있으면 상세가 열린다고 알려 주고, 2장 이상이면 장 수를 붙인다', async () => {
    await renderManager({}, [...PRODUCTS, CLUBS]);
    const clubs = rowOf('곤봉');
    expect(within(clubs).getByText('링크 없음 — 상세에서 사진만 보여요')).toBeInTheDocument();
    expect(clubs).toHaveTextContent('사진 2장');
    expect(clubs.querySelector('img')).toHaveAttribute('src', 'https://cdn/c1.jpg');
  });

  it('누적 클릭은 공개 목록에서 누를 수 있는 상품이면 링크가 없어도 센다 — 누를 수 없는 카드만 —', async () => {
    await renderManager({}, [...PRODUCTS, { ...CLUBS, clickCount: 7 }]);
    const clicksOf = (title) => rowOf(title).querySelector('[data-label="누적 클릭"]');
    expect(clicksOf('곤봉')).toHaveTextContent('7');
    expect(clicksOf('사사키 리본')).toHaveTextContent('58');
    expect(clicksOf('스타킹')).toHaveTextContent('—');
  });

  it('공개 스위치를 끄면 바로 숨기고 서버에 저장한다 (FR-426)', async () => {
    await renderManager();
    await act(async () => {
      fireEvent.click(within(rowOf('사사키 리본')).getByRole('switch'));
    });
    expect(fetchWithAuth).toHaveBeenCalledWith('/api/shop/products/12/visibility', {
      method: 'PATCH',
      body: JSON.stringify({ isVisible: false })
    });
    expect(within(rowOf('사사키 리본')).getByText('숨김')).toBeInTheDocument();
  });

  it('공개 변경이 실패하면 되돌린다', async () => {
    await renderManager();
    fetchWithAuth.mockImplementation(() => respond(500, {}));
    await act(async () => {
      fireEvent.click(within(rowOf('사사키 리본')).getByRole('switch'));
    });
    expect(within(rowOf('사사키 리본')).getByRole('switch')).toBeChecked();
    expect(screen.getByRole('status')).toHaveTextContent('공개 여부를 바꾸지 못했어요');
  });

  it('▼ 를 누르면 순서를 바꿔 전체 순서를 저장한다 (FR-427)', async () => {
    await renderManager();
    await act(async () => {
      fireEvent.click(within(rowOf('사사키 리본')).getByRole('button', { name: '아래로' }));
    });
    expect(fetchWithAuth).toHaveBeenCalledWith('/api/shop/products/order', {
      method: 'PUT',
      body: JSON.stringify({ ids: [9, 12, 5] })
    });
    const titles = screen.getAllByRole('row').slice(1).map((r) => r.querySelector('.ui-list-row__title').textContent);
    expect(titles[0]).toMatch(/연습용 발레복/);
  });

  describe('손잡이를 끌어서 순서 바꾸기', () => {
    // jsdom 에는 PointerEvent 가 없다 — clientY·button 을 실어 보내도록 MouseEvent 로 흉내 낸다
    beforeAll(() => {
      if (!window.PointerEvent) {
        window.PointerEvent = class PointerEvent extends MouseEvent {
          constructor(type, init = {}) {
            super(type, init);
            this.pointerId = init.pointerId ?? 1;
          }
        };
      }
    });

    // 행 높이 50, 간격 10 — 0번 행 가운데 25, 1번 85, 2번 145
    const layoutRows = () => {
      document.querySelector('.shop-list tbody').getBoundingClientRect = () => ({ top: 0, bottom: 170, height: 170 });
      screen.getAllByRole('row').slice(1).forEach((row) => {
        const index = Number(row.dataset.productIndex);
        row.getBoundingClientRect = () => {
          const offset = parseFloat((row.style.transform || '').replace(/[^-\d.]/g, '')) || 0;
          const top = index * 60 + offset;
          return { top, bottom: top + 50, height: 50, left: 0, right: 0, width: 0 };
        };
      });
    };
    const grip = (title) => within(rowOf(title)).getByRole('button', { name: new RegExp(`${title} 순서`) });

    it('끌어서 놓으면 그 자리로 옮기고 전체 순서를 저장한다 — 끄는 동안 행이 따라오고 놓일 자리에 선', async () => {
      await renderManager();
      layoutRows();

      fireEvent.pointerDown(grip('사사키 리본'), { clientY: 25, button: 0 });
      fireEvent.pointerMove(grip('사사키 리본'), { clientY: 150 });
      expect(rowOf('사사키 리본')).toHaveAttribute('data-dragging', 'true');
      expect(rowOf('사사키 리본').style.transform).toBe('translateY(120px)'); // 목록 아래 끝(170)까지만 — 125 가 아니라 120
      expect(rowOf('스타킹')).toHaveAttribute('data-drop', 'after');

      await act(async () => {
        fireEvent.pointerUp(grip('사사키 리본'), { clientY: 150 });
      });
      expect(fetchWithAuth).toHaveBeenCalledWith('/api/shop/products/order', {
        method: 'PUT',
        body: JSON.stringify({ ids: [9, 5, 12] })
      });
      const titles = screen.getAllByRole('row').slice(1).map((r) => r.querySelector('.ui-list-row__title').textContent);
      expect(titles[2]).toMatch(/사사키 리본/);
      expect(document.querySelector('[data-dragging]')).toBeNull();
    });

    it('제자리에 놓거나 끌기가 취소되면 저장하지 않는다', async () => {
      await renderManager();
      layoutRows();
      fireEvent.pointerDown(grip('연습용 발레복'), { clientY: 85, button: 0 });
      fireEvent.pointerMove(grip('연습용 발레복'), { clientY: 90 });
      fireEvent.pointerUp(grip('연습용 발레복'), { clientY: 90 });

      fireEvent.pointerDown(grip('연습용 발레복'), { clientY: 85, button: 0 });
      fireEvent.pointerMove(grip('연습용 발레복'), { clientY: 10 });
      fireEvent.pointerCancel(grip('연습용 발레복'));

      expect(fetchWithAuth.mock.calls.map((c) => c[0])).not.toContain('/api/shop/products/order');
    });

    it('손잡이에서 ↑↓ 키로도 옮기고, 옮긴 뒤에도 그 손잡이에 포커스가 남는다', async () => {
      await renderManager();
      grip('연습용 발레복').focus();
      await act(async () => {
        fireEvent.keyDown(grip('연습용 발레복'), { key: 'ArrowDown' });
      });
      expect(JSON.parse(fetchWithAuth.mock.calls.find((c) => c[0] === '/api/shop/products/order')[1].body)).toEqual({ ids: [12, 5, 9] });
      expect(grip('연습용 발레복')).toHaveFocus();
    });

    it('검색 중에는 손잡이도 잠긴다', async () => {
      await renderManager();
      fireEvent.change(screen.getByLabelText('상품 검색'), { target: { value: '리본' } });
      expect(grip('사사키 리본')).toBeDisabled();
    });
  });

  it('검색 중에는 순서 버튼을 잠근다', async () => {
    await renderManager();
    fireEvent.change(screen.getByLabelText('상품 검색'), { target: { value: '리본' } });
    expect(screen.queryByText('연습용 발레복')).not.toBeInTheDocument();
    expect(within(rowOf('사사키 리본')).getByRole('button', { name: '아래로' })).toBeDisabled();
  });

  it('카테고리 칩으로 거른다 — 카테고리 없는 상품 칩도 있다', async () => {
    await renderManager();
    fireEvent.click(screen.getByRole('button', { name: /카테고리 없음/ }));
    expect(screen.getByText('스타킹')).toBeInTheDocument();
    expect(screen.queryByText('사사키 리본')).not.toBeInTheDocument();
  });

  it('삭제는 클릭 기록도 지워진다고 확인한 뒤 지운다 (FR-417)', async () => {
    await renderManager();
    fireEvent.click(screen.getByRole('button', { name: '사사키 리본 삭제' }));

    const dialog = screen.getByRole('dialog', { name: '상품을 삭제할까요?' });
    expect(dialog).toHaveTextContent('클릭 기록 58건');

    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: '삭제' }));
    });
    expect(fetchWithAuth).toHaveBeenCalledWith('/api/shop/products/12', { method: 'DELETE' });
    expect(screen.queryByText('사사키 리본')).not.toBeInTheDocument();
  });

  it('[+ 상품] 은 등록 모달을 연다', async () => {
    await renderManager();
    fireEvent.click(screen.getByRole('button', { name: '상품' }));
    expect(screen.getByRole('dialog', { name: '상품 등록' })).toBeInTheDocument();
  });

  it('상품이 없으면 기본 카테고리 안내와 빈 상태', async () => {
    await renderManager({}, []);
    expect(screen.getByText(/카테고리 2개\(발레복·기구\)가 준비돼 있어요/)).toBeInTheDocument();
    expect(screen.getByText('아직 등록된 상품이 없어요')).toBeInTheDocument();
  });

  it('불러오기에 실패하면 다시 시도할 수 있다', async () => {
    fetchWithAuth.mockImplementation(() => respond(500, {}));
    await act(async () => {
      render(<MemoryRouter><ShopManager /></MemoryRouter>);
    });
    expect(screen.getByText(/추천 상품을 불러오지 못했어요/)).toBeInTheDocument();
  });
});

describe('ShopManager — 예약 탭', () => {
  const renderWith = async (requested, props = {}) => {
    fetchWithAuth.mockImplementation(route(PRODUCTS, requested));
    await act(async () => {
      render(
        <MemoryRouter>
          <ShopManager {...props} />
        </MemoryRouter>
      );
    });
  };

  it('상품 다음에 예약 탭 — 처리 전 요청이 있으면 숫자를 붙인다', async () => {
    await renderWith(2);
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual(['상품 (3)', '예약 (2)', '통계', '설정']);
  });

  it('예약을 받는 상품은 상품 표에 "예약" 배지가 붙는다', async () => {
    fetchWithAuth.mockImplementation(route([{ ...PRODUCTS[0], isReservable: true }, PRODUCTS[1]]));
    await act(async () => {
      render(<MemoryRouter><ShopManager /></MemoryRouter>);
    });
    expect(within(rowOf('사사키 리본')).getByText('예약')).toBeInTheDocument();
    expect(within(rowOf('연습용 발레복')).queryByText('예약')).not.toBeInTheDocument();
  });

  it('링크·사진이 없어도 예약을 받으면 "누를 수 없는 카드" 가 아니라 예약을 받는다고 알려 준다', async () => {
    fetchWithAuth.mockImplementation(route([{ ...PRODUCTS[2], isReservable: true }]));
    await act(async () => {
      render(<MemoryRouter><ShopManager /></MemoryRouter>);
    });
    expect(within(rowOf('스타킹')).getByText('링크 없음 — 상세에서 예약을 받아요')).toBeInTheDocument();
  });

  it('처리 전 요청이 없으면 숫자 없이', async () => {
    await renderWith(0);
    expect(screen.getByRole('tab', { name: '예약' })).toBeInTheDocument();
  });

  it('/products/reservations 로 들어오면 예약 탭이 열려 목록을 부른다', async () => {
    await renderWith(0, { initialTab: 'reservations' });
    expect(screen.getByRole('tab', { name: '예약' })).toHaveAttribute('aria-selected', 'true');
    expect(fetchWithAuth.mock.calls.map((c) => c[0])).toContain('/api/shop/reservations');
    expect(screen.getByText('아직 예약 요청이 없어요')).toBeInTheDocument();
    // 상품 탭이 아니면 [+ 상품] 버튼은 없다
    expect(screen.queryByRole('button', { name: '상품' })).not.toBeInTheDocument();
  });
});
