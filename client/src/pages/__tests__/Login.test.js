import React from 'react';
import { render, screen } from '@testing-library/react';

let mockSearch = '';
jest.mock('react-router-dom', () => ({
  useSearchParams: () => [new URLSearchParams(mockSearch)]
}));

jest.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ getKakaoLoginUrl: jest.fn() })
}));

import { saveReturnTo } from '../../utils/returnTo';
import Login from '../Login';

beforeEach(() => {
  localStorage.clear();
  mockSearch = '';
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
