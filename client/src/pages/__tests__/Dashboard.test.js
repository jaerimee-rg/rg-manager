import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import Dashboard from '../Dashboard.jsx';
import { fetchWithAuth } from '../../utils/api';

jest.mock('../../utils/api', () => ({
  fetchWithAuth: jest.fn(),
}));

jest.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 1, username: 'admin', role: 'admin' } }),
}));

jest.mock('../../hooks/useMediaQuery', () => ({
  useIsMobile: () => false,
}));

// recharts는 jsdom에서 크기 계산이 불가능하므로 렌더링만 대체
jest.mock('recharts', () => {
  const Noop = ({ children }) => <div>{children}</div>;
  return {
    ResponsiveContainer: Noop,
    BarChart: Noop,
    Bar: () => null,
    XAxis: () => null,
    YAxis: () => null,
    CartesianGrid: () => null,
    Tooltip: () => null,
  };
});

const students = [
  { id: 1, name: '김하늘', birthdate: '2015-01-01', classIds: [1] },
  { id: 2, name: '이바다', birthdate: '2016-02-02', classIds: [2] },
];

const classes = [
  { id: 1, name: '초급반', schedule: '월 10:00' },
  { id: 2, name: '고급반', schedule: '수 11:00' },
];

const jsonResponse = (data) => ({
  ok: true,
  headers: { get: () => 'application/json' },
  json: () => Promise.resolve(data),
});

beforeEach(() => {
  fetchWithAuth.mockReset();
  fetchWithAuth.mockImplementation((url) => {
    if (url.startsWith('/api/students')) return Promise.resolve(jsonResponse(students));
    if (url.startsWith('/api/classes/reorder')) return Promise.resolve(jsonResponse({ message: 'ok' }));
    if (url.startsWith('/api/classes')) return Promise.resolve(jsonResponse(classes));
    if (url.startsWith('/api/attendance')) return Promise.resolve(jsonResponse([]));
    if (url.startsWith('/api/auth/users')) return Promise.resolve(jsonResponse([]));
    return Promise.resolve(jsonResponse({}));
  });
});

const renderDashboard = async () => {
  render(<Dashboard />);
  await screen.findByText('초급반');
};

describe('Dashboard - 수업별 출석 현황', () => {
  it('출석률 범례(80% 이상/50-80%/50% 미만/출석 없음)를 표시하지 않는다', async () => {
    await renderDashboard();
    expect(screen.queryByText('80% 이상')).not.toBeInTheDocument();
    expect(screen.queryByText('50-80%')).not.toBeInTheDocument();
    expect(screen.queryByText('50% 미만')).not.toBeInTheDocument();
    expect(screen.queryByText('출석 없음')).not.toBeInTheDocument();
  });

  it('수업별 출석 현황이 통계 카드보다 상단에 위치한다', async () => {
    await renderDashboard();
    const attendanceTitle = screen.getByText('수업별 출석 현황');
    const statsLabel = screen.getByText('전체 학생');
    // DOCUMENT_POSITION_FOLLOWING(4): statsLabel이 attendanceTitle 뒤에 위치
    expect(
      attendanceTitle.compareDocumentPosition(statsLabel) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
  });

  it('각 수업 행이 드래그 가능하다', async () => {
    await renderDashboard();
    const row = screen.getByText('초급반').closest('tr');
    expect(row).toHaveAttribute('draggable', 'true');
  });

  it('드래그 앤 드롭으로 수업 순서를 변경하면 reorder API를 호출한다', async () => {
    await renderDashboard();
    const firstRow = screen.getByText('초급반').closest('tr');
    const secondRow = screen.getByText('고급반').closest('tr');

    fireEvent.dragStart(firstRow, { dataTransfer: { effectAllowed: 'move' } });
    fireEvent.dragOver(secondRow);
    fireEvent.dragEnd(firstRow);

    await waitFor(() => {
      expect(fetchWithAuth).toHaveBeenCalledWith(
        '/api/classes/reorder',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ classIds: [2, 1] }),
        })
      );
    });
  });

  it('터치 드래그(모바일)로 수업 순서를 변경하면 reorder API를 호출한다', async () => {
    await renderDashboard();
    const firstHandle = screen.getByText('초급반').closest('tr').querySelector('td span');
    const secondRow = screen.getByText('고급반').closest('tr');

    // jsdom은 elementFromPoint를 지원하지 않으므로 손가락 아래 요소를 직접 지정
    document.elementFromPoint = jest.fn(() => secondRow);

    fireEvent.touchStart(firstHandle, { touches: [{ clientX: 10, clientY: 10 }] });
    fireEvent.touchMove(firstHandle, { touches: [{ clientX: 10, clientY: 60 }] });
    fireEvent.touchEnd(firstHandle);

    await waitFor(() => {
      expect(fetchWithAuth).toHaveBeenCalledWith(
        '/api/classes/reorder',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ classIds: [2, 1] }),
        })
      );
    });
  });

  it('터치로 누르면 해당 행이 선택 상태(하이라이트)가 된다', async () => {
    await renderDashboard();
    const firstRow = screen.getByText('초급반').closest('tr');
    const firstHandle = firstRow.querySelector('td span');

    fireEvent.touchStart(firstHandle, { touches: [{ clientX: 10, clientY: 10 }] });
    expect(firstRow.style.opacity).toBe('0.5');

    fireEvent.touchEnd(firstHandle);
    await waitFor(() => expect(firstRow.style.opacity).toBe('1'));
  });

  it('드래그 중 행 순서가 화면에서 즉시 바뀐다', async () => {
    await renderDashboard();
    const firstRow = screen.getByText('초급반').closest('tr');
    const secondRow = screen.getByText('고급반').closest('tr');

    fireEvent.dragStart(firstRow, { dataTransfer: { effectAllowed: 'move' } });
    fireEvent.dragOver(secondRow);

    const rows = screen.getAllByText(/초급반|고급반/).map(el => el.textContent);
    expect(rows).toEqual(['고급반', '초급반']);
  });
});
