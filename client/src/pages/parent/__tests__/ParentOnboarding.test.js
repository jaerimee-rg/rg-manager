import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

jest.mock('../../../utils/api', () => ({ fetchWithAuth: jest.fn() }));

const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate
}));

import { fetchWithAuth } from '../../../utils/api';
import { saveReturnTo, peekReturnTo } from '../../../utils/returnTo';
import ParentOnboarding, { defaultParentName } from '../ParentOnboarding';

const teachers = [{ id: 7, name: '이재림' }];

const renderForm = () =>
  render(
    <MemoryRouter>
      <ParentOnboarding teachers={teachers} onDone={jest.fn()} />
    </MemoryRouter>
  );

const fillChild = (name = '예림', birthdate = '2018-03-05') => {
  fireEvent.change(screen.getByLabelText(/^이름/), { target: { value: name } });
  fireEvent.change(screen.getByLabelText(/^생년월일/), { target: { value: birthdate } });
};

const submit = async () => {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: '시작하기' }));
  });
};

const sentBody = () => JSON.parse(fetchWithAuth.mock.calls[0][1].body);

beforeEach(() => {
  jest.clearAllMocks();
  localStorage.clear();
  fetchWithAuth.mockResolvedValue({ ok: true, json: () => Promise.resolve({ children: [], created: 1 }) });
});

describe('defaultParentName', () => {
  it('아이 이름에 "엄마" 를 붙인다 (서버 규칙과 같다)', () => {
    expect(defaultParentName('예림')).toBe('예림엄마');
    expect(defaultParentName('김 민서')).toBe('김민서엄마');
    expect(defaultParentName('')).toBe('');
  });
});

describe('ParentOnboarding — 학부모명', () => {
  it('아이 이름을 입력하면 학부모명이 자동으로 채워진다', () => {
    renderForm();

    fireEvent.change(screen.getByLabelText(/^이름/), { target: { value: '예림' } });

    expect(screen.getByLabelText(/^학부모명/)).toHaveValue('예림엄마');
  });

  it('아이 이름을 고치면 제안값도 따라 바뀐다', () => {
    renderForm();

    fireEvent.change(screen.getByLabelText(/^이름/), { target: { value: '예림' } });
    fireEvent.change(screen.getByLabelText(/^이름/), { target: { value: '민서' } });

    expect(screen.getByLabelText(/^학부모명/)).toHaveValue('민서엄마');
  });

  it('학부모명을 직접 고치면 아이 이름을 바꿔도 그대로 둔다', () => {
    renderForm();

    fireEvent.change(screen.getByLabelText(/^이름/), { target: { value: '예림' } });
    fireEvent.change(screen.getByLabelText(/^학부모명/), { target: { value: '칸쵸엄마' } });
    fireEvent.change(screen.getByLabelText(/^이름/), { target: { value: '민서' } });

    expect(screen.getByLabelText(/^학부모명/)).toHaveValue('칸쵸엄마');
  });

  it('학부모명을 아이 정보와 함께 보낸다', async () => {
    renderForm();

    fillChild('예림');
    fireEvent.change(screen.getByLabelText(/^학부모명/), { target: { value: '칸쵸엄마' } });
    await submit();

    expect(sentBody()).toEqual(
      expect.objectContaining({
        parentName: '칸쵸엄마',
        children: [{ name: '예림', birthdate: '2018-03-05' }]
      })
    );
  });

  it('학부모명을 지우고 제출하면 아이 이름으로 만든 기본값을 보낸다', async () => {
    renderForm();

    fillChild('예림');
    fireEvent.change(screen.getByLabelText(/^학부모명/), { target: { value: '' } });
    await submit();

    expect(sentBody().parentName).toBe('예림엄마');
  });

  it('저장에 성공하면 일정 화면으로 넘어간다', async () => {
    renderForm();

    fillChild('예림');
    await submit();

    expect(mockNavigate).toHaveBeenCalledWith('/parent/schedule', { state: { justOnboarded: true } });
  });

  it('공유 링크를 눌러 가입까지 온 학부모는 그 이벤트로 바로 간다', async () => {
    saveReturnTo('/parent/events/12');
    renderForm();

    fillChild('예림');
    await submit();

    expect(mockNavigate).toHaveBeenCalledWith('/parent/events/12', { state: { justOnboarded: true } });
    // 한 번 쓰고 지운다
    expect(peekReturnTo()).toBeNull();
  });

  it('학부모 트리가 아닌 주소가 남아 있으면 무시하고 일정으로 간다', async () => {
    saveReturnTo('/admin/users');
    renderForm();

    fillChild('예림');
    await submit();

    expect(mockNavigate).toHaveBeenCalledWith('/parent/schedule', { state: { justOnboarded: true } });
  });
});
