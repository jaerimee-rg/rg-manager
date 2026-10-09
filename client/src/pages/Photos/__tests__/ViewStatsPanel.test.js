import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import ViewStatsPanel from '../ViewStatsPanel';

describe('ViewStatsPanel — 학부모 보기 통계', () => {
  it('본 학부모 수 · 앨범 연 횟수 · 사진 본 횟수와 많이 본 사진(눌러서 크게 보기)', () => {
    const onOpen = jest.fn();
    render(
      <ViewStatsPanel
        stats={{ viewers: 5, albumOpens: 9, mediaViews: 31 }}
        top={[{ id: 41, kind: 'image', views: 12, thumbnailUrl: 'https://t/41' }, { id: 42, kind: 'video', views: 3, thumbnailUrl: 'https://t/42' }]}
        onOpen={onOpen}
      />
    );

    const panel = screen.getByRole('region', { name: '보기 통계' });
    expect(within(panel).getByText('본 학부모').nextSibling).toHaveTextContent('5명');
    expect(within(panel).getByText('앨범 연 횟수').nextSibling).toHaveTextContent('9번');
    expect(within(panel).getByText('사진 본 횟수').nextSibling).toHaveTextContent('31번');

    fireEvent.click(screen.getByRole('button', { name: '많이 본 사진 1 — 12번' }));
    expect(onOpen).toHaveBeenCalledWith(41);
  });

  it('아직 아무도 안 봤으면 그렇게 알린다', () => {
    render(<ViewStatsPanel stats={{ viewers: 0, albumOpens: 0, mediaViews: 0 }} top={[]} />);
    expect(screen.getByText('아직 학부모가 이 앨범을 보지 않았어요.')).toBeInTheDocument();
  });

  it('앨범만 열고 사진은 안 크게 봤으면', () => {
    render(<ViewStatsPanel stats={{ viewers: 2, albumOpens: 2, mediaViews: 0 }} top={[]} />);
    expect(screen.getByText('아직 학부모가 크게 본 사진이 없어요.')).toBeInTheDocument();
  });

  it('통계가 없으면(앨범이 아직 없다) 그리지 않는다', () => {
    const { container } = render(<ViewStatsPanel stats={undefined} />);
    expect(container).toBeEmptyDOMElement();
  });
});
