import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import AttendanceCheck from '../AttendanceCheck.jsx';
import { fetchWithAuth } from '../../../utils/api';

jest.mock('../../../utils/api', () => ({
  fetchWithAuth: jest.fn(),
}));

jest.mock('../../../context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 1, username: 'admin', role: 'admin' } }),
}));

jest.mock('../../../hooks/useMediaQuery', () => ({
  useIsMobile: () => false,
}));

const students = [
  { id: 1, name: '김하늘', birthdate: '2015-01-01', classIds: [1] },
  { id: 2, name: '이바다', birthdate: '2016-02-02', classIds: [1] },
  { id: 3, name: '박구름', birthdate: '2014-03-03', classIds: [2] },
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

const selectClass = async (classId) => {
  await screen.findByRole('option', { name: /초급반/ });
  const select = screen.getAllByRole('combobox')[0];
  fireEvent.change(select, { target: { value: String(classId) } });
  await screen.findByText('김하늘');
};

describe('AttendanceCheck - 전체 출석 버튼', () => {
  beforeEach(() => {
    fetchWithAuth.mockReset();
    fetchWithAuth.mockImplementation((url) => {
      if (url === '/api/students') return Promise.resolve(jsonResponse(students));
      if (url === '/api/classes') return Promise.resolve(jsonResponse(classes));
      if (url.startsWith('/api/attendance/date/')) return Promise.resolve(jsonResponse([]));
      return Promise.resolve(jsonResponse({}));
    });
  });

  it('수업을 선택하기 전에는 전체 출석 버튼이 보이지 않는다', async () => {
    render(<AttendanceCheck />);
    await screen.findByText('수업을 선택하세요', { selector: '.empty-state-title' });
    expect(screen.queryByTestId('toggle-all-attendance')).not.toBeInTheDocument();
  });

  it('전체 출석 클릭 시 해당 수업의 모든 학생이 체크된다', async () => {
    render(<AttendanceCheck />);
    await selectClass(1);

    const button = screen.getByTestId('toggle-all-attendance');
    expect(button).toHaveTextContent('전체 출석');

    fireEvent.click(button);

    const checkboxes = screen.getAllByRole('checkbox');
    expect(checkboxes).toHaveLength(2); // classId 1 학생만 표시
    checkboxes.forEach((cb) => expect(cb).toBeChecked());
    expect(button).toHaveTextContent('전체 해제');
    expect(screen.getByText('변경사항 있음')).toBeInTheDocument();
  });

  it('전체 해제 클릭 시 모든 학생 체크가 해제된다', async () => {
    render(<AttendanceCheck />);
    await selectClass(1);

    const button = screen.getByTestId('toggle-all-attendance');
    fireEvent.click(button); // 전체 출석
    fireEvent.click(button); // 전체 해제

    screen.getAllByRole('checkbox').forEach((cb) => expect(cb).not.toBeChecked());
    expect(button).toHaveTextContent('전체 출석');
  });

  it('일부만 체크된 상태에서 전체 출석 클릭 시 전원이 체크된다', async () => {
    render(<AttendanceCheck />);
    await selectClass(1);

    // 학생 한 명만 개별 체크
    fireEvent.click(screen.getByText('김하늘'));
    const button = screen.getByTestId('toggle-all-attendance');
    expect(button).toHaveTextContent('전체 출석');

    fireEvent.click(button);

    screen.getAllByRole('checkbox').forEach((cb) => expect(cb).toBeChecked());
    expect(button).toHaveTextContent('전체 해제');
  });
});
