import React from 'react';
import { render, screen } from '@testing-library/react';
import MediaGrid from '../MediaGrid';

const item = (overrides = {}) => ({
  id: 1,
  kind: 'image',
  thumbnailUrl: 'https://drive.google.com/thumbnail?id=f1&sz=w400',
  fileName: 'IMG_1.jpg',
  takenAt: '2026-10-08T05:00:00.000Z',
  uploader: 'teacher',
  myTags: [],
  ...overrides
});

describe('MediaGrid — 얼굴 매칭 표시', () => {
  it('얼굴 매칭으로 붙은 아이 이름은 썸네일에 보이지 않는다 — 매칭이 틀릴 수 있다', () => {
    const { container } = render(
      <MediaGrid items={[item({ myTags: [{ studentId: 5, name: '김하은', source: 'face' }] })]} onOpen={jest.fn()} />
    );

    expect(container).not.toHaveTextContent('김하은');
    expect(container).not.toHaveTextContent('우리 아이');
  });

  it('화면이 따로 그리는 표시(renderBadge)는 그대로 쓴다', () => {
    render(<MediaGrid items={[item()]} onOpen={jest.fn()} renderBadge={() => <span>숨김</span>} />);

    expect(screen.getByText('숨김')).toBeInTheDocument();
  });
});
