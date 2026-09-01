import React from 'react';
import { render, screen, act, fireEvent } from '@testing-library/react';

jest.mock('../../../utils/api', () => ({
  fetchWithAuth: jest.fn()
}));

import { fetchWithAuth } from '../../../utils/api';
import EventRegistrations from '../EventRegistrations';

const DATA = {
  event: { id: 1, type: 'competition', title: '2026 서울시 대회', date: '2026-09-12' },
  activeCount: 2,
  summary: [{ id: 'o1', label: '볼', count: 2 }],
  registrations: [
    { id: 10, studentName: '김하늘', parentName: '하늘엄마', status: 'registered', options: [{ id: 'o1', label: '볼' }] },
    { id: 11, studentName: '박서연', parentName: '서연엄마', status: 'cancelled', options: [] }
  ]
};

const ok = (body) => Promise.resolve({ ok: true, json: () => Promise.resolve(body) });

const setWidth = (width) => {
  window.innerWidth = width;
};

const renderPanel = async (props = {}, body = DATA) => {
  fetchWithAuth.mockImplementation(() => ok(body));
  await act(async () => {
    render(<EventRegistrations eventId={1} onClose={() => {}} {...props} />);
  });
};

beforeEach(() => {
  jest.clearAllMocks();
  setWidth(1280);
  document.body.style.overflow = '';
});

describe('EventRegistrations', () => {
  it('신청한 학생을 보여준다', async () => {
    await renderPanel();

    expect(screen.getByText('2026 서울시 대회')).toBeInTheDocument();
    expect(screen.getByText('김하늘')).toBeInTheDocument();
    expect(screen.getByText('박서연')).toBeInTheDocument();
  });

  it('취소 숨기기를 켜면 취소된 신청은 빠진다', async () => {
    await renderPanel();

    await act(async () => {
      fireEvent.click(screen.getByLabelText('취소 숨기기'));
    });

    expect(screen.getByText('김하늘')).toBeInTheDocument();
    expect(screen.queryByText('박서연')).not.toBeInTheDocument();
  });

  // --- 좁은 화면: 목록 아래가 아니라 화면 전체로 -------------------------------

  it('목록 옆에 자리가 없으면 모달처럼 dialog 로 읽히고 배경 스크롤을 막는다', async () => {
    setWidth(390);
    await renderPanel();

    expect(screen.getByRole('dialog', { name: '2026 서울시 대회 신청 현황' })).toBeInTheDocument();
    expect(document.body.style.overflow).toBe('hidden');
  });

  it('전체 화면일 때 Esc 로 닫는다', async () => {
    setWidth(390);
    const onClose = jest.fn();
    await renderPanel({ onClose });

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(onClose).toHaveBeenCalled();
  });

  it('닫으면 배경 스크롤을 되돌린다', async () => {
    setWidth(390);
    fetchWithAuth.mockImplementation(() => ok(DATA));
    let view;
    await act(async () => {
      view = render(<EventRegistrations eventId={1} onClose={() => {}} />);
    });

    expect(document.body.style.overflow).toBe('hidden');
    view.unmount();
    expect(document.body.style.overflow).toBe('');
  });

  it('넓은 화면에서는 옆 패널이므로 dialog 도 스크롤 잠금도 없다', async () => {
    await renderPanel();

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(document.body.style.overflow).toBe('');
  });

  it('불러오는 중에도 닫기 버튼은 있다 — 전체 화면에서 빠져나갈 길이 필요하다', async () => {
    setWidth(390);
    fetchWithAuth.mockImplementation(() => new Promise(() => {}));
    await act(async () => {
      render(<EventRegistrations eventId={1} onClose={() => {}} />);
    });

    expect(screen.getByText('불러오는 중...')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '신청 현황 닫기' })).toBeInTheDocument();
  });
});
