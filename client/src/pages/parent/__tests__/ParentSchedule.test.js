import React from 'react';
import { render, screen, act, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

jest.mock('../../../utils/api', () => ({ fetchWithAuth: jest.fn() }));

const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate
}));

import { fetchWithAuth } from '../../../utils/api';
import ParentSchedule from '../ParentSchedule';

const PAYLOAD = {
  today: '2026-09-02',
  teachers: [{ id: 7, name: '이재림' }],
  children: [{ id: 1, childName: '김민서', status: 'linked', studentId: 100 }],
  events: [
    {
      id: 12, type: 'special', title: '가을 러닝', date: '2026-10-10', teacherId: 7,
      hasOptions: false, optionCount: 0, registrationCount: 3,
      children: [{ childId: 1, childName: '김민서', status: null, optionIds: [], canRegister: true }]
    },
    {
      id: 13, type: 'closure', title: '추석 휴관', date: '2026-10-03', teacherId: 7,
      hasOptions: false, optionCount: 0, registrationCount: 0, children: []
    },
    {
      id: 14, type: 'competition', title: '겨울 대회', date: '2026-12-05', teacherId: 7,
      hasOptions: true, optionCount: 2,
      children: [{ childId: 1, childName: '김민서', status: null, optionIds: [], canRegister: true }]
    }
  ]
};

const ok = (body) => Promise.resolve({ ok: true, json: () => Promise.resolve(body) });

const renderSchedule = async () => {
  fetchWithAuth.mockImplementation(() => ok(PAYLOAD));
  await act(async () => {
    render(
      <MemoryRouter initialEntries={['/parent/schedule']}>
        <ParentSchedule />
      </MemoryRouter>
    );
  });
};

beforeEach(() => jest.clearAllMocks());

describe('ParentSchedule', () => {
  it('올해 남은 일정을 카드로 보여준다', async () => {
    await renderSchedule();

    expect(screen.getByText('가을 러닝')).toBeInTheDocument();
    expect(screen.getByText('추석 휴관')).toBeInTheDocument();
  });

  it('카드를 누르면 시트가 아니라 전체 화면 상세 페이지로 간다', async () => {
    await renderSchedule();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /가을 러닝/ }));
    });

    expect(mockNavigate).toHaveBeenCalledWith('/parent/events/12');
    // 같은 화면 위에 dialog 를 띄우지 않는다
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('카드에 몇 명이 신청했는지 보여준다', async () => {
    await renderSchedule();

    const card = screen.getByRole('button', { name: /가을 러닝/ });
    expect(card).toHaveTextContent('신청 3명');
  });

  it('신청 인원이 없으면 0명으로 보여주고, 서버가 값을 안 주면 0으로 본다', async () => {
    await renderSchedule();

    expect(screen.getByRole('button', { name: /겨울 대회/ })).toHaveTextContent('신청 0명');
  });

  it('휴관일 카드에는 신청 인원이 없다', async () => {
    await renderSchedule();

    expect(screen.getByRole('button', { name: /추석 휴관/ })).not.toHaveTextContent('신청');
  });

  it('휴관일 카드도 같은 상세 페이지로 간다', async () => {
    await renderSchedule();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /추석 휴관/ }));
    });

    expect(mockNavigate).toHaveBeenCalledWith('/parent/events/13');
  });
});

// 오늘(2026-09-02) 기준으로 끝난 일정 — 서버가 최근 것부터 주지만 화면도 다시 정렬한다
const PAST_PAYLOAD = {
  today: '2026-09-02',
  teachers: [{ id: 7, name: '이재림' }, { id: 8, name: '박지우' }],
  children: [{ id: 1, childName: '김민서', status: 'linked', studentId: 100 }],
  events: [
    {
      id: 23, type: 'competition', title: '작년 대회', date: '2025-11-02', teacherId: 7,
      hasOptions: false, optionCount: 0, registrationCount: 4,
      children: [{ childId: 1, childName: '김민서', status: null, optionIds: [], canRegister: false, reason: 'started' }]
    },
    {
      id: 21, type: 'competition', title: '여름 대회', date: '2026-07-12', teacherId: 7,
      hasOptions: false, optionCount: 0, registrationCount: 5,
      children: [{ childId: 1, childName: '김민서', status: 'confirmed', optionIds: [], canRegister: false, reason: 'started' }]
    },
    {
      id: 22, type: 'special', title: '봄 소풍', date: '2026-04-20', teacherId: 7,
      hasOptions: false, optionCount: 0, registrationCount: 2,
      children: [{ childId: 1, childName: '김민서', status: null, optionIds: [], canRegister: false, reason: 'started' }]
    }
  ]
};

const renderAt = async (entry, payload) => {
  fetchWithAuth.mockImplementation(() => ok(payload));
  await act(async () => {
    render(
      <MemoryRouter initialEntries={[entry]}>
        <ParentSchedule />
      </MemoryRouter>
    );
  });
};

describe('ParentSchedule — 지난 일정 보기', () => {
  it('제목 줄에 링크처럼 생긴 "지난 일정 보기" 버튼이 있다 (채운 버튼이 아니다)', async () => {
    await renderSchedule();

    const link = screen.getByRole('button', { name: '지난 일정 보기' });
    expect(link).toHaveClass('ui-link');
    expect(link).not.toHaveClass('ui-btn');
    expect(link.closest('header')).not.toBeNull();
    // 기본 보기는 지금까지와 같은 주소로 조회한다
    expect(fetchWithAuth).toHaveBeenCalledWith('/api/parent/events');
  });

  it('누르면 지난 일정 보기 주소로 간다', async () => {
    await renderSchedule();

    fireEvent.click(screen.getByRole('button', { name: '지난 일정 보기' }));

    expect(mockNavigate).toHaveBeenCalledWith('/parent/schedule?view=past');
  });

  it('지난 일정 보기는 끝난 일정을 서버에 따로 묻고, 최근 것부터 보여준다', async () => {
    await renderAt('/parent/schedule?view=past', PAST_PAYLOAD);

    expect(fetchWithAuth).toHaveBeenCalledWith('/api/parent/events?view=past');
    expect(screen.getByText('지난 일정')).toBeInTheDocument();
    expect(screen.queryByText(/년 남은 일정/)).not.toBeInTheDocument();

    const summer = screen.getByRole('button', { name: /여름 대회/ });
    const spring = screen.getByRole('button', { name: /봄 소풍/ });
    const lastYear = screen.getByRole('button', { name: /작년 대회/ });
    expect(summer.compareDocumentPosition(spring) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(spring.compareDocumentPosition(lastYear) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('지난 카드는 종료라고 쓰고, 신청했던 것만 배지로 남긴다', async () => {
    await renderAt('/parent/schedule?view=past', PAST_PAYLOAD);

    const summer = screen.getByRole('button', { name: /여름 대회/ });
    expect(summer).toHaveTextContent('종료');
    expect(summer).toHaveTextContent('신청 완료 · 확정');
    expect(summer).toHaveTextContent('신청 5명');

    const spring = screen.getByRole('button', { name: /봄 소풍/ });
    expect(spring).toHaveTextContent('종료');
    expect(spring).not.toHaveTextContent('접수 마감');
    expect(spring).not.toHaveTextContent('진행 중');
  });

  it('지난 카드에서 연 상세는 뒤로 가기가 지난 일정으로 오게 표시해 둔다', async () => {
    await renderAt('/parent/schedule?view=past', PAST_PAYLOAD);

    fireEvent.click(screen.getByRole('button', { name: /여름 대회/ }));

    expect(mockNavigate).toHaveBeenCalledWith('/parent/events/21', { state: { back: '/parent/schedule?view=past' } });
  });

  it('지난 일정 보기에서는 링크가 "남은 일정 보기" 로 바뀌고 누르면 처음 보기로 간다', async () => {
    await renderAt('/parent/schedule?view=past', PAST_PAYLOAD);

    expect(screen.queryByRole('button', { name: '지난 일정 보기' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '남은 일정 보기' }));

    expect(mockNavigate).toHaveBeenCalledWith('/parent/schedule');
  });

  it('선생님 칩을 고르면 그 선생님의 지난 일정을 묻는다', async () => {
    await renderAt('/parent/schedule?view=past', PAST_PAYLOAD);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '박지우 선생님' }));
    });

    expect(fetchWithAuth).toHaveBeenLastCalledWith('/api/parent/events?teacherId=8&view=past');
  });

  it('지난 일정이 없으면 그렇게 말한다', async () => {
    await renderAt('/parent/schedule?view=past', { ...PAST_PAYLOAD, events: [] });

    expect(screen.getByText('지난 일정이 없어요')).toBeInTheDocument();
  });
});
