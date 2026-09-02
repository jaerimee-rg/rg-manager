import React from 'react';
import { render, screen, act, fireEvent, within } from '@testing-library/react';

jest.mock('../../../utils/api', () => ({
  fetchWithAuth: jest.fn()
}));

const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate
}));

// 신청 현황 패널은 자체적으로 API 를 부르므로 여기서는 자리만 잡는다.
jest.mock('../EventRegistrations', () => ({ eventId }) => <div data-testid="registrations" data-event-id={eventId} />);

jest.mock('../../../utils/copyToClipboard', () => ({ copyToClipboard: jest.fn() }));

let mockMobile = false;
jest.mock('../../../hooks/useMediaQuery', () => ({
  useIsMobile: () => mockMobile
}));

import { fetchWithAuth } from '../../../utils/api';
import { copyToClipboard } from '../../../utils/copyToClipboard';
import EventList from '../EventList';

const TODAY = '2026-08-30';

const EVENTS = [
  {
    id: 1,
    type: 'competition',
    title: '2026 서울시 대회',
    date: '2026-09-12',
    location: '올림픽공원',
    isPublished: true,
    participantCount: 8,
    registrationCount: 5,
    competitionId: 11
  },
  {
    id: 2,
    type: 'closure',
    title: '추석 휴관',
    date: '2026-09-25',
    isPublished: false
  }
];

const ok = (body) => Promise.resolve({ ok: true, json: () => Promise.resolve(body) });

const renderList = async (events = EVENTS) => {
  fetchWithAuth.mockImplementation(() => ok(events));
  await act(async () => {
    render(<EventList />);
  });
};

beforeEach(() => {
  jest.clearAllMocks();
  mockMobile = false;
  copyToClipboard.mockResolvedValue(true);
  jest.useFakeTimers().setSystemTime(new Date(`${TODAY}T09:00:00`));
});

afterEach(() => {
  jest.useRealTimers();
});

describe('EventList', () => {
  it('이벤트를 표 하나로 보여준다 (표용·카드용을 따로 만들지 않는다)', async () => {
    await renderList();

    expect(screen.getByRole('columnheader', { name: '이벤트' })).toBeInTheDocument();
    expect(screen.getByText('2026 서울시 대회')).toBeInTheDocument();
    expect(screen.getByText('추석 휴관')).toBeInTheDocument();
  });

  it('모바일에서도 같은 표를 쓴다 — 쌓는 건 CSS 가 한다', async () => {
    mockMobile = true;
    await renderList();

    // 모바일 전용 카드 분기를 두지 않으므로 table 이 그대로 있다.
    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.getByText('2026 서울시 대회')).toBeInTheDocument();
  });

  it('각 셀에 컬럼 라벨을 붙여 모바일에서 무슨 값인지 알 수 있게 한다', async () => {
    await renderList();

    const cell = screen.getByRole('cell', { name: '올림픽공원' });
    expect(cell).toHaveAttribute('data-label', '장소');
  });

  it('공개·접수 상태를 배지로 보여준다', async () => {
    // 휴관일은 공개·접수 칸 자체가 없으므로 비공개 예시는 대회로 든다.
    await renderList([EVENTS[0], { ...EVENTS[0], id: 3, title: '비공개 대회', isPublished: false }]);

    expect(screen.getByText('공개')).toBeInTheDocument();
    expect(screen.getByText('비공개')).toBeInTheDocument();
  });

  it('휴관일에는 접수 배지를 붙이지 않는다', async () => {
    await renderList();

    // 접수 배지는 대회 행에만 하나 있다.
    expect(screen.getAllByText(/접수 중|마감/)).toHaveLength(1);
  });

  it('휴관일 행에서는 장소·참가 학생·신청·공개 접수 칸을 비워 둔다', async () => {
    await renderList();

    const closureRow = screen.getByText('추석 휴관').closest('tr');
    const blanks = within(closureRow)
      .getAllByRole('cell')
      .filter((cell) => cell.getAttribute('data-blank') === 'true')
      .map((cell) => cell.getAttribute('data-label'));

    expect(blanks).toEqual(['장소', '참가 학생', '신청', '공개 · 접수']);
    // "—" 로 채우지 않고 실제로 비운다 (모바일 카드에서는 CSS 가 줄째로 감춘다).
    expect(within(closureRow).queryByText('—')).not.toBeInTheDocument();
  });

  it('대회 행에서는 그 칸들을 그대로 보여준다', async () => {
    await renderList();

    const row = screen.getByText('2026 서울시 대회').closest('tr');
    expect(within(row).queryAllByRole('cell').filter((c) => c.hasAttribute('data-blank'))).toHaveLength(0);
    expect(within(row).getByText('올림픽공원')).toBeInTheDocument();
    expect(within(row).getByRole('button', { name: '5건' })).toBeInTheDocument();
  });

  it('종류 칩으로 거르면 그 종류만 다시 불러온다', async () => {
    await renderList();
    fetchWithAuth.mockClear();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '대회' }));
    });

    expect(fetchWithAuth).toHaveBeenCalledWith(expect.stringContaining('type=competition'));
  });

  it('다가오는 일정이 없고 지난 일정만 있으면 그 사실과 함께 보기 버튼을 준다', async () => {
    await renderList([{ ...EVENTS[0], id: 9, date: '2020-01-01', title: '지난 대회' }]);

    expect(screen.getByText('다가오는 일정이 없습니다')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /지난 일정 1건 보기/ }));
    });

    expect(screen.getByText('지난 대회')).toBeInTheDocument();
  });

  it('아무 이벤트도 없으면 첫 일정을 올리라고 안내한다', async () => {
    await renderList([]);

    expect(screen.getByText('등록된 이벤트가 없습니다')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('신청 건수를 누르면 신청 현황 패널이 열린다', async () => {
    await renderList();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '5건' }));
    });

    expect(screen.getByTestId('registrations')).toBeInTheDocument();
  });

  it('수정을 누르면 그 이벤트를 들고 편집 화면으로 간다', async () => {
    await renderList();

    const row = screen.getByText('2026 서울시 대회').closest('tr');
    await act(async () => {
      fireEvent.click(within(row).getByRole('button', { name: '수정' }));
    });

    expect(mockNavigate).toHaveBeenCalledWith('/events/edit', { state: { event: EVENTS[0] } });
  });

  it('대회가 아닌 이벤트에는 참가 학생 버튼이 없다', async () => {
    await renderList();

    const closureRow = screen.getByText('추석 휴관').closest('tr');
    expect(within(closureRow).queryByRole('button', { name: '참가 학생' })).not.toBeInTheDocument();
  });

  // --- 공유 링크 --------------------------------------------------------------

  describe('공유 링크', () => {
    it('공유를 누르면 학부모용 이벤트 주소를 복사하고 알려 준다', async () => {
      await renderList();

      const row = screen.getByText('2026 서울시 대회').closest('tr');
      await act(async () => {
        fireEvent.click(within(row).getByRole('button', { name: '공유' }));
      });

      expect(copyToClipboard).toHaveBeenCalledWith(`${window.location.origin}/parent/events/1`);
      expect(screen.getByRole('status')).toHaveTextContent('공유 링크를 복사했어요');
    });

    it('복사가 막힌 환경이면 링크 자체를 보여준다', async () => {
      copyToClipboard.mockResolvedValue(false);
      await renderList();

      const row = screen.getByText('2026 서울시 대회').closest('tr');
      await act(async () => {
        fireEvent.click(within(row).getByRole('button', { name: '공유' }));
      });

      expect(screen.getByRole('status')).toHaveTextContent('/parent/events/1');
    });

    it('알림은 잠시 뒤 사라진다', async () => {
      await renderList();

      const row = screen.getByText('2026 서울시 대회').closest('tr');
      await act(async () => {
        fireEvent.click(within(row).getByRole('button', { name: '공유' }));
      });
      expect(screen.getByRole('status')).toBeInTheDocument();

      await act(async () => {
        jest.advanceTimersByTime(3000);
      });
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
    });

    it('비공개 이벤트는 공유할 수 없다 — 학부모에게는 보이지 않는 이벤트라서', async () => {
      await renderList();

      // 추석 휴관은 isPublished: false
      const closureRow = screen.getByText('추석 휴관').closest('tr');
      const button = within(closureRow).getByRole('button', { name: '공유' });
      expect(button).toBeDisabled();
      expect(button).toHaveAttribute('title', '공개한 이벤트만 공유할 수 있어요');
      expect(copyToClipboard).not.toHaveBeenCalled();
    });

    it('공유를 눌러도 신청 현황이 같이 열리지는 않는다 (행 클릭과 겹치지 않는다)', async () => {
      await renderList();

      const row = screen.getByText('2026 서울시 대회').closest('tr');
      await act(async () => {
        fireEvent.click(within(row).getByRole('button', { name: '공유' }));
      });

      expect(screen.queryByTestId('registrations')).not.toBeInTheDocument();
    });
  });

  // --- 이벤트를 누르면 누가 신청했는지 --------------------------------------------

  describe('행 클릭', () => {
    it('이벤트 행을 누르면 그 이벤트의 신청 현황(학생 명단)이 열린다', async () => {
      await renderList();

      await act(async () => {
        fireEvent.click(screen.getByText('2026 서울시 대회').closest('tr'));
      });

      expect(screen.getByTestId('registrations')).toHaveAttribute('data-event-id', '1');
    });

    it('같은 행을 다시 누르면 닫힌다', async () => {
      await renderList();
      const row = screen.getByText('2026 서울시 대회').closest('tr');

      await act(async () => {
        fireEvent.click(row);
      });
      await act(async () => {
        fireEvent.click(row);
      });

      expect(screen.queryByTestId('registrations')).not.toBeInTheDocument();
    });

    it('휴관일 행은 신청이 없으니 열지 않는다', async () => {
      await renderList();

      await act(async () => {
        fireEvent.click(screen.getByText('추석 휴관').closest('tr'));
      });

      expect(screen.queryByTestId('registrations')).not.toBeInTheDocument();
    });

    it('행 안의 수정·삭제 버튼은 신청 현황을 열지 않는다', async () => {
      await renderList();

      const row = screen.getByText('2026 서울시 대회').closest('tr');
      await act(async () => {
        fireEvent.click(within(row).getByRole('button', { name: '수정' }));
      });

      expect(mockNavigate).toHaveBeenCalled();
      expect(screen.queryByTestId('registrations')).not.toBeInTheDocument();
    });

    it('신청 건수 버튼은 예전처럼 열되, 행 클릭과 겹쳐 도로 닫히지 않는다', async () => {
      await renderList();

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: '5건' }));
      });

      expect(screen.getByTestId('registrations')).toHaveAttribute('data-event-id', '1');
    });
  });
});
