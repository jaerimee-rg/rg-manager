import React from 'react';
import { render, screen, act, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

jest.mock('../../../utils/api', () => ({ fetchWithAuth: jest.fn() }));

const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate
}));

// 상세 시트는 자기 API 를 따로 부른다 — 여기서는 어떤 이벤트를 열었는지와 콜백만 본다.
jest.mock('../EventDetailSheet', () => ({ eventId, onClose, onNotFound }) => (
  <div data-testid="sheet" data-event-id={eventId}>
    <button type="button" onClick={onClose}>시트 닫기</button>
    <button type="button" onClick={onNotFound}>시트 없음</button>
  </div>
));

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
    }
  ]
};

const ok = (body) => Promise.resolve({ ok: true, json: () => Promise.resolve(body) });

const renderAt = async (path) => {
  fetchWithAuth.mockImplementation(() => ok(PAYLOAD));
  await act(async () => {
    render(
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/parent/schedule" element={<ParentSchedule />} />
          <Route path="/parent/events/:eventId" element={<ParentSchedule />} />
        </Routes>
      </MemoryRouter>
    );
  });
};

beforeEach(() => jest.clearAllMocks());

describe('ParentSchedule — 공유 링크로 들어온 경우', () => {
  it('일정 주소로 들어오면 상세가 열려 있지 않다', async () => {
    await renderAt('/parent/schedule');

    expect(screen.getByText('가을 러닝')).toBeInTheDocument();
    expect(screen.queryByTestId('sheet')).not.toBeInTheDocument();
  });

  it('/parent/events/:id 로 들어오면 그 이벤트 상세가 바로 열린다', async () => {
    await renderAt('/parent/events/12');

    expect(screen.getByTestId('sheet')).toHaveAttribute('data-event-id', '12');
    // 목록도 그대로 뒤에 있다
    expect(screen.getByText('가을 러닝')).toBeInTheDocument();
  });

  it('상세를 닫으면 주소를 일정으로 되돌린다 (새로고침해도 다시 열리지 않게)', async () => {
    await renderAt('/parent/events/12');

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '시트 닫기' }));
    });

    expect(screen.queryByTestId('sheet')).not.toBeInTheDocument();
    expect(mockNavigate).toHaveBeenCalledWith('/parent/schedule', { replace: true });
  });

  it('없는 이벤트(비공개·연결 안 된 선생님)면 안내를 보여준다', async () => {
    await renderAt('/parent/events/999');

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '시트 없음' }));
    });

    expect(screen.queryByTestId('sheet')).not.toBeInTheDocument();
    expect(screen.getByText(/공유받은 이벤트를 찾을 수 없어요/)).toBeInTheDocument();
    expect(mockNavigate).toHaveBeenCalledWith('/parent/schedule', { replace: true });
  });

  it('숫자가 아닌 id 는 열지 않고 바로 안내한다', async () => {
    await renderAt('/parent/events/abc');

    expect(screen.queryByTestId('sheet')).not.toBeInTheDocument();
    expect(screen.getByText(/공유받은 이벤트를 찾을 수 없어요/)).toBeInTheDocument();
  });

  it('카드를 눌러 연 상세는 닫아도 주소를 바꾸지 않는다', async () => {
    await renderAt('/parent/schedule');

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /가을 러닝/ }));
    });
    expect(screen.getByTestId('sheet')).toHaveAttribute('data-event-id', '12');

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '시트 닫기' }));
    });
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});
