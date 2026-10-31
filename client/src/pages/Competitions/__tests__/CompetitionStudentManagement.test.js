import React from 'react';
import { render, screen, act, fireEvent, waitFor, within } from '@testing-library/react';

const mockCompetition = { id: 3, name: 'Blossom Cup', date: '2026-11-01', location: '오산' };

jest.mock('../../../utils/api', () => ({ fetchWithAuth: jest.fn() }));
jest.mock('../../../context/AuthContext', () => ({ useAuth: () => ({ user: { id: 7 } }) }));
jest.mock('react-router-dom', () => ({
  useNavigate: () => jest.fn(),
  useLocation: () => ({ state: { competition: mockCompetition } })
}));

import { fetchWithAuth } from '../../../utils/api';
import CompetitionStudentManagement from '../CompetitionStudentManagement';

const HANEUL = {
  id: 1,
  name: '김하늘',
  birthdate: '2016-03-01',
  events: [],
  paid: true,
  coachFeePaid: false,
  photoFeePaid: false,
  videoFeePaid: true,
  costumeFeePaid: false,
  registrationOptions: [{ id: 'o1', label: '볼' }, { id: 'o2', label: '의상 대여' }],
  registrationCancelled: false
};

const ok = (body) => Promise.resolve({ ok: true, json: () => Promise.resolve(body) });

const renderPage = async (participants = [HANEUL], { paidResponse = () => ok({}) } = {}) => {
  fetchWithAuth.mockImplementation((url, options) => {
    if (options?.method === 'PUT') return paidResponse();
    if (url === '/api/students') return ok(participants);
    if (url.endsWith('/student-ids')) return ok(participants.map((p) => p.id));
    return ok(participants);
  });

  render(<CompetitionStudentManagement />);
  await screen.findByRole('checkbox', { name: `${participants[0].name} 참가비` });
};

const check = (name) => screen.getByRole('checkbox', { name });
const paidCalls = () => fetchWithAuth.mock.calls.filter(([, options]) => options?.method === 'PUT');

beforeEach(() => {
  fetchWithAuth.mockReset();
  window.scrollTo = jest.fn();
});

describe('참가 학생 카드 — 납부 체크', () => {
  it('참가비·출강비에 사진비·영상비·의상대여비까지 다섯 칸이 저장된 값대로 보인다', async () => {
    await renderPage();

    expect(check('김하늘 참가비')).toHaveAttribute('aria-checked', 'true');
    expect(check('김하늘 출강비')).toHaveAttribute('aria-checked', 'false');
    expect(check('김하늘 사진비')).toHaveAttribute('aria-checked', 'false');
    expect(check('김하늘 영상비')).toHaveAttribute('aria-checked', 'true');
    expect(check('김하늘 의상대여비')).toHaveAttribute('aria-checked', 'false');
  });

  it('신청 없이 직접 등록한 학생에게도 다섯 칸이 모두 있다', async () => {
    await renderPage([{ ...HANEUL, registrationOptions: [] }]);

    expect(screen.getAllByRole('checkbox', { name: /김하늘/ })).toHaveLength(5);
  });

  it('누른 칸만 저장하고 체크를 바꾼다', async () => {
    await renderPage();

    fireEvent.click(check('김하늘 사진비'));

    await waitFor(() => expect(check('김하늘 사진비')).toHaveAttribute('aria-checked', 'true'));
    expect(paidCalls()).toHaveLength(1);
    expect(paidCalls()[0][0]).toBe('/api/competitions/3/students/1/paid');
    expect(JSON.parse(paidCalls()[0][1].body)).toEqual({ photoFeePaid: true });
  });

  it('응답을 기다리는 사이 다른 칸을 눌러도 앞 칸의 값을 보내지 않는다', async () => {
    const pending = [];
    await renderPage([HANEUL], { paidResponse: () => new Promise((resolve) => pending.push(resolve)) });

    fireEvent.click(check('김하늘 사진비'));
    fireEvent.click(check('김하늘 의상대여비'));

    expect(paidCalls().map(([, options]) => JSON.parse(options.body))).toEqual([
      { photoFeePaid: true },
      { costumeFeePaid: true }
    ]);

    await act(async () => pending.forEach((respond) => respond({ ok: true })));
    expect(check('김하늘 사진비')).toHaveAttribute('aria-checked', 'true');
    expect(check('김하늘 의상대여비')).toHaveAttribute('aria-checked', 'true');
  });

  it('체크를 눌러도 종목 모달은 열리지 않는다', async () => {
    await renderPage();

    fireEvent.click(check('김하늘 영상비'));

    await waitFor(() => expect(check('김하늘 영상비')).toHaveAttribute('aria-checked', 'false'));
    expect(screen.queryByText('종목 및 수상 기록')).not.toBeInTheDocument();
  });

  it('저장에 실패하면 체크가 바뀌지 않는다', async () => {
    await renderPage([HANEUL], { paidResponse: () => Promise.resolve({ ok: false }) });

    fireEvent.click(check('김하늘 사진비'));

    await waitFor(() => expect(paidCalls()).toHaveLength(1));
    expect(check('김하늘 사진비')).toHaveAttribute('aria-checked', 'false');
  });
});

describe('참가 학생 카드 — 신청 항목', () => {
  const card = () => screen.getByText('김하늘').closest('.swipeable-card');

  it('학부모가 고른 항목을 카드에 보여준다', async () => {
    await renderPage();

    expect(within(card()).getByText('신청')).toBeInTheDocument();
    expect(within(card()).getByText('볼')).toBeInTheDocument();
    expect(within(card()).getByText('의상 대여')).toBeInTheDocument();
  });

  it('고른 항목이 없으면 신청 줄이 없다', async () => {
    await renderPage([{ ...HANEUL, registrationOptions: [] }]);

    expect(within(card()).queryByText('신청')).not.toBeInTheDocument();
  });

  it('선생님이 채운 종목 배지와 함께 보인다', async () => {
    await renderPage([{ ...HANEUL, events: [{ apparatus: 'ball', routine: '자유' }] }]);

    expect(within(card()).getByText('의상 대여')).toBeInTheDocument();
    expect(within(card()).getByText(/볼\s*\(자유\)/)).toBeInTheDocument();
  });

  it('확정 후 취소한 학생에게는 취소 표시가 붙는다', async () => {
    await renderPage([{ ...HANEUL, registrationCancelled: true }]);

    expect(within(card()).getByText('⚠ 신청 취소')).toBeInTheDocument();
    expect(within(card()).getByText('볼')).toBeInTheDocument();
  });
});
