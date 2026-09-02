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
