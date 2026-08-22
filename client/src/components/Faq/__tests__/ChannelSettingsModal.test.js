import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ChannelSettingsModal from '../ChannelSettingsModal';

const channel = {
  name: '리듬체조 문의',
  greeting: '안녕하세요!',
  fallbackMessage: '찾지 못했습니다.',
  pendingMessage: '접수되었습니다.',
  isActive: true,
  aiEnabled: true,
  kakaoNotify: true
};

const setup = (overrides = {}) => {
  const onSaved = jest.fn().mockResolvedValue(true);
  const onClose = jest.fn();
  render(
    <ChannelSettingsModal
      channel={{ ...channel, ...overrides }}
      onClose={onClose}
      onSaved={onSaved}
    />
  );
  return { onSaved, onClose };
};

describe('ChannelSettingsModal', () => {
  it('저장 시 AI 자동 답변과 카카오 알림 설정을 함께 보낸다', async () => {
    const { onSaved } = setup();

    fireEvent.click(screen.getByRole('button', { name: '저장' }));

    await waitFor(() =>
      expect(onSaved).toHaveBeenCalledWith(
        expect.objectContaining({ aiEnabled: true, kakaoNotify: true })
      )
    );
  });

  it('카카오 알림을 끄면 꺼진 값으로 저장한다', async () => {
    const { onSaved } = setup();

    fireEvent.click(screen.getByLabelText('새 문의 카카오톡 알림'));
    fireEvent.click(screen.getByRole('button', { name: '저장' }));

    await waitFor(() =>
      expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ kakaoNotify: false }))
    );
  });

  it('알림이 꺼져 있으면 보내지 않는다고 안내한다', () => {
    setup({ kakaoNotify: false });

    expect(screen.getByText(/카카오톡 알림을 보내지 않습니다/)).toBeInTheDocument();
  });

  it('AI 자동 답변을 끄면 접수 안내 문구를 입력받는다', () => {
    setup({ aiEnabled: false });

    expect(screen.getByText('질문 접수 안내 문구')).toBeInTheDocument();
    expect(screen.queryByText('답변할 수 없을 때 안내 문구')).not.toBeInTheDocument();
  });
});
