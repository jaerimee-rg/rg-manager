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
      hasOptions: false, optionCount: 0, children: [{ childId: 1, childName: '김민서', status: null, optionIds: [], canRegister: true }]
    },
    {
      id: 13, type: 'closure', title: '추석 휴관', date: '2026-10-03', teacherId: 7,
      hasOptions: false, optionCount: 0, children: []
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

  it('휴관일 카드도 같은 상세 페이지로 간다', async () => {
    await renderSchedule();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /추석 휴관/ }));
    });

    expect(mockNavigate).toHaveBeenCalledWith('/parent/events/13');
  });
});
