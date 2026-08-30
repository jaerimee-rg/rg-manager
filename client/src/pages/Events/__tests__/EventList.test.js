import React from 'react';
import { render, screen, act, fireEvent, within } from '@testing-library/react';

jest.mock('../../../utils/api', () => ({
  fetchWithAuth: jest.fn()
}));

const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate
}));

// 신청 현황 패널은 자체적으로 API 를 부르므로 여기서는 자리만 잡는다.
jest.mock('../EventRegistrations', () => () => <div data-testid="registrations" />);

let mockMobile = false;
jest.mock('../../../hooks/useMediaQuery', () => ({
  useIsMobile: () => mockMobile
}));

import { fetchWithAuth } from '../../../utils/api';
import EventList from '../EventList';

const TODAY = '2026-08-30';

const EVENTS = [
  {
    id: 1,
    type: 'competition',
    title: '2026 서울시 대회',
    date: '2026-09-12',
    location: '올림픽공원',
    isPublished: true,
    participantCount: 8,
    registrationCount: 5,
    competitionId: 11
  },
  {
    id: 2,
    type: 'closure',
    title: '추석 휴관',
    date: '2026-09-25',
    isPublished: false
  }
];

const ok = (body) => Promise.resolve({ ok: true, json: () => Promise.resolve(body) });

const renderList = async (events = EVENTS) => {
  fetchWithAuth.mockImplementation(() => ok(events));
  await act(async () => {
    render(<EventList />);
  });
};

beforeEach(() => {
  jest.clearAllMocks();
  mockMobile = false;
  jest.useFakeTimers().setSystemTime(new Date(`${TODAY}T09:00:00`));
});

afterEach(() => {
  jest.useRealTimers();
});

describe('EventList', () => {
  it('이벤트를 표 하나로 보여준다 (표용·카드용을 따로 만들지 않는다)', async () => {
    await renderList();

    expect(screen.getByRole('columnheader', { name: '이벤트' })).toBeInTheDocument();
    expect(screen.getByText('2026 서울시 대회')).toBeInTheDocument();
    expect(screen.getByText('추석 휴관')).toBeInTheDocument();
  });

  it('모바일에서도 같은 표를 쓴다 — 쌓는 건 CSS 가 한다', async () => {
    mockMobile = true;
    await renderList();

    // 모바일 전용 카드 분기를 두지 않으므로 table 이 그대로 있다.
    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.getByText('2026 서울시 대회')).toBeInTheDocument();
  });

  it('각 셀에 컬럼 라벨을 붙여 모바일에서 무슨 값인지 알 수 있게 한다', async () => {
    await renderList();

    const cell = screen.getByRole('cell', { name: '올림픽공원' });
    expect(cell).toHaveAttribute('data-label', '장소');
  });

  it('공개·접수 상태를 배지로 보여준다', async () => {
    await renderList();

    expect(screen.getByText('공개')).toBeInTheDocument();
    expect(screen.getByText('비공개')).toBeInTheDocument();
  });

  it('휴관일에는 접수 배지를 붙이지 않는다', async () => {
    await renderList();

    // 접수 배지는 대회 행에만 하나 있다.
    expect(screen.getAllByText(/접수 중|마감/)).toHaveLength(1);
  });

  it('종류 칩으로 거르면 그 종류만 다시 불러온다', async () => {
    await renderList();
    fetchWithAuth.mockClear();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '대회' }));
    });

    expect(fetchWithAuth).toHaveBeenCalledWith(expect.stringContaining('type=competition'));
  });

  it('다가오는 일정이 없고 지난 일정만 있으면 그 사실과 함께 보기 버튼을 준다', async () => {
    await renderList([{ ...EVENTS[0], id: 9, date: '2020-01-01', title: '지난 대회' }]);

    expect(screen.getByText('다가오는 일정이 없습니다')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /지난 일정 1건 보기/ }));
    });

    expect(screen.getByText('지난 대회')).toBeInTheDocument();
  });

  it('아무 이벤트도 없으면 첫 일정을 올리라고 안내한다', async () => {
    await renderList([]);

    expect(screen.getByText('등록된 이벤트가 없습니다')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('신청 건수를 누르면 신청 현황 패널이 열린다', async () => {
    await renderList();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '5건' }));
    });

    expect(screen.getByTestId('registrations')).toBeInTheDocument();
  });

  it('수정을 누르면 그 이벤트를 들고 편집 화면으로 간다', async () => {
    await renderList();

    const row = screen.getByText('2026 서울시 대회').closest('tr');
    await act(async () => {
      fireEvent.click(within(row).getByRole('button', { name: '수정' }));
    });

    expect(mockNavigate).toHaveBeenCalledWith('/events/edit', { state: { event: EVENTS[0] } });
  });

  it('대회가 아닌 이벤트에는 참가 학생 버튼이 없다', async () => {
    await renderList();

    const closureRow = screen.getByText('추석 휴관').closest('tr');
    expect(within(closureRow).queryByRole('button', { name: '참가 학생' })).not.toBeInTheDocument();
  });
});
