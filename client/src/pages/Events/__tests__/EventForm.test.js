import React from 'react';
import { render, screen, act, fireEvent } from '@testing-library/react';

jest.mock('../../../utils/api', () => ({
  fetchWithAuth: jest.fn()
}));

const mockNavigate = jest.fn();
let mockLocation = { state: null };
jest.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
  useLocation: () => mockLocation
}));

// 옵션 편집기는 자체 테스트가 있다 — 여기서는 자리만 잡는다.
jest.mock('../OptionsEditor', () => () => <div data-testid="options" />);

import { fetchWithAuth } from '../../../utils/api';
import EventForm from '../EventForm';

const ok = (body) => Promise.resolve({ ok: true, json: () => Promise.resolve(body) });

const renderForm = async (editing = null) => {
  mockLocation = { state: editing ? { event: editing } : null };
  await act(async () => {
    render(<EventForm />);
  });
};

const pickType = async (label) => {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: new RegExp(label) }));
  });
};

// "시간" 과 "마감 시간" 처럼 접두사가 겹치는 라벨이 있어서 앞부분으로만 정확히 고른다.
// selector 로 입력칸만 본다 — 옆에 붙는 "○○ 지우기" 버튼과 헷갈리지 않게.
const labelOf = (name) => new RegExp(`^${name}`);
const field = (name) => screen.getByLabelText(labelOf(name), { selector: 'input' });
const noField = (name) =>
  expect(screen.queryByLabelText(labelOf(name), { selector: 'input' })).not.toBeInTheDocument();

const fill = (name, value) => {
  fireEvent.change(field(name), { target: { value } });
};

/** "종료일 지우기" 같은 × 버튼 */
const clearButton = (name) => screen.queryByRole('button', { name: `${name} 지우기` });
const clear = async (name) => {
  await act(async () => {
    fireEvent.click(clearButton(name));
  });
};

const save = async () => {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: '저장' }));
  });
};

/** 마지막 저장 요청의 body */
const savedPayload = () => JSON.parse(fetchWithAuth.mock.calls.at(-1)[1].body);

beforeEach(() => {
  jest.clearAllMocks();
  fetchWithAuth.mockImplementation(() => ok({ id: 1 }));
});

describe('EventForm — 휴관일은 날짜만 입력한다', () => {
  it('휴관일을 고르면 시간·장소 칸이 사라진다', async () => {
    await renderForm();

    // 기본값(대회)에는 시간·장소가 있다
    expect(field('시간')).toBeInTheDocument();
    expect(field('장소')).toBeInTheDocument();

    await pickType('휴관일');

    noField('시간');
    noField('장소');
  });

  it('휴관일에도 날짜와 종료일은 남는다 (며칠짜리 휴관을 위해)', async () => {
    await renderForm();
    await pickType('휴관일');

    expect(field('날짜')).toBeInTheDocument();
    expect(field('종료일')).toBeInTheDocument();
  });

  it('휴관일은 마감 날짜·시간 칸도 없다', async () => {
    await renderForm();
    await pickType('휴관일');

    noField('마감 날짜');
    noField('마감 시간');
  });

  it('휴관일을 저장하면 시간 없이(null) 보낸다', async () => {
    await renderForm();

    // 대회로 시간을 먼저 넣어 두고 휴관일로 바꾼다 — 남은 값이 따라가면 안 된다
    fill('시간', '14:30');
    await pickType('휴관일');

    fill('이벤트 이름', '여름 휴관');
    fill('날짜', '2026-08-25');
    await save();

    expect(savedPayload()).toMatchObject({
      type: 'closure',
      title: '여름 휴관',
      date: '2026-08-25',
      startTime: null,
      location: null
    });
  });

  it('휴관일이 아니면 입력한 시간을 그대로 보낸다', async () => {
    await renderForm();

    fill('이벤트 이름', '가을 대회');
    fill('날짜', '2026-09-12');
    fill('시간', '14:30');
    fill('장소', '올림픽공원');
    await save();

    expect(savedPayload()).toMatchObject({ startTime: '14:30', location: '올림픽공원' });
  });

  it('시간이 저장돼 있던 옛 휴관일을 수정해도 시간 칸은 뜨지 않고 null 로 지워진다', async () => {
    await renderForm({
      id: 9,
      type: 'closure',
      title: '추석 휴관',
      date: '2026-09-25',
      startTime: '09:00',
      isPublished: true
    });

    noField('시간');

    await save();

    expect(savedPayload()).toMatchObject({ type: 'closure', startTime: null });
  });
});

// 모바일 날짜·시간 피커에는 "비우기" 가 없어서, 한 번 고른 값을 되돌릴 방법이 없었다.
// 비울 수 있어야 "종일"·"마감 없음"·"하루짜리" 로 돌아갈 수 있다.
describe('EventForm — 정해 둔 날짜·시간을 다시 비운다', () => {
  it('값이 없는 동안에는 지우기 버튼이 뜨지 않는다', async () => {
    await renderForm();

    expect(clearButton('종료일')).not.toBeInTheDocument();
    expect(clearButton('시간')).not.toBeInTheDocument();
    expect(clearButton('마감 날짜')).not.toBeInTheDocument();
    expect(clearButton('마감 시간')).not.toBeInTheDocument();
  });

  it('시간을 지우면 종일(null)로 저장된다', async () => {
    await renderForm({
      id: 9, type: 'special', title: '가을 발표회', date: '2026-09-12',
      startTime: '14:30', location: '체육관', isPublished: true
    });

    expect(field('시간')).toHaveValue('14:30');
    await clear('시간');

    expect(field('시간')).toHaveValue('');
    await save();
    expect(savedPayload()).toMatchObject({ startTime: null });
  });

  it('종료일을 지우면 하루짜리(null)로 저장된다', async () => {
    await renderForm({
      id: 9, type: 'special', title: '여름 캠프', date: '2026-08-25',
      endDate: '2026-08-27', location: '체육관', isPublished: true
    });

    await clear('종료일');

    expect(field('종료일')).toHaveValue('');
    await save();
    expect(savedPayload()).toMatchObject({ endDate: null });
  });

  it('마감 날짜를 지우면 마감 시간도 함께 비워져 마감 없음(null)으로 저장된다', async () => {
    await renderForm({
      id: 9, type: 'competition', title: '가을 대회', date: '2026-09-12',
      location: '올림픽공원', isPublished: true,
      registrationDeadline: '2026-09-01T18:00:00+09:00'
    });

    expect(field('마감 날짜')).toHaveValue('2026-09-01');
    expect(field('마감 시간')).toHaveValue('18:00');

    await clear('마감 날짜');

    // 시간만 남으면 "접수 마감 날짜를 선택해주세요" 로 저장이 막힌다 — 같이 비운다.
    expect(field('마감 날짜')).toHaveValue('');
    expect(field('마감 시간')).toHaveValue('');

    await save();
    expect(savedPayload()).toMatchObject({ registrationDeadline: null });
  });

  it('마감 시간만 지우면 날짜는 남고 그날 끝(23:59)이 된다', async () => {
    await renderForm({
      id: 9, type: 'competition', title: '가을 대회', date: '2026-09-12',
      location: '올림픽공원', isPublished: true,
      registrationDeadline: '2026-09-01T18:00:00+09:00'
    });

    await clear('마감 시간');

    expect(field('마감 날짜')).toHaveValue('2026-09-01');
    expect(field('마감 시간')).toHaveValue('');

    await save();
    expect(savedPayload()).toMatchObject({ registrationDeadline: '2026-09-01T23:59:00+09:00' });
  });

  it('새로 등록할 때 잘못 고른 시간도 지울 수 있다', async () => {
    await renderForm();

    fill('이벤트 이름', '가을 대회');
    fill('날짜', '2026-09-12');
    fill('장소', '올림픽공원');
    fill('시간', '14:30');

    await clear('시간');

    await save();
    expect(savedPayload()).toMatchObject({ startTime: null });
  });
});

describe('EventForm — 화면 구성', () => {
  it('사진·영상 공유 섹션은 더 이상 붙지 않는다', async () => {
    await renderForm({
      id: 9,
      type: 'competition',
      title: '가을 대회',
      date: '2026-09-12',
      location: '올림픽공원',
      isPublished: true
    });

    expect(screen.queryByText(/사진 · 영상/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /사진·영상 올리기/ })).not.toBeInTheDocument();
  });

  it('공개·접수 설정은 본문과 나란히 놓을 수 있게 따로 묶여 있다', async () => {
    await renderForm();

    // 데스크탑 2열은 CSS 가 만든다 — JSX 는 두 덩어리로 나뉘어 있기만 하면 된다.
    const side = screen.getByRole('heading', { name: '공개 · 접수' }).closest('.event-form__side');
    expect(side).not.toBeNull();
    expect(side).toContainElement(screen.getByLabelText('학부모에게 공개'));
    expect(side).toContainElement(screen.getByLabelText(/^마감 날짜/));
    expect(side).not.toContainElement(screen.getByLabelText(/^이벤트 이름/));
  });
});
