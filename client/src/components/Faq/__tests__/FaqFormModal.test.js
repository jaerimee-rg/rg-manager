import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import FaqFormModal from '../FaqFormModal';

describe('FaqFormModal', () => {
  const setup = (props = {}) => {
    const onSaved = jest.fn().mockResolvedValue(true);
    const onClose = jest.fn();
    render(<FaqFormModal faq={null} onClose={onClose} onSaved={onSaved} {...props} />);
    return { onSaved, onClose };
  };

  it('질문·답변이 비어 있으면 저장 버튼이 비활성화된다', () => {
    setup();
    expect(screen.getByRole('button', { name: '저장' })).toBeDisabled();
  });

  it('질문과 답변을 모두 입력하면 저장할 수 있다', async () => {
    const { onSaved } = setup();

    fireEvent.change(screen.getByPlaceholderText(/토요일 수업은 몇 시인가요/), {
      target: { value: '토요일 수업은 몇 시인가요?' }
    });
    fireEvent.change(screen.getByPlaceholderText(/오전 10시부터/), {
      target: { value: '오전 10시부터 11시 30분까지입니다.' }
    });

    const saveButton = screen.getByRole('button', { name: '저장' });
    expect(saveButton).toBeEnabled();

    fireEvent.click(saveButton);

    await waitFor(() =>
      expect(onSaved).toHaveBeenCalledWith({
        question: '토요일 수업은 몇 시인가요?',
        answer: '오전 10시부터 11시 30분까지입니다.',
        isPublished: true
      })
    );
  });

  it('질문이 200자를 넘으면 저장할 수 없고 글자 수가 강조된다', () => {
    setup();

    fireEvent.change(screen.getByPlaceholderText(/토요일 수업은 몇 시인가요/), {
      target: { value: 'ㄱ'.repeat(201) }
    });
    fireEvent.change(screen.getByPlaceholderText(/오전 10시부터/), {
      target: { value: '답변' }
    });

    expect(screen.getByRole('button', { name: '저장' })).toBeDisabled();
    expect(screen.getByText('201 / 200')).toHaveClass('over');
  });

  it('수정 모드에서는 기존 값을 채워 보여준다', () => {
    setup({ faq: { id: 1, question: '기존 질문', answer: '기존 답변', isPublished: false } });

    expect(screen.getByDisplayValue('기존 질문')).toBeInTheDocument();
    expect(screen.getByDisplayValue('기존 답변')).toBeInTheDocument();
    expect(screen.getByLabelText('학부모 채팅에 공개')).not.toBeChecked();
  });
});
