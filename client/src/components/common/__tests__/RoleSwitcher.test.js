import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate
}));

const mockAuth = {
  user: { id: 9, username: '이재림', role: 'user' },
  listRoles: jest.fn(),
  switchRole: jest.fn(),
  addRole: jest.fn()
};
jest.mock('../../../context/AuthContext', () => ({
  useAuth: () => mockAuth
}));

import RoleSwitcher from '../RoleSwitcher';

const roles = (over = {}) => ({
  current: { id: 9, role: 'user', username: '이재림' },
  kakao: true,
  accounts: [
    { id: 9, username: '이재림', role: 'user' },
    { id: 20, username: '이재림_2', role: 'parent' }
  ],
  canCreate: { admin: false, user: false, parent: false },
  teacherNeedsInvite: true,
  parentNeedsInvite: false,
  ...over
});

const renderSwitcher = (props = {}) =>
  render(
    <MemoryRouter>
      <RoleSwitcher {...props} />
    </MemoryRouter>
  );

describe('RoleSwitcher', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuth.user = { id: 9, username: '이재림', role: 'user' };
    mockAuth.listRoles.mockResolvedValue(roles());
  });

  it('표시 이름이 있으면 식별자(username) 대신 그것을 보여준다', async () => {
    mockAuth.user = { id: 12, username: '카카오_1788076610466', displayName: '최재웅', role: 'user' };
    mockAuth.listRoles.mockResolvedValue(
      roles({
        current: { id: 12, role: 'user', username: '카카오_1788076610466', displayName: '최재웅' },
        accounts: [
          { id: 12, username: '카카오_1788076610466', displayName: '최재웅', role: 'user' },
          { id: 13, username: '카카오_1788076610466_2', displayName: null, role: 'parent' }
        ]
      })
    );
    renderSwitcher({ variant: 'menu' });

    await waitFor(() => expect(screen.getByRole('button', { name: /최재웅/ })).toBeInTheDocument());
    expect(screen.queryByText('카카오_1788076610466')).not.toBeInTheDocument();
    // 표시 이름이 없는 학부모 행은 username 으로 되돌린다
    await userEvent.click(screen.getByRole('button', { name: /최재웅/ }));
    expect(screen.getByText('카카오_1788076610466_2')).toBeInTheDocument();
  });

  it('가진 다른 역할을 전환 항목으로 보여준다', async () => {
    renderSwitcher({ variant: 'card' });

    expect(await screen.findByText(/학부모 화면으로/)).toBeInTheDocument();
    // 지금 역할은 항목에 나오지 않는다
    expect(screen.queryByText(/선생님 화면으로/)).not.toBeInTheDocument();
  });

  it('전환하면 그 역할의 홈으로 이동한다', async () => {
    mockAuth.switchRole.mockResolvedValue({ role: 'parent' });
    renderSwitcher({ variant: 'card' });

    await userEvent.click(await screen.findByText(/학부모 화면으로/));

    await waitFor(() => expect(mockAuth.switchRole).toHaveBeenCalledWith('parent'));
    expect(mockNavigate).toHaveBeenCalledWith('/parent/schedule');
  });

  it('전환에 실패하면 사유를 보여주고 이동하지 않는다', async () => {
    mockAuth.switchRole.mockRejectedValue(new Error('계정이 없습니다.'));
    renderSwitcher({ variant: 'card' });

    await userEvent.click(await screen.findByText(/학부모 화면으로/));

    expect(await screen.findByRole('alert')).toHaveTextContent('계정이 없습니다.');
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('없는 역할은 "계정 만들기" 로 보여준다', async () => {
    mockAuth.listRoles.mockResolvedValue(
      roles({
        accounts: [{ id: 9, username: '이재림', role: 'user' }],
        canCreate: { admin: false, user: false, parent: true }
      })
    );

    renderSwitcher({ variant: 'card' });

    expect(await screen.findByText(/학부모 계정 만들기/)).toBeInTheDocument();
  });

  it('보유한 역할도 만들 수 있는 역할도 없으면 아무 것도 그리지 않는다', async () => {
    mockAuth.listRoles.mockResolvedValue(
      roles({
        accounts: [{ id: 9, username: '이재림', role: 'user' }],
        canCreate: { admin: false, user: false, parent: false }
      })
    );

    const { container } = renderSwitcher({ variant: 'card' });

    await waitFor(() => expect(mockAuth.listRoles).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it('카카오 계정이 아니면 그리지 않는다 (다른 역할을 가질 수 없다)', async () => {
    mockAuth.listRoles.mockResolvedValue(roles({ kakao: false }));

    const { container } = renderSwitcher({ variant: 'card' });

    await waitFor(() => expect(mockAuth.listRoles).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it('역할 정보를 못 읽으면 조용히 숨긴다 (기존 화면을 막지 않는다)', async () => {
    mockAuth.listRoles.mockRejectedValue(new Error('네트워크'));

    const { container } = renderSwitcher({ variant: 'card' });

    await waitFor(() => expect(mockAuth.listRoles).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it('menu 변형은 눌러야 목록이 열린다', async () => {
    renderSwitcher({ variant: 'menu' });

    const trigger = await screen.findByRole('button', { expanded: false });
    expect(screen.queryByText(/학부모 화면으로/)).not.toBeInTheDocument();

    await userEvent.click(trigger);

    expect(screen.getByText(/학부모 화면으로/)).toBeInTheDocument();
    expect(screen.getByText(/모든 탭이 그 역할로 바뀝니다/)).toBeInTheDocument();
  });

  it('관리자에게는 선생님·학부모 항목이 모두 보인다', async () => {
    mockAuth.user = { id: 8, username: '박원장', role: 'admin' };
    mockAuth.listRoles.mockResolvedValue(
      roles({
        current: { id: 8, role: 'admin', username: '박원장' },
        accounts: [
          { id: 8, username: '박원장', role: 'admin' },
          { id: 9, username: '박원장_2', role: 'user' }
        ],
        canCreate: { admin: false, user: false, parent: true },
        teacherNeedsInvite: false,
        parentNeedsInvite: true
      })
    );

    renderSwitcher({ variant: 'list' });

    expect(await screen.findByText(/선생님 화면으로/)).toBeInTheDocument();
    expect(screen.getByText(/학부모 계정 만들기/)).toBeInTheDocument();
  });
});
