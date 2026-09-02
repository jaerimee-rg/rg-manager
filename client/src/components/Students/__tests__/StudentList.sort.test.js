import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import StudentList from '../StudentList.jsx';
import { fetchWithAuth } from '../../../utils/api';

const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate
}));

jest.mock('../../../utils/api', () => ({
  fetchWithAuth: jest.fn()
}));

// 정렬 규칙은 데스크탑 표에서 확인한다 (모바일 카드도 같은 sortedStudents 를 쓴다).
jest.mock('../../../hooks/useMediaQuery', () => ({
  useIsMobile: () => false
}));

// 일부러 가나다순이 아닌 순서로 내려준다 — 화면이 스스로 정렬하는지 보기 위해.
const students = [
  { id: 1, name: '한별', birthdate: '2015-03-03', classIds: [1] },
  { id: 2, name: '강가온', birthdate: '2016-05-05', classIds: [1] },
  { id: 3, name: '박다은', birthdate: '2014-01-01', classIds: [2] },
  { id: 4, name: '가나린', birthdate: '2017-07-07', classIds: [] }
];

const classes = [
  { id: 1, name: '초급반' },
  { id: 2, name: '고급반' }
];

const jsonResponse = (data) => ({
  ok: true,
  headers: { get: () => 'application/json' },
  json: () => Promise.resolve(data)
});

/** 표에 그려진 학생 이름을 위에서부터 */
const renderedNames = () =>
  within(document.querySelector('tbody'))
    .getAllByRole('row')
    .map((row) => row.querySelector('td').textContent);

beforeEach(() => {
  fetchWithAuth.mockReset();
  fetchWithAuth.mockImplementation((url) => {
    if (url === '/api/students') return Promise.resolve(jsonResponse(students));
    if (url === '/api/classes') return Promise.resolve(jsonResponse(classes));
    return Promise.resolve(jsonResponse({}));
  });
});

describe('학생 목록 기본 정렬 — 이름 가나다순', () => {
  it('서버가 준 순서와 상관없이 처음부터 가나다순으로 보인다', async () => {
    render(<StudentList />);
    await screen.findByText('가나린');
    expect(renderedNames()).toEqual(['가나린', '강가온', '박다은', '한별']);
  });

  it('이름 열에 오름차순 표시(▲)가 처음부터 켜져 있다', async () => {
    render(<StudentList />);
    await screen.findByText('가나린');
    const nameHeader = screen.getAllByText(/이름/)[0].closest('.sortable');
    expect(nameHeader).toHaveClass('active');
    expect(nameHeader.querySelector('.sort-icon').textContent).toBe('▲');
  });

  it('이름을 한 번 누르면 내림차순으로 뒤집힌다', async () => {
    render(<StudentList />);
    await screen.findByText('가나린');
    fireEvent.click(screen.getAllByText(/이름/)[0].closest('.sortable'));
    expect(renderedNames()).toEqual(['한별', '박다은', '강가온', '가나린']);
  });

  it('다른 기준으로 정렬해도 이름 정렬로 돌아올 수 있다', async () => {
    render(<StudentList />);
    await screen.findByText('가나린');
    fireEvent.click(screen.getByText(/생년월일/).closest('.sortable'));
    expect(renderedNames()).toEqual(['박다은', '한별', '강가온', '가나린']);

    fireEvent.click(screen.getAllByText(/이름/)[0].closest('.sortable'));
    expect(renderedNames()).toEqual(['가나린', '강가온', '박다은', '한별']);
  });

  it('검색으로 걸러도 남은 학생은 가나다순을 유지한다', async () => {
    render(<StudentList />);
    await screen.findByText('가나린');
    fireEvent.change(screen.getByPlaceholderText('이름 검색'), { target: { value: 'ㄱ' } });
    expect(renderedNames()).toEqual(['가나린', '강가온']);
  });
});
