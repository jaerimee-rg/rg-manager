import React from 'react';
import { render, screen, act, fireEvent, within, cleanup } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';

jest.mock('../../utils/shopTracking', () => ({
  trackClick: jest.fn(),
  trackViewOnce: jest.fn()
}));

import { trackClick, trackViewOnce } from '../../utils/shopTracking';
import { addDays, todayIso } from '../../utils/calendar';
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

  it('휴대폰에서는 상세 시트를 아래로 끌어내려 닫는다 — 카드에서 열었으면 상점으로 돌아간다', async () => {
    const originalMatchMedia = window.matchMedia;
    window.matchMedia = (query) => ({ matches: query === '(max-width: 767px)', media: query });
    jest.useFakeTimers();
    try {
      await renderShop('/shop/pub123?c=3');
      fireEvent.click(screen.getByRole('link', { name: '사사키 리본 6m 자세히 보기' }));
      const title = within(screen.getByRole('dialog')).getByRole('heading', { name: '사사키 리본 6m' });

      const touch = (type, y, t) => {
        const event = new Event(type, { bubbles: true, cancelable: true });
        Object.defineProperty(event, 'touches', { value: type === 'touchend' ? [] : [{ clientX: 50, clientY: y }] });
        Object.defineProperty(event, 'timeStamp', { value: t });
        title.dispatchEvent(event);
      };
      touch('touchstart', 100, 0);
      [150, 220, 300].forEach((y, i) => touch('touchmove', y, (i + 1) * 100));
      touch('touchend', 300, 300);
      await act(async () => { jest.advanceTimersByTime(180); });

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(currentLocation.search).toBe('?c=3');
    } finally {
      jest.useRealTimers();
      window.matchMedia = originalMatchMedia;
    }
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

describe('PublicShop — 상품 예약 (05-reservations.md)', () => {
  const RESERVABLE = {
    ...DATA,
    products: [
      { ...DATA.products[0], isReservable: true },
      // 사진도 링크도 없지만 예약을 받으니 누를 수 있다
      { id: 21, title: '레오타드 맞춤', description: '사이즈를 재고 맞춰요', url: null, images: [], price: 89000, categoryId: 1, isReservable: true },
      ...DATA.products.slice(1)
    ]
  };

  let reserveResponse;
  let takenDates;
  beforeEach(() => {
    reserveResponse = () => respond(201, { reservation: { reservedDate: 'x', status: 'requested' }, duplicate: false });
    takenDates = [];
    global.fetch = jest.fn((url, options = {}) => {
      if (options.method === 'POST') return reserveResponse(url, options);
      if (url.endsWith('/unavailable-dates')) return respond(200, { dates: takenDates });
      return respond(200, RESERVABLE);
    });
  });

  const openReserve = async (productId = 21) => {
    await renderShop(`/shop/pub123?p=${productId}`);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '예약하기' }));
    });
    return screen.getByRole('dialog', { name: '예약하기' });
  };
  const datesFetches = () => global.fetch.mock.calls.filter(([url]) => url.endsWith('/unavailable-dates'));
  const posts = () => global.fetch.mock.calls.filter(([, o]) => o?.method === 'POST');
  const send = async (dialog) => {
    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: '예약 요청 보내기' }));
    });
  };

  it('예약 받는 상품은 카드에 "예약 가능" 이 붙고, 사진·링크가 없어도 상세가 열린다', async () => {
    await renderShop();
    const card = screen.getByRole('link', { name: '레오타드 맞춤 자세히 보기' });
    expect(within(card).getByText('예약 가능')).toBeInTheDocument();
    expect(within(screen.getByRole('link', { name: '연습용 발레복 자세히 보기' })).queryByText('예약 가능')).not.toBeInTheDocument();
  });

  it('상세 아래에 [예약하기] — 쇼핑몰 링크가 있으면 둘 다, 링크 없음 안내는 숨긴다', async () => {
    await renderShop('/shop/pub123?p=12');
    expect(screen.getByRole('button', { name: '예약하기' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'coupang.com에서 보기' })).toBeInTheDocument();
    cleanupAll();

    await renderShop('/shop/pub123?p=21');
    expect(screen.getByRole('button', { name: '예약하기' })).toBeInTheDocument();
    expect(screen.queryByText(/쇼핑몰 링크가 없는 상품이에요/)).not.toBeInTheDocument();
    cleanupAll();

    await renderShop('/shop/pub123?p=9');
    expect(screen.queryByRole('button', { name: '예약하기' })).not.toBeInTheDocument();
  });

  it('이름·전화번호·달력 날짜를 받아 로그인 없이 보내고, 보낸 내용을 보여 준다', async () => {
    const dialog = await openReserve();
    expect(within(dialog).getByText('레오타드 맞춤')).toBeInTheDocument();

    fireEvent.change(within(dialog).getByLabelText(/이름/), { target: { value: ' 예림엄마 ' } });
    fireEvent.change(within(dialog).getByLabelText(/전화번호/), { target: { value: '01012345678' } });
    expect(within(dialog).getByLabelText(/전화번호/)).toHaveValue('010-1234-5678');
    fireEvent.click(within(dialog).getByRole('button', { name: /, 오늘$/ }));
    await send(dialog);

    const [[url, options]] = posts();
    expect(url).toBe('/api/shop/public/pub123/products/21/reservations');
    expect(options.headers).toEqual({ 'Content-Type': 'application/json' });
    expect(options.headers).not.toHaveProperty('Authorization');
    expect(JSON.parse(options.body)).toEqual({ name: '예림엄마', phone: '010-1234-5678', date: todayIso() });

    const done = screen.getByRole('dialog', { name: '예약을 요청했어요' });
    expect(within(done).getByText('예림엄마')).toBeInTheDocument();
    expect(within(done).getByText('010-1234-5678')).toBeInTheDocument();
    fireEvent.click(within(done).getByRole('button', { name: '확인' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('빈 칸은 그 칸 아래에 알리고 서버를 부르지 않는다', async () => {
    const dialog = await openReserve();
    await send(dialog);
    expect(within(dialog).getByText('이름을 입력해 주세요')).toBeInTheDocument();
    expect(within(dialog).getByText('전화번호를 입력해 주세요')).toBeInTheDocument();
    expect(within(dialog).getByText('예약 날짜를 골라 주세요')).toBeInTheDocument();
    expect(posts()).toHaveLength(0);
  });

  it('오늘 전 날짜는 고를 수 없다', async () => {
    const dialog = await openReserve();
    const yesterday = addDays(todayIso(), -1);
    const cell = within(dialog).queryByRole('button', { name: new RegExp(`^${Number(yesterday.slice(5, 7))}월 ${Number(yesterday.slice(8))}일 `) });
    // 어제가 지난달이면 이 달 달력에 없다 — 있으면 잠겨 있어야 한다
    if (cell) expect(cell).toBeDisabled();
    expect(within(dialog).getByRole('button', { name: '이전 달' })).toBeDisabled();
  });

  it('선생님이 예약을 막았으면(409) 서버 안내를 보여 준다', async () => {
    reserveResponse = () => respond(409, { error: '이 상품은 지금 예약을 받지 않아요.' });
    const dialog = await openReserve();
    fireEvent.change(within(dialog).getByLabelText(/이름/), { target: { value: '김예림' } });
    fireEvent.change(within(dialog).getByLabelText(/전화번호/), { target: { value: '010-1234-5678' } });
    fireEvent.click(within(dialog).getByRole('button', { name: /, 오늘$/ }));
    await send(dialog);
    expect(within(dialog).getByText('이 상품은 지금 예약을 받지 않아요.')).toBeInTheDocument();
  });

  it('같은 요청을 다시 보내면 이미 요청했다고 알려 준다', async () => {
    reserveResponse = () => respond(200, { reservation: { reservedDate: 'x', status: 'requested' }, duplicate: true });
    const dialog = await openReserve();
    fireEvent.change(within(dialog).getByLabelText(/이름/), { target: { value: '김예림' } });
    fireEvent.change(within(dialog).getByLabelText(/전화번호/), { target: { value: '010-1234-5678' } });
    fireEvent.click(within(dialog).getByRole('button', { name: /, 오늘$/ }));
    await send(dialog);
    expect(screen.getByRole('dialog', { name: '이미 요청한 예약이에요' })).toBeInTheDocument();
  });

  it('예약 폼에서 Esc 는 창을 닫지 않고 상품으로 돌아간다 — 쓰던 이름은 남는다', async () => {
    const dialog = await openReserve();
    fireEvent.change(within(dialog).getByLabelText(/이름/), { target: { value: '김예림' } });

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.getByRole('dialog', { name: '레오타드 맞춤' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '예약하기' }));
    expect(screen.getByLabelText(/이름/)).toHaveValue('김예림');

    fireEvent.click(screen.getByRole('button', { name: '상품으로 돌아가기' }));
    expect(screen.getByRole('dialog', { name: '레오타드 맞춤' })).toBeInTheDocument();
  });

  it('다른 사람이 잡은 날은 달력에서 줄을 긋고 고를 수 없다 — 날짜만 받아 온다', async () => {
    takenDates = [todayIso()];
    const dialog = await openReserve();

    expect(datesFetches().map(([url]) => url)).toEqual(['/api/shop/public/pub123/products/21/unavailable-dates']);
    const today = within(dialog).getByRole('button', { name: /, 오늘, 예약 불가$/ });
    expect(today).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(today);
    expect(today).toHaveAttribute('aria-pressed', 'false');
    expect(within(dialog).getByText('달력에서 날짜를 골라 주세요. 줄 그은 날은 예약할 수 없어요.')).toBeInTheDocument();
  });

  it('보내는 사이 다른 사람이 먼저 잡으면(409) 고른 날을 비우고 달력을 새로 받아 그 날을 막는다', async () => {
    const message = '이 날짜는 예약할 수 없어요. 다른 날짜를 골라 주세요.';
    reserveResponse = () => respond(409, { error: message, code: 'dateUnavailable', fields: { date: message } });
    const dialog = await openReserve();
    fireEvent.change(within(dialog).getByLabelText(/이름/), { target: { value: '김예림' } });
    fireEvent.change(within(dialog).getByLabelText(/전화번호/), { target: { value: '010-1234-5678' } });
    fireEvent.click(within(dialog).getByRole('button', { name: /, 오늘$/ }));

    takenDates = [todayIso()];
    await send(dialog);

    expect(within(dialog).getByText(message)).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: /, 오늘, 예약 불가$/ })).toHaveAttribute('aria-pressed', 'false');
    expect(datesFetches()).toHaveLength(2);
    // 쓰던 이름·번호는 남는다
    expect(within(dialog).getByLabelText(/이름/)).toHaveValue('김예림');
  });

  it('상품으로 돌아갔다 오는 사이 고른 날이 잡혔으면 비우고 알려 준다', async () => {
    const dialog = await openReserve();
    fireEvent.click(within(dialog).getByRole('button', { name: /, 오늘$/ }));
    fireEvent.click(within(dialog).getByRole('button', { name: '상품으로 돌아가기' }));

    takenDates = [todayIso()];
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '예약하기' }));
    });
    const again = screen.getByRole('dialog', { name: '예약하기' });
    expect(within(again).getByText('이 날짜는 예약할 수 없어요. 다른 날짜를 골라 주세요.')).toBeInTheDocument();
    expect(within(again).getByRole('button', { name: /, 오늘, 예약 불가$/ })).toHaveAttribute('aria-pressed', 'false');
  });

  it('잡힌 날짜를 받아 오는 사이 친 이름은 날짜를 비울 때 지워지지 않는다', async () => {
    const dialog = await openReserve();
    fireEvent.click(within(dialog).getByRole('button', { name: /, 오늘$/ }));
    fireEvent.click(within(dialog).getByRole('button', { name: '상품으로 돌아가기' }));

    let release;
    global.fetch.mockImplementation((url, options = {}) => {
      if (url.endsWith('/unavailable-dates')) {
        return new Promise((resolve) => { release = () => resolve({ ok: true, status: 200, json: () => Promise.resolve({ dates: [todayIso()] }) }); });
      }
      if (options.method === 'POST') return reserveResponse(url, options);
      return respond(200, RESERVABLE);
    });
    fireEvent.click(screen.getByRole('button', { name: '예약하기' }));
    const again = screen.getByRole('dialog', { name: '예약하기' });
    fireEvent.change(within(again).getByLabelText(/이름/), { target: { value: '받는 사이 친 이름' } });

    await act(async () => { release(); });
    expect(within(again).getByLabelText(/이름/)).toHaveValue('받는 사이 친 이름');
    expect(within(again).getByText('이 날짜는 예약할 수 없어요. 다른 날짜를 골라 주세요.')).toBeInTheDocument();
  });

  it('잡힌 날짜를 못 읽어도 폼은 쓸 수 있다 (보낼 때 서버가 다시 확인한다)', async () => {
    global.fetch.mockImplementation((url, options = {}) => {
      if (url.endsWith('/unavailable-dates')) return Promise.reject(new Error('offline'));
      if (options.method === 'POST') return reserveResponse(url, options);
      return respond(200, RESERVABLE);
    });
    const dialog = await openReserve();
    expect(within(dialog).getByRole('button', { name: /, 오늘$/ })).not.toHaveAttribute('aria-disabled');
  });

  it('휴대폰 — 예약 폼에서는 끌어내려도 닫히지 않고(쓰던 입력을 지킨다), 상품으로 돌아가면 다시 끌어내려 닫힌다', async () => {
    const originalMatchMedia = window.matchMedia;
    window.matchMedia = (query) => ({ matches: query === '(max-width: 767px)', media: query });
    jest.useFakeTimers();
    try {
      const dialog = await openReserve();
      fireEvent.change(within(dialog).getByLabelText(/이름/), { target: { value: '김예림' } });

      const dragDown = async (target) => {
        const touch = (type, y, t) => {
          const event = new Event(type, { bubbles: true, cancelable: true });
          Object.defineProperty(event, 'touches', { value: type === 'touchend' ? [] : [{ clientX: 50, clientY: y }] });
          Object.defineProperty(event, 'timeStamp', { value: t });
          target.dispatchEvent(event);
        };
        touch('touchstart', 100, 0);
        [150, 220, 300].forEach((y, i) => touch('touchmove', y, (i + 1) * 100));
        touch('touchend', 300, 300);
        await act(async () => { jest.advanceTimersByTime(180); });
      };

      await dragDown(within(dialog).getByRole('heading', { name: '예약하기' }));
      expect(screen.getByRole('dialog', { name: '예약하기' })).toBeInTheDocument();
      expect(screen.getByLabelText(/이름/)).toHaveValue('김예림');

      fireEvent.click(screen.getByRole('button', { name: '상품으로 돌아가기' }));
      await dragDown(screen.getByRole('heading', { name: '레오타드 맞춤' }));
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    } finally {
      jest.useRealTimers();
      window.matchMedia = originalMatchMedia;
    }
  });
});
