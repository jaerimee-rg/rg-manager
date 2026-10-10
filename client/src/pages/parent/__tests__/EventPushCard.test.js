import React from 'react';
import { render, screen, act, fireEvent } from '@testing-library/react';

jest.mock('../../../utils/pushNotifications', () => ({
  ...jest.requireActual('../../../utils/pushNotifications'),
  pushEnvironment: jest.fn(),
  loadPushConfig: jest.fn(),
  registerServiceWorker: jest.fn(),
  currentSubscription: jest.fn(),
  enablePush: jest.fn(),
  disablePush: jest.fn()
}));

import {
  pushEnvironment, loadPushConfig, registerServiceWorker, currentSubscription, enablePush, disablePush
} from '../../../utils/pushNotifications';
import EventPushCard from '../EventPushCard';

const registration = { pushManager: {} };

const renderCard = async () => {
  await act(async () => {
    render(<EventPushCard />);
  });
};
const toggle = () => screen.getByRole('switch', { name: '이 기기로 새 일정 알림 받기' });

beforeEach(() => {
  jest.clearAllMocks();
  global.Notification = { permission: 'default' };
  pushEnvironment.mockReturnValue('supported');
  loadPushConfig.mockResolvedValue({ configured: true, publicKey: 'pub' });
  registerServiceWorker.mockResolvedValue(registration);
  currentSubscription.mockResolvedValue(null);
});

afterAll(() => {
  delete global.Notification;
});

describe('EventPushCard', () => {
  it('서버에 알림 키가 없으면 카드를 그리지 않는다', async () => {
    loadPushConfig.mockResolvedValue({ configured: false, publicKey: null });
    await renderCard();

    expect(screen.queryByTestId('event-push-card')).not.toBeInTheDocument();
    expect(registerServiceWorker).not.toHaveBeenCalled();
  });

  it('설정을 못 받아도 깨지지 않고 그리지 않는다', async () => {
    loadPushConfig.mockRejectedValue(new Error('offline'));
    await renderCard();

    expect(screen.queryByTestId('event-push-card')).not.toBeInTheDocument();
  });

  it('켤 수 있는 브라우저는 미리 서비스 워커를 준비하고 꺼진 스위치를 보여 준다', async () => {
    await renderCard();

    expect(registerServiceWorker).toHaveBeenCalled();
    expect(toggle()).not.toBeChecked();
    expect(toggle()).toBeEnabled();
  });

  it('이미 켜 둔 기기는 켜진 스위치로 보여 준다', async () => {
    currentSubscription.mockResolvedValue({ endpoint: 'x' });
    await renderCard();

    expect(toggle()).toBeChecked();
  });

  it('스위치를 켜면 권한을 묻고 구독해 저장한다', async () => {
    enablePush.mockResolvedValue('granted');
    await renderCard();

    await act(async () => {
      fireEvent.click(toggle());
    });

    expect(enablePush).toHaveBeenCalledWith({ registration, publicKey: 'pub' });
    expect(toggle()).toBeChecked();
    expect(screen.getByRole('status')).toHaveTextContent('알림을 켰어요');
  });

  it('권한을 거절하면 꺼진 채로 차단 안내를 보여 준다', async () => {
    enablePush.mockResolvedValue('denied');
    await renderCard();

    await act(async () => {
      fireEvent.click(toggle());
    });

    expect(toggle()).not.toBeChecked();
    expect(toggle()).toBeDisabled();
    expect(screen.getByText(/알림이 차단돼 있어요/)).toBeInTheDocument();
  });

  it('켜기가 실패하면 오류를 보여 주고 꺼진 채로 둔다', async () => {
    enablePush.mockRejectedValue(new Error('subscription_not_saved'));
    await renderCard();

    await act(async () => {
      fireEvent.click(toggle());
    });

    expect(toggle()).not.toBeChecked();
    expect(screen.getByRole('alert')).toHaveTextContent('알림을 켜지 못했어요');
  });

  it('켜진 스위치를 끄면 구독을 지운다', async () => {
    currentSubscription.mockResolvedValue({ endpoint: 'x' });
    disablePush.mockResolvedValue();
    await renderCard();

    await act(async () => {
      fireEvent.click(toggle());
    });

    expect(disablePush).toHaveBeenCalledWith({ registration });
    expect(toggle()).not.toBeChecked();
    expect(screen.getByRole('status')).toHaveTextContent('이 기기의 알림을 껐어요');
  });

  it('이미 차단된 기기는 처음부터 안내한다', async () => {
    global.Notification = { permission: 'denied' };
    await renderCard();

    expect(toggle()).toBeDisabled();
    expect(screen.getByText(/알림이 차단돼 있어요/)).toBeInTheDocument();
  });

  it('서비스 워커를 못 올리면 이 브라우저는 안 된다고 안내한다', async () => {
    registerServiceWorker.mockRejectedValue(new Error('SecurityError'));
    await renderCard();

    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
    expect(screen.getByText(/이 브라우저에서는 알림을 받을 수 없어요/)).toBeInTheDocument();
  });

  it('카카오톡 안에서는 스위치 대신 브라우저로 여는 버튼을 준다', async () => {
    pushEnvironment.mockReturnValue('kakaotalk');
    await renderCard();

    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
    expect(registerServiceWorker).not.toHaveBeenCalled();
    expect(screen.getByText(/카카오톡 안에서 연 화면에서는 알림을 받을 수 없어요/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '브라우저로 열기' }).getAttribute('href'))
      .toMatch(/^kakaotalk:\/\/web\/openExternal\?url=/);
  });

  it('아이폰 사파리 탭에서는 홈 화면에 추가하는 방법을 안내한다', async () => {
    pushEnvironment.mockReturnValue('ios-install');
    await renderCard();

    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
    expect(screen.getByText('홈 화면에 추가한 앱')).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
  });

  it('iOS 가 낮으면 업데이트를 안내한다', async () => {
    pushEnvironment.mockReturnValue('ios-update');
    await renderCard();

    expect(screen.getByText(/iOS 16.4 이상/)).toBeInTheDocument();
  });
});
