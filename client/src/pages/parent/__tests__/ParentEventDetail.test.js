import React from 'react';
import { render, screen, act, fireEvent, within } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

jest.mock('../../../utils/api', () => ({ fetchWithAuth: jest.fn() }));

const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate
}));

// 지도 SDK 는 PlaceMap 자체 테스트가 본다 — 여기서는 어떤 좌표로 그리는지만.
jest.mock('../../../components/common/PlaceMap', () => (props) => (
  <div data-testid="map" data-lat={props.latitude} data-lng={props.longitude} data-name={props.name} />
));

import { fetchWithAuth } from '../../../utils/api';
import ParentEventDetail from '../ParentEventDetail';

const EVENT = {
  today: '2026-09-02',
  id: 12,
  type: 'special',
  title: '가을 러닝',
  date: '2026-10-10',
  startTime: '10:00',
  location: '한강공원',
  description: '운동화를 신고 오세요.',
  options: [{ id: 'o5', label: '5km' }, { id: 'o10', label: '10km' }],
  requireOption: false,
  registrationDeadline: null,
  album: null,
  registrations: [
    { studentName: '김민서', status: 'registered', options: ['5km'], mine: true },
    { studentName: '박서연', status: 'confirmed', options: ['10km'], mine: false },
    { studentName: '이하늘', status: 'registered', options: [], mine: false }
  ],
  children: [
    { childId: 1, childName: '김민서', status: 'registered', optionIds: ['o5'], canRegister: true, reason: null }
  ]
};

const ok = (body, status = 200) => Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) });

const renderDetail = async (event = EVENT, { status = 200, entry = '/parent/events/12' } = {}) => {
  fetchWithAuth.mockImplementation((url, options = {}) => {
    if (options.method === 'PUT' || options.method === 'DELETE') return ok({ ok: true });
    return ok(event, status);
  });
  await act(async () => {
    render(
      <MemoryRouter initialEntries={[entry]}>
        <Routes>
          <Route path="/parent/events/:eventId" element={<ParentEventDetail />} />
        </Routes>
      </MemoryRouter>
    );
  });
};

beforeEach(() => {
  jest.clearAllMocks();
  window.confirm = jest.fn(() => true);
});

describe('ParentEventDetail — 전체 화면 상세', () => {
  it('페이지로 그려진다 (dialog 가 아니다) 그리고 제목·일시·장소가 보인다', async () => {
    await renderDetail();

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByText('가을 러닝')).toBeInTheDocument();
    expect(screen.getByText('한강공원')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '뒤로' })).toBeInTheDocument();
  });

  it('뒤로 가기는 일정으로 간다', async () => {
    await renderDetail();

    fireEvent.click(screen.getByRole('button', { name: '뒤로' }));

    expect(mockNavigate).toHaveBeenCalledWith('/parent/schedule');
  });

  it('지난 일정에서 들어왔으면 뒤로 가기가 지난 일정으로 간다', async () => {
    await renderDetail(EVENT, {
      entry: { pathname: '/parent/events/12', state: { back: '/parent/schedule?view=past' } }
    });

    fireEvent.click(screen.getByRole('button', { name: '뒤로' }));

    expect(mockNavigate).toHaveBeenCalledWith('/parent/schedule?view=past');
  });

  it('끝난 일정은 일시 옆에 종료라고 쓴다', async () => {
    await renderDetail({ ...EVENT, date: '2026-08-20', children: [] });

    expect(screen.getByText('종료')).toBeInTheDocument();
    expect(screen.queryByText('진행 중')).not.toBeInTheDocument();
  });

  it('옵션 선택이 위, 신청한 학생 명단이 아래에 온다', async () => {
    await renderDetail();

    const options = screen.getByRole('group', { name: '옵션' });
    const roster = screen.getByTestId('roster-section');
    const description = screen.getByText('운동화를 신고 오세요.');

    // DOM 순서: 옵션 → 안내 → 명단
    expect(options.compareDocumentPosition(description) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(description.compareDocumentPosition(roster) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('신청한 학생 명단에 이름·옵션·확정·우리 아이 표시가 나온다', async () => {
    await renderDetail();

    const roster = within(screen.getByTestId('roster-section'));
    expect(roster.getByRole('heading', { name: '신청한 학생 3명' })).toBeInTheDocument();
    expect(roster.getByText('김민서')).toBeInTheDocument();
    expect(roster.getByText('박서연')).toBeInTheDocument();
    expect(roster.getByText('이하늘')).toBeInTheDocument();
    expect(roster.getByText('10km')).toBeInTheDocument();
    expect(roster.getByText('확정')).toBeInTheDocument();
    expect(roster.getByText('우리 아이')).toBeInTheDocument();
  });

  it('아무도 신청하지 않았으면 그렇게 말한다', async () => {
    await renderDetail({ ...EVENT, registrations: [], children: [{ ...EVENT.children[0], status: null, optionIds: [] }] });

    expect(screen.getByRole('heading', { name: '신청한 학생 0명' })).toBeInTheDocument();
    expect(screen.getByText(/아직 신청한 학생이 없어요/)).toBeInTheDocument();
  });

  it('휴관일에는 옵션·신청 버튼·명단이 없고 안내만 있다', async () => {
    await renderDetail({ ...EVENT, type: 'closure', options: [], registrations: [], children: [] });

    expect(screen.getByText('휴관일 안내예요. 신청은 필요 없어요.')).toBeInTheDocument();
    expect(screen.queryByTestId('roster-section')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /신청/ })).not.toBeInTheDocument();
  });

  it('신청 전이면 옵션을 골라 신청하고, 저장 뒤 다시 읽는다', async () => {
    await renderDetail({ ...EVENT, registrations: [], children: [{ ...EVENT.children[0], status: null, optionIds: [] }] });

    fireEvent.click(screen.getByRole('button', { name: '10km' }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '선택한 옵션으로 신청하기' }));
    });

    const put = fetchWithAuth.mock.calls.find(([, options]) => options?.method === 'PUT');
    expect(put[0]).toBe('/api/parent/events/12/registrations/1');
    expect(JSON.parse(put[1].body)).toEqual({ optionIds: ['o10'] });
    expect(screen.getByRole('status')).toHaveTextContent('신청했어요');
    // 명단이 바뀌었을 수 있으니 상세를 다시 읽는다
    expect(fetchWithAuth.mock.calls.filter(([url, o]) => url === '/api/parent/events/12' && !o?.method)).toHaveLength(2);
  });

  it('이미 신청했으면 옵션 변경·취소 버튼이 옵션 바로 아래에 있다', async () => {
    await renderDetail();

    expect(screen.getByRole('button', { name: '신청 취소' })).toBeInTheDocument();
    const change = screen.getByRole('button', { name: '옵션 변경' });
    expect(change).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: '10km' }));
    expect(change).toBeEnabled();

    const section = screen.getByTestId('registration-section');
    expect(section).toContainElement(change);
  });

  it('없는 이벤트(404)면 안내와 일정으로 가는 버튼을 보여준다', async () => {
    await renderDetail({ error: '찾을 수 없습니다.' }, { status: 404 });

    expect(screen.getByText('이벤트를 찾을 수 없어요')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '일정으로 가기' }));
    expect(mockNavigate).toHaveBeenCalledWith('/parent/schedule');
  });

  it('이 선생님께 등록된 아이가 없으면 그렇게 안내한다', async () => {
    await renderDetail({ ...EVENT, children: [] });

    expect(screen.getByText(/이 선생님께 등록된 아이가 없어요/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /신청/ })).not.toBeInTheDocument();
  });
});

describe('ParentEventDetail — 오시는 길 (지도)', () => {
  const PLACED = { ...EVENT, address: '서울 영등포구 여의동로 330', latitude: 37.5284, longitude: 126.9327 };

  it('선생님이 고른 주소가 있으면 장소 이름·주소·지도와 카카오맵 링크를 보여 준다', async () => {
    await renderDetail(PLACED);

    const section = screen.getByTestId('place-section');
    expect(within(section).getByText('오시는 길')).toBeInTheDocument();
    expect(within(section).getByText('한강공원')).toBeInTheDocument();
    expect(within(section).getByText('서울 영등포구 여의동로 330')).toBeInTheDocument();

    const map = within(section).getByTestId('map');
    expect(map).toHaveAttribute('data-lat', '37.5284');
    expect(map).toHaveAttribute('data-lng', '126.9327');

    const label = encodeURIComponent('한강공원');
    const view = within(section).getByRole('link', { name: '카카오맵에서 보기' });
    expect(view).toHaveAttribute('href', `https://map.kakao.com/link/map/${label},37.5284,126.9327`);
    expect(view).toHaveAttribute('target', '_blank');
    expect(view).toHaveAttribute('rel', expect.stringContaining('noopener'));
    expect(within(section).getByRole('link', { name: '길찾기' }))
      .toHaveAttribute('href', `https://map.kakao.com/link/to/${label},37.5284,126.9327`);
  });

  it('안내 아래, 신청한 학생 명단 위에 온다', async () => {
    await renderDetail(PLACED);

    const description = screen.getByText('운동화를 신고 오세요.');
    const place = screen.getByTestId('place-section');
    const roster = screen.getByTestId('roster-section');
    expect(description.compareDocumentPosition(place) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(place.compareDocumentPosition(roster) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('좌표 없이 주소만 있으면 지도 없이 주소 검색 링크만 (길찾기 없음)', async () => {
    await renderDetail({ ...PLACED, latitude: null, longitude: null });

    const section = screen.getByTestId('place-section');
    expect(within(section).queryByTestId('map')).not.toBeInTheDocument();
    expect(within(section).getByRole('link', { name: '카카오맵에서 보기' }))
      .toHaveAttribute('href', `https://map.kakao.com/link/search/${encodeURIComponent('서울 영등포구 여의동로 330')}`);
    expect(within(section).queryByRole('link', { name: '길찾기' })).not.toBeInTheDocument();
  });

  it('주소를 고르지 않은 이벤트(예전 이벤트)는 오시는 길이 없다 — 장소 이름만', async () => {
    await renderDetail({ ...EVENT, address: null, latitude: null, longitude: null });

    expect(screen.queryByTestId('place-section')).not.toBeInTheDocument();
    expect(screen.getByText('한강공원')).toBeInTheDocument();
  });

  it('휴관일은 주소가 남아 있어도 지도를 그리지 않는다', async () => {
    await renderDetail({ ...PLACED, type: 'closure', options: [], children: [] });

    expect(screen.queryByTestId('place-section')).not.toBeInTheDocument();
  });
});
