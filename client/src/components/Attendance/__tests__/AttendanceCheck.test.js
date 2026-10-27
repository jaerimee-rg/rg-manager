import React from 'react';
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react';
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

const jsonResponse = (data, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
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

describe('AttendanceCheck - 보강 출석 여러 명 한 번에 추가', () => {
  let posted;
  let attendanceRecords;
  let makeupResponse;

  beforeEach(() => {
    posted = [];
    attendanceRecords = [];
    makeupResponse = null;
    fetchWithAuth.mockReset();
    fetchWithAuth.mockImplementation((url, options) => {
      if (url === '/api/students') return Promise.resolve(jsonResponse(students));
      if (url === '/api/classes') return Promise.resolve(jsonResponse(classes));
      if (url.startsWith('/api/attendance/date/')) return Promise.resolve(jsonResponse(attendanceRecords));
      if (url === '/api/attendance/makeup') {
        const body = JSON.parse(options.body);
        posted.push(body);
        return Promise.resolve(makeupResponse || jsonResponse({ added: body.studentIds, skipped: [] }, 201));
      }
      return Promise.resolve(jsonResponse({}));
    });
  });

  const openDialog = async () => {
    fireEvent.click(screen.getByRole('button', { name: '+ 보강 출석 추가' }));
    return screen.findByRole('dialog', { name: '보강 출석 추가' });
  };

  const chooseClass = (dialog, classId) => {
    fireEvent.change(within(dialog).getByRole('combobox', { name: /수업/ }), { target: { value: String(classId) } });
  };

  it('학생을 여러 명 골라 요청 한 번으로 추가하고 결과를 알려 준다', async () => {
    render(<AttendanceCheck />);
    await screen.findByRole('option', { name: /초급반/ });
    const dialog = await openDialog();

    chooseClass(dialog, 1);
    fireEvent.click(within(dialog).getByRole('checkbox', { name: '박구름' }));
    fireEvent.click(within(dialog).getByRole('checkbox', { name: '김하늘' }));

    expect(within(dialog).getByText('2명 선택')).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: '2명 추가' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(posted).toHaveLength(1);
    expect(posted[0]).toEqual({
      date: new Date().toISOString().split('T')[0],
      classId: 1,
      studentIds: [3, 1], // 고른 순서
    });
    expect(await screen.findByRole('status')).toHaveTextContent('보강 출석 2명을 추가했어요.');
  });

  it('수업과 학생을 고르기 전에는 추가 버튼이 잠겨 있다', async () => {
    render(<AttendanceCheck />);
    await screen.findByRole('option', { name: /초급반/ });
    const dialog = await openDialog();

    expect(within(dialog).getByRole('button', { name: '추가' })).toBeDisabled();
    fireEvent.click(within(dialog).getByRole('checkbox', { name: '김하늘' }));
    expect(within(dialog).getByRole('button', { name: '1명 추가' })).toBeDisabled(); // 수업이 아직 없다

    chooseClass(dialog, 2);
    expect(within(dialog).getByRole('button', { name: '1명 추가' })).toBeEnabled();
  });

  it('보고 있는 수업이 있으면 그 수업으로 시작한다', async () => {
    render(<AttendanceCheck />);
    await screen.findByRole('option', { name: /고급반/ });
    fireEvent.change(screen.getAllByRole('combobox')[0], { target: { value: '2' } });
    await screen.findByText('박구름');
    const dialog = await openDialog();
    expect(within(dialog).getByRole('combobox', { name: /수업/ })).toHaveValue('2');
  });

  it('그 수업에 이미 출석한 학생은 고를 수 없고 "이미 출석" 이 붙는다', async () => {
    attendanceRecords = [{ studentId: 2, classId: 2 }];
    render(<AttendanceCheck />);
    await screen.findByRole('option', { name: /초급반/ });
    const dialog = await openDialog();

    const 이바다 = within(dialog).getByRole('checkbox', { name: '이바다' });
    await waitFor(() => expect(이바다).toBeEnabled()); // 수업을 안 골랐으면 막지 않는다

    chooseClass(dialog, 2);
    expect(이바다).toBeDisabled();
    expect(이바다).not.toBeChecked();
    expect(이바다).toHaveAccessibleDescription(/이미 출석/);

    chooseClass(dialog, 1); // 다른 수업이면 다시 고를 수 있다
    expect(이바다).toBeEnabled();
  });

  it('검색해도 고른 학생은 남아 있고, 태그의 X 로 뺄 수 있다', async () => {
    render(<AttendanceCheck />);
    await screen.findByRole('option', { name: /초급반/ });
    const dialog = await openDialog();
    chooseClass(dialog, 1);

    fireEvent.click(within(dialog).getByRole('checkbox', { name: '김하늘' }));
    fireEvent.change(within(dialog).getByRole('searchbox', { name: /학생/ }), { target: { value: '구름' } });

    expect(within(dialog).queryByRole('checkbox', { name: '김하늘' })).not.toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('checkbox', { name: '박구름' }));

    const picked = within(dialog).getByRole('group', { name: '고른 학생' });
    expect(picked).toHaveTextContent('2명 선택');
    expect(picked).toHaveTextContent('김하늘');

    fireEvent.click(within(dialog).getByRole('button', { name: '김하늘 빼기' }));
    expect(within(dialog).getByRole('button', { name: '1명 추가' })).toBeEnabled();
    expect(picked).not.toHaveTextContent('김하늘');
  });

  it('검색 결과가 없으면 그렇게 알려 준다', async () => {
    render(<AttendanceCheck />);
    await screen.findByRole('option', { name: /초급반/ });
    const dialog = await openDialog();
    fireEvent.change(within(dialog).getByRole('searchbox', { name: /학생/ }), { target: { value: '없는이름' } });
    expect(within(dialog).getByText('검색 결과가 없어요')).toBeInTheDocument();
  });

  it('서버가 거절하면 대화상자에 남아 이유를 보여 주고, 고른 학생도 그대로다', async () => {
    makeupResponse = jsonResponse({ error: '학생을 찾을 수 없습니다.' }, 404);
    render(<AttendanceCheck />);
    await screen.findByRole('option', { name: /초급반/ });
    const dialog = await openDialog();
    chooseClass(dialog, 1);
    fireEvent.click(within(dialog).getByRole('checkbox', { name: '김하늘' }));
    jest.spyOn(console, 'error').mockImplementation(() => {});

    fireEvent.click(within(dialog).getByRole('button', { name: '1명 추가' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('학생을 찾을 수 없습니다.');
    expect(screen.getByRole('dialog', { name: '보강 출석 추가' })).toBeInTheDocument();
    expect(within(dialog).getByRole('checkbox', { name: '김하늘' })).toBeChecked();
    console.error.mockRestore();
  });

  it('보고 있는 날·수업에 추가하면 출석 수에 더하고, 저장하지 않은 체크는 지우지 않는다', async () => {
    render(<AttendanceCheck />);
    await selectClass(1);

    fireEvent.click(screen.getByText('김하늘')); // 저장하지 않은 체크
    expect(screen.getByText('변경사항 있음')).toBeInTheDocument();

    const dialog = await openDialog();
    fireEvent.click(within(dialog).getByRole('checkbox', { name: '박구름' }));
    fireEvent.click(within(dialog).getByRole('button', { name: '1명 추가' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    expect(screen.getByText('변경사항 있음')).toBeInTheDocument();
    expect(screen.getByText((_, el) => el?.tagName === 'SPAN' && el.textContent === '출석: 2 / 2명')).toBeInTheDocument();
    const [kim] = screen.getAllByRole('checkbox');
    expect(kim).toBeChecked();
  });

  it('일부가 이미 출석해 건너뛰었으면 함께 알린다', async () => {
    makeupResponse = jsonResponse({ added: [1], skipped: [3] }, 201);
    render(<AttendanceCheck />);
    await screen.findByRole('option', { name: /초급반/ });
    const dialog = await openDialog();
    chooseClass(dialog, 1);
    fireEvent.click(within(dialog).getByRole('checkbox', { name: '김하늘' }));
    fireEvent.click(within(dialog).getByRole('checkbox', { name: '박구름' }));
    fireEvent.click(within(dialog).getByRole('button', { name: '2명 추가' }));

    expect(await screen.findByRole('status')).toHaveTextContent('보강 출석 1명을 추가했어요. 이미 출석한 1명은 건너뛰었어요.');
  });
});
