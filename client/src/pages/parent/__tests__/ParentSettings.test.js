import React from 'react';
import { render, screen, act, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

jest.mock('../../../utils/api', () => ({ fetchWithAuth: jest.fn() }));
jest.mock('../../../context/AuthContext', () => ({ useAuth: () => ({ logout: jest.fn() }) }));
// 이 화면의 다른 카드들은 각자 테스트가 있다 — 여기서는 "내 아이" 만 본다.
jest.mock('../ChildFaceCard', () => () => null);
jest.mock('../EventPushCard', () => () => null);
jest.mock('../../../components/common/RoleSwitcher', () => () => null);

import { fetchWithAuth } from '../../../utils/api';
import ParentSettings, { deleteChildMessage } from '../ParentSettings';

const TEACHERS = [
  { id: 12, name: '최재웅', since: '2026-08-30' },
  { id: 9, name: '이재림', since: '2026-08-30' }
];

// 선생님이 손으로 연결해 입력한 이름(이쵸파)과 학생 이름(윤해서)이 다른 아이
const CHOPA = {
  id: 2, childName: '이쵸파', childBirthdate: '2015-08-30', status: 'linked',
  studentId: 15, studentName: '윤해서', teacherId: 9, teacherName: '이재림', faceProfileCount: 2
};
const KANCHO = {
  id: 1, childName: '이칸쵸', childBirthdate: '2024-07-30', status: 'linked',
  studentId: 125, studentName: '이칸쵸', teacherId: 12, teacherName: '최재웅', faceProfileCount: 0
};
const PENDING = {
  id: 3, childName: '오타난이름', childBirthdate: '2019-01-01', status: 'pending',
  studentId: null, studentName: null, teacherId: 9, teacherName: '이재림', faceProfileCount: 0
};

const json = (body, okFlag = true) => Promise.resolve({ ok: okFlag, json: () => Promise.resolve(body) });

/** 서버 흉내 — 삭제가 성공하면 다음 /me 부터 그 아이가 빠진다. */
const serve = (children, { deleteFails = false, teachers = TEACHERS } = {}) => {
  let current = children;
  fetchWithAuth.mockImplementation((url, options = {}) => {
    if (url === '/api/parent/me') {
      return json({ user: { id: 13, username: '카카오_1', displayName: '칸쵸엄마' }, teachers, children: current });
    }
    if (options.method === 'DELETE') {
      if (deleteFails) return json({ error: '서버 오류가 발생했습니다.' }, false);
      const id = Number(url.split('/').pop());
      current = current.filter((child) => child.id !== id);
      return json({ deleted: { id }, facesRemoved: 0, children: current });
    }
    return json({});
  });
};

const renderSettings = async (props = {}) => {
  await act(async () => {
    render(
      <MemoryRouter initialEntries={['/parent/settings']}>
        <ParentSettings {...props} />
      </MemoryRouter>
    );
  });
};

const deleteCalls = () => fetchWithAuth.mock.calls.filter(([, options]) => options?.method === 'DELETE');

beforeEach(() => jest.clearAllMocks());

describe('ParentSettings — 내 아이 삭제', () => {
  it('아이마다 삭제 버튼이 있다', async () => {
    serve([CHOPA, KANCHO]);
    await renderSettings();

    expect(screen.getByRole('button', { name: '이쵸파 삭제' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '이칸쵸 삭제' })).toBeInTheDocument();
  });

  it('삭제를 누르면 바로 지우지 않고 확인 창에서 남는 것·지워지는 것을 알린다', async () => {
    serve([CHOPA, KANCHO]);
    await renderSettings();

    fireEvent.click(screen.getByRole('button', { name: '이쵸파 삭제' }));

    const dialog = screen.getByRole('dialog', { name: '아이를 삭제할까요?' });
    expect(dialog).toHaveTextContent('이쵸파 정보를 내 정보에서 삭제해요.');
    expect(dialog).toHaveTextContent('선생님 명단의 학생과 이미 신청한 일정은 그대로 남아요.');
    expect(dialog).toHaveTextContent('내가 등록한 얼굴 사진은 함께 지워져요.');
    // 아이가 둘이라 마지막 아이 안내는 없다
    expect(dialog).not.toHaveTextContent('마지막 아이');
    expect(deleteCalls()).toHaveLength(0);
  });

  it('취소하면 요청을 보내지 않고 아이가 그대로 남는다', async () => {
    serve([CHOPA, KANCHO]);
    await renderSettings();

    fireEvent.click(screen.getByRole('button', { name: '이쵸파 삭제' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: '취소' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(deleteCalls()).toHaveLength(0);
    expect(screen.getByText('이쵸파')).toBeInTheDocument();
  });

  it('확인하면 그 아이만 삭제하고 목록을 다시 읽는다', async () => {
    serve([CHOPA, KANCHO]);
    const onChildrenChanged = jest.fn();
    await renderSettings({ onChildrenChanged });

    fireEvent.click(screen.getByRole('button', { name: '이쵸파 삭제' }));
    await act(async () => {
      fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: '삭제' }));
    });

    expect(deleteCalls()).toEqual([['/api/parent/children/2', { method: 'DELETE' }]]);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '이쵸파 삭제' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '이칸쵸 삭제' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('이쵸파 정보를 삭제했어요.');
    // 아이가 하나도 안 남았을 때 온보딩으로 보낼 수 있게 위(ParentApp)에 알린다
    expect(onChildrenChanged).toHaveBeenCalledTimes(1);
  });

  it('삭제가 실패하면 오류를 보여 주고 아이는 남는다', async () => {
    serve([CHOPA, KANCHO], { deleteFails: true });
    const onChildrenChanged = jest.fn();
    await renderSettings({ onChildrenChanged });

    fireEvent.click(screen.getByRole('button', { name: '이칸쵸 삭제' }));
    await act(async () => {
      fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: '삭제' }));
    });

    expect(screen.getByRole('alert')).toHaveTextContent('서버 오류가 발생했습니다.');
    expect(screen.getByRole('button', { name: '이칸쵸 삭제' })).toBeInTheDocument();
    expect(onChildrenChanged).not.toHaveBeenCalled();
  });

  it('삭제는 됐는데 목록 새로 고침이 실패해도 삭제 실패로 보이지 않고, 지운 아이는 목록에서 빠진다', async () => {
    serve([CHOPA, KANCHO]);
    const onChildrenChanged = jest.fn();
    await renderSettings({ onChildrenChanged });

    // 삭제 뒤의 /me 만 네트워크 오류가 난다
    const served = fetchWithAuth.getMockImplementation();
    let deleted = false;
    fetchWithAuth.mockImplementation((url, options = {}) => {
      if (options.method === 'DELETE') { deleted = true; return served(url, options); }
      if (deleted && url === '/api/parent/me') return Promise.reject(new Error('network'));
      return served(url, options);
    });

    fireEvent.click(screen.getByRole('button', { name: '이쵸파 삭제' }));
    await act(async () => {
      fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: '삭제' }));
    });

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('이쵸파 정보를 삭제했어요.');
    expect(screen.queryByRole('button', { name: '이쵸파 삭제' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '이칸쵸 삭제' })).toBeInTheDocument();
    expect(onChildrenChanged).toHaveBeenCalledTimes(1);
  });

  it('삭제 요청 자체가 끊기면 다시 시도하라고 알리고 아이는 남는다', async () => {
    serve([CHOPA, KANCHO]);
    await renderSettings();

    const served = fetchWithAuth.getMockImplementation();
    fetchWithAuth.mockImplementation((url, options = {}) =>
      (options.method === 'DELETE' ? Promise.reject(new Error('network')) : served(url, options)));

    fireEvent.click(screen.getByRole('button', { name: '이쵸파 삭제' }));
    await act(async () => {
      fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: '삭제' }));
    });

    expect(screen.getByRole('alert')).toHaveTextContent('삭제하지 못했어요. 잠시 뒤 다시 시도해 주세요.');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '이쵸파 삭제' })).toBeInTheDocument();
  });

  it('마지막 아이를 지우려 하면 다시 등록해야 한다고 미리 알린다', async () => {
    serve([PENDING]);
    await renderSettings();

    fireEvent.click(screen.getByRole('button', { name: '오타난이름 삭제' }));

    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent('마지막 아이라서, 삭제하면 아이를 다시 등록하는 화면으로 이동해요.');
    // 학생과 연결되지 않은 아이는 남는 학생도, 지워질 얼굴도 없다
    expect(dialog).not.toHaveTextContent('선생님 명단');
    expect(dialog).not.toHaveTextContent('얼굴 사진');
  });

  it('삭제는 이제 직접 할 수 있으므로 "삭제는 선생님께 문의" 안내가 없다', async () => {
    serve([CHOPA, KANCHO]);
    await renderSettings();

    expect(screen.queryByText(/수정·삭제는 선생님께/)).not.toBeInTheDocument();
    expect(screen.getByText('아이 이름·생년월일 수정은 선생님께 문의해 주세요.')).toBeInTheDocument();
  });
});

describe('ParentSettings — 내 아이 줄에 보이는 정보', () => {
  it('생년월일과 선생님 이름만 보인다', async () => {
    serve([CHOPA, KANCHO]);
    await renderSettings();

    expect(screen.getByText('2015-08-30 · 이재림 선생님')).toBeInTheDocument();
    expect(screen.getByText('2024-07-30 · 최재웅 선생님')).toBeInTheDocument();
  });

  it('연결된 학생 이름은 보이지 않는다 — 입력한 이름과 달라도 아이 이름만 나온다', async () => {
    serve([CHOPA, KANCHO]);
    await renderSettings();

    expect(screen.getByText('이쵸파')).toBeInTheDocument();
    expect(screen.queryByText(/윤해서/)).not.toBeInTheDocument();
  });

  it('선생님이 한 명이어도 선생님 이름이 보인다', async () => {
    serve([KANCHO], { teachers: [TEACHERS[0]] });
    await renderSettings();

    expect(screen.getByText('2024-07-30 · 최재웅 선생님')).toBeInTheDocument();
  });

  it('확인 대기 중인 아이도 생년월일과 선생님 이름이 보인다', async () => {
    serve([PENDING]);
    await renderSettings();

    expect(screen.getByText('2019-01-01 · 이재림 선생님')).toBeInTheDocument();
  });

  it('선생님 이름을 모르면 생년월일만 보인다', async () => {
    serve([{ ...PENDING, teacherName: null }]);
    await renderSettings();

    expect(screen.getByText('2019-01-01')).toBeInTheDocument();
  });
});

describe('deleteChildMessage', () => {
  it('연결된 아이 — 학생·신청이 남는다고 알린다', () => {
    expect(deleteChildMessage(KANCHO)).toEqual([
      '이칸쵸 정보를 내 정보에서 삭제해요.',
      '선생님 명단의 학생과 이미 신청한 일정은 그대로 남아요.'
    ]);
  });

  it('얼굴을 등록한 아이 — 얼굴 사진도 지워진다고 알린다', () => {
    expect(deleteChildMessage(CHOPA)).toContain('내가 등록한 얼굴 사진은 함께 지워져요.');
  });

  it('확인 대기 아이 — 한 줄뿐이다', () => {
    expect(deleteChildMessage(PENDING)).toEqual(['오타난이름 정보를 내 정보에서 삭제해요.']);
  });

  it('마지막 아이면 온보딩으로 간다는 줄이 맨 끝에 붙는다', () => {
    const lines = deleteChildMessage(KANCHO, { isLast: true });
    expect(lines[lines.length - 1]).toBe('마지막 아이라서, 삭제하면 아이를 다시 등록하는 화면으로 이동해요.');
  });
});
