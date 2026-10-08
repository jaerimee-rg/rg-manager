import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';

let mockSearch = '';
jest.mock('react-router-dom', () => ({
  useSearchParams: () => [new URLSearchParams(mockSearch)]
}));

const mockGetKakaoLoginUrl = jest.fn();
jest.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ getKakaoLoginUrl: mockGetKakaoLoginUrl })
}));

import { saveReturnTo } from '../../utils/returnTo';
import Login from '../Login';

beforeEach(() => {
  localStorage.clear();
  mockSearch = '';
  mockGetKakaoLoginUrl.mockReset();
  // 로그인 주소를 받은 뒤 화면이 카카오로 넘어가지 않게 — 끝나지 않는 약속
  mockGetKakaoLoginUrl.mockReturnValue(new Promise(() => {}));
  global.fetch = jest.fn(() => Promise.resolve({ ok: false, json: () => Promise.resolve({}) }));
});

afterEach(() => {
  delete global.fetch;
});

describe('Login — 공유 링크로 온 학부모 안내', () => {
  it('공유받은 이벤트 링크가 기다리고 있으면 알려 준다', () => {
    saveReturnTo('/parent/events/12');

    render(<Login />);

    expect(screen.getByText('공유받은 이벤트가 있어요.')).toBeInTheDocument();
  });

  it('기다리는 주소가 없으면 안내도 없다', () => {
    render(<Login />);

    expect(screen.queryByText('공유받은 이벤트가 있어요.')).not.toBeInTheDocument();
  });

  it('이벤트 링크가 아닌 딥링크에는 안내하지 않는다', () => {
    saveReturnTo('/admin/users');

    render(<Login />);

    expect(screen.queryByText('공유받은 이벤트가 있어요.')).not.toBeInTheDocument();
  });

  it('초대가 필요하다는 안내가 우선이다', () => {
    saveReturnTo('/parent/events/12');
    mockSearch = 'outcome=needsInvite';

    render(<Login />);

    expect(screen.getByRole('alert')).toHaveTextContent('가입에는 초대가 필요해요.');
    expect(screen.queryByText('공유받은 이벤트가 있어요.')).not.toBeInTheDocument();
  });
});

describe('Login — 공유받은 사진 폴더 링크 (docs/photo-menu FR-518)', () => {
  const inviteOk = (teacherName) => {
    global.fetch = jest.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ teacherName }) }));
  };

  it('누가 보냈는지와 처음 온 사람이 할 일을 알려 준다', async () => {
    inviteOk('이재림');
    saveReturnTo('/parent/photos/34?invite=tok');

    await act(async () => { render(<Login />); });

    expect(global.fetch).toHaveBeenCalledWith('/api/invite/tok');
    expect(screen.getByText('이재림 선생님이 사진을 공유했어요.')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('처음이라면 로그인 뒤 아이 정보만 등록하면 돼요.');
    expect(screen.queryByText('공유받은 이벤트가 있어요.')).not.toBeInTheDocument();
  });

  it('카카오 로그인에 그 초대를 soft 로 실어 보낸다 — 처음 온 학부모가 여기서 바로 가입한다', async () => {
    inviteOk('이재림');
    saveReturnTo('/parent/photos/34?invite=tok');
    await act(async () => { render(<Login />); });

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /카카오/ })); });

    expect(mockGetKakaoLoginUrl).toHaveBeenCalledWith({ invite: 'tok', soft: true });
  });

  it('초대 이름을 읽지 못해도(초대가 바뀜) 안내와 로그인은 그대로 된다', async () => {
    saveReturnTo('/parent/photos/34?invite=gone');

    await act(async () => { render(<Login />); });

    expect(screen.getByText('공유받은 사진이 있어요.')).toBeInTheDocument();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /카카오/ })); });
    expect(mockGetKakaoLoginUrl).toHaveBeenCalledWith({ invite: 'gone', soft: true });
  });

  it('초대가 없는 사진 링크면 초대 없이 로그인한다', async () => {
    saveReturnTo('/parent/photos/34');

    await act(async () => { render(<Login />); });

    expect(global.fetch).not.toHaveBeenCalled();
    expect(screen.getByRole('status')).toHaveTextContent('공유받은 사진이 있어요.');
    expect(screen.getByRole('status')).not.toHaveTextContent('처음이라면');
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /카카오/ })); });
    expect(mockGetKakaoLoginUrl).toHaveBeenCalledWith({});
  });

  it('보통 로그인(기다리는 주소 없음)은 초대를 싣지 않는다', async () => {
    await act(async () => { render(<Login />); });

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /카카오/ })); });

    expect(mockGetKakaoLoginUrl).toHaveBeenCalledWith({});
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
