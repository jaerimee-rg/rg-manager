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

// 주소 검색 창·지도는 각자 테스트가 있다. 여기서는 "고르면 무엇이 저장되나" 만 본다.
jest.mock('../../../components/common/AddressSearchDialog', () => (props) => (props.open ? (
  <div role="dialog" aria-label="주소 검색">
    <span data-testid="search-query">{props.query}</span>
    <button
      type="button"
      onClick={() => props.onSelect({ address: '서울 송파구 올림픽로 424', placeName: '올림픽공원' })}
    >
      올림픽로 424 고르기
    </button>
  </div>
) : null));
jest.mock('../../../components/common/PlaceMap', () => (props) => (
  <div data-testid="map" data-lat={props.latitude} data-lng={props.longitude} />
));
jest.mock('../../../utils/kakaoMap', () => ({
  ...jest.requireActual('../../../utils/kakaoMap'),
  locateAddress: jest.fn()
}));

import { fetchWithAuth } from '../../../utils/api';
import { locateAddress } from '../../../utils/kakaoMap';
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
  locateAddress.mockResolvedValue({ ok: true, latitude: 37.5203, longitude: 127.1236 });
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

describe('EventForm — 주소 검색과 지도', () => {
  const searchAndPick = async (buttonName = '주소 검색') => {
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: buttonName }));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '올림픽로 424 고르기' }));
    });
  };

  const fillBasics = () => {
    fill('이벤트 이름', '가을 대회');
    fill('날짜', '2026-09-12');
  };

  it('주소를 고르면 주소와 지도가 보이고, 비어 있던 장소 이름은 건물명으로 채워져 좌표와 함께 저장된다', async () => {
    await renderForm();
    fillBasics();

    await searchAndPick();

    expect(screen.queryByRole('dialog', { name: '주소 검색' })).not.toBeInTheDocument();
    expect(screen.getByTestId('event-address')).toHaveTextContent('서울 송파구 올림픽로 424');
    expect(field('장소')).toHaveValue('올림픽공원');
    expect(locateAddress).toHaveBeenCalledWith('서울 송파구 올림픽로 424');
    expect(screen.getByTestId('map')).toHaveAttribute('data-lat', '37.5203');
    expect(screen.getByRole('button', { name: '주소 변경' })).toBeInTheDocument();

    await save();
    expect(savedPayload()).toMatchObject({
      location: '올림픽공원',
      address: '서울 송파구 올림픽로 424',
      latitude: 37.5203,
      longitude: 127.1236
    });
  });

  it('장소 이름을 이미 적었으면 덮어쓰지 않고, 그 이름으로 바로 검색한다', async () => {
    await renderForm();
    fillBasics();
    fill('장소', 'KSPO DOME');

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '주소 검색' }));
    });
    expect(screen.getByTestId('search-query')).toHaveTextContent('KSPO DOME');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '올림픽로 424 고르기' }));
    });

    expect(field('장소')).toHaveValue('KSPO DOME');
  });

  it('좌표를 찾는 동안에는 저장을 막는다 — 그 사이 저장하면 지도가 빠진다', async () => {
    let answer;
    locateAddress.mockImplementation(() => new Promise((resolve) => { answer = resolve; }));
    await renderForm();
    fillBasics();

    await searchAndPick();

    const saveButton = screen.getByRole('button', { name: '위치 찾는 중...' });
    expect(saveButton).toBeDisabled();
    expect(screen.getByText('지도에서 위치를 찾는 중')).toBeInTheDocument();

    await act(async () => {
      answer({ ok: true, latitude: 37.5203, longitude: 127.1236 });
    });
    expect(screen.getByRole('button', { name: '저장' })).toBeEnabled();

    await save();
    expect(savedPayload()).toMatchObject({ latitude: 37.5203, longitude: 127.1236 });
  });

  it('지도 키가 없으면 안내만 보이고, 주소는 좌표 없이 저장된다', async () => {
    locateAddress.mockResolvedValue({ ok: false, reason: 'no_key' });
    await renderForm();
    fillBasics();

    await searchAndPick();

    expect(screen.queryByTestId('map')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(/지도 키가 아직 설정되지 않아/);

    await save();
    expect(savedPayload()).toMatchObject({ address: '서울 송파구 올림픽로 424', latitude: null, longitude: null });
  });

  it('주소를 지우면 주소·좌표 없이 저장된다 (장소 이름은 남는다)', async () => {
    await renderForm();
    fillBasics();
    await searchAndPick();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '주소 지우기' }));
    });

    expect(screen.queryByTestId('event-address')).not.toBeInTheDocument();
    expect(screen.queryByTestId('map')).not.toBeInTheDocument();
    await save();
    expect(savedPayload()).toMatchObject({ location: '올림픽공원', address: null, latitude: null, longitude: null });
  });

  it('휴관일은 주소 칸이 없고, 골라 둔 주소도 보내지 않는다', async () => {
    await renderForm();
    fill('이벤트 이름', '추석 휴관');
    fill('날짜', '2026-09-25');
    await searchAndPick();

    await pickType('휴관일');

    expect(screen.queryByRole('button', { name: /주소 (검색|변경)/ })).not.toBeInTheDocument();
    await save();
    expect(savedPayload()).toMatchObject({ location: null, address: null, latitude: null, longitude: null });
  });

  it('수정할 때 저장된 주소와 지도를 그대로 보여 준다 (다시 찾지 않는다)', async () => {
    await renderForm({
      id: 9, type: 'special', title: '가을 러닝', date: '2026-10-10', location: '한강공원',
      address: '서울 영등포구 여의동로 330', latitude: 37.5284, longitude: 126.9327, isPublished: true, options: []
    });

    expect(screen.getByTestId('event-address')).toHaveTextContent('서울 영등포구 여의동로 330');
    expect(screen.getByTestId('map')).toHaveAttribute('data-lng', '126.9327');
    expect(locateAddress).not.toHaveBeenCalled();

    await save();
    expect(savedPayload()).toMatchObject({ address: '서울 영등포구 여의동로 330', latitude: 37.5284, longitude: 126.9327 });
  });

  it('좌표 없이 저장됐던 주소는(키가 없던 때) 수정 화면을 열 때 다시 찾아본다', async () => {
    await renderForm({
      id: 9, type: 'special', title: '가을 러닝', date: '2026-10-10', location: '한강공원',
      address: '서울 영등포구 여의동로 330', latitude: null, longitude: null, isPublished: true, options: []
    });

    expect(locateAddress).toHaveBeenCalledWith('서울 영등포구 여의동로 330');
    expect(screen.getByTestId('map')).toHaveAttribute('data-lat', '37.5203');
  });
});

describe('EventForm — 학부모에게 알림 보내기', () => {
  const notifyBox = () => screen.getByLabelText('학부모에게 알림 보내기');
  const fillNewEvent = async () => {
    await pickType('스페셜');
    fill('이벤트 이름', '가을 러닝');
    fill('날짜', '2026-10-24');
    fill('장소', '한강공원');
  };
  const existing = {
    id: 9, type: 'special', title: '가을 러닝', date: '2026-10-24', location: '한강공원', isPublished: true, options: []
  };

  it('새 이벤트는 체크된 채로 시작하고, 그대로 저장하면 알림을 요청한다', async () => {
    await renderForm();
    expect(notifyBox()).toBeChecked();

    await fillNewEvent();
    await save();

    expect(savedPayload().notifyParents).toBe(true);
  });

  it('체크를 풀고 저장하면 보내지 않는다', async () => {
    await renderForm();
    await fillNewEvent();
    fireEvent.click(notifyBox());
    await save();

    expect(savedPayload().notifyParents).toBe(false);
  });

  it('공개를 끄면 체크가 잠기고 보내지 않는다 — 비공개 일정은 학부모에게 보이지 않는다', async () => {
    await renderForm();
    await fillNewEvent();
    fireEvent.click(screen.getByLabelText('학부모에게 공개'));

    expect(notifyBox()).toBeDisabled();
    expect(notifyBox()).not.toBeChecked();
    expect(screen.getByText('공개해야 알림을 보낼 수 있어요')).toBeInTheDocument();

    await save();
    expect(savedPayload().notifyParents).toBe(false);
  });

  it('수정은 체크가 꺼진 채로 시작한다 — 고칠 때마다 다시 알리지 않게', async () => {
    await renderForm(existing);
    expect(notifyBox()).not.toBeChecked();

    await save();
    expect(savedPayload().notifyParents).toBe(false);
  });

  it('수정에서 체크하면 다시 알린다', async () => {
    await renderForm(existing);
    fireEvent.click(notifyBox());
    expect(screen.getByText('체크하고 저장하면 이 일정을 학부모에게 다시 알려요')).toBeInTheDocument();

    await save();
    expect(savedPayload().notifyParents).toBe(true);
  });

  it('보낸 결과는 이벤트 목록으로 넘겨 안내한다', async () => {
    fetchWithAuth.mockImplementation(() => ok({ id: 1, notification: { recipients: 3, sent: 4, failed: 0, removed: 0 } }));
    await renderForm();
    await fillNewEvent();
    await save();

    expect(mockNavigate).toHaveBeenCalledWith('/events', { state: { toast: '학부모 3명에게 알림을 보냈어요' } });
  });

  it('알림을 요청하지 않은 저장은 예전처럼 목록으로만 간다', async () => {
    await renderForm(existing);
    await save();

    expect(mockNavigate).toHaveBeenCalledWith('/events');
  });
});
