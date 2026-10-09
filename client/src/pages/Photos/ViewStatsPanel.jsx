import React from 'react';
import { Card, Icon } from '../../components/ui';
import RetryImage from '../../components/album/RetryImage';

/**
 * 학부모가 이 앨범을 본 기록 — 연 학부모 수 · 앨범을 연 횟수 · 사진을 크게 본 횟수, 그리고 많이 본 사진.
 * 같은 사람이 잠깐 사이 다시 본 것은 한 번으로 센다(앨범 30분 · 사진 10분). 누가 봤는지는 관리자 로그에만 있다.
 * stats = GET …/album 의 viewStats, top = topViewed([{ id, kind, views, thumbnailUrl }]), onOpen(id) = 그 사진 크게 보기
 */
function ViewStatsPanel({ stats, top = [], onOpen, className }) {
  if (!stats) return null;
  const numbers = [
    { key: 'viewers', label: '본 학부모', value: stats.viewers, unit: '명' },
    { key: 'albumOpens', label: '앨범 연 횟수', value: stats.albumOpens, unit: '번' },
    { key: 'mediaViews', label: '사진 본 횟수', value: stats.mediaViews, unit: '번' }
  ];
  return (
    <Card as="section" padding="md" className={className} aria-label="보기 통계">
      <div className="ui-stack" data-gap="3">
        <h3 className="ui-card__title">보기 통계</h3>
        <dl className="ui-view-stats">
          {numbers.map((n) => (
            <div key={n.key} className="ui-view-stats__item">
              <dt>{n.label}</dt>
              <dd><b>{n.value || 0}</b>{n.unit}</dd>
            </div>
          ))}
        </dl>
        {top.length > 0 ? (
          <div className="ui-stack" data-gap="2">
            <p className="ui-text-subtle">많이 본 사진</p>
            <ol className="ui-view-stats__top">
              {top.map((media, index) => (
                <li key={media.id}>
                  <button
                    type="button"
                    className="ui-view-stats__photo"
                    aria-label={`많이 본 사진 ${index + 1} — ${media.views}번`}
                    onClick={() => onOpen?.(media.id)}
                  >
                    <RetryImage src={media.thumbnailUrl} loading="lazy" />
                    <span className="ui-view-stats__count"><Icon name="eye" size={11} />{media.views}</span>
                  </button>
                </li>
              ))}
            </ol>
          </div>
        ) : (
          <p className="ui-hand">{stats.viewers ? '아직 학부모가 크게 본 사진이 없어요.' : '아직 학부모가 이 앨범을 보지 않았어요.'}</p>
        )}
        <p className="ui-hand">같은 사람이 잠깐 사이 다시 본 것은 한 번으로 세요(앨범 30분 · 사진 10분).</p>
      </div>
    </Card>
  );
}

export default ViewStatsPanel;
