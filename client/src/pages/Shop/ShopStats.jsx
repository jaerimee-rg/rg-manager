import React, { useEffect, useState } from 'react';
import { fetchWithAuth } from '../../utils/api';
import { clickRateText, formatClickTime, formatPeriod } from '../../utils/shopFormat';
import {
  Button, Callout, Card, CardHeader, DataTable, EmptyState, Progress, Segmented, SkeletonList, Stat, Toolbar
} from '../../components/ui';
import { ProductItem } from './ProductList';

const RANGES = [
  { id: '7', label: '최근 7일' },
  { id: '30', label: '30일' },
  { id: '90', label: '90일' },
  { id: 'all', label: '전체' }
];

const dash = <span className="ui-text-subtle">—</span>;

/**
 * 통계 탭 (FR-450~455) — 어떤 상품 링크가 많이 눌렸는지.
 * 클릭 0 상품도 표에 남겨 "안 눌리는 상품" 이 보이게 한다.
 */
function ShopStats({ onCopyLink }) {
  const [range, setRange] = useState('30');
  const [data, setData] = useState(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setError(false);
      setData(null);
      try {
        const response = await fetchWithAuth(`/api/shop/stats?days=${range}`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const body = await response.json();
        if (!cancelled) setData(body);
      } catch (err) {
        console.error('추천 상품 통계 조회 실패:', err);
        if (!cancelled) setError(true);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [range]);

  const toolbar = (
    <Toolbar scrollOnMobile={false}>
      <Segmented items={RANGES} value={range} onChange={setRange} aria-label="기간" />
      <span style={{ flex: 1 }} />
      {data && (
        <span className="ui-text-sm ui-text-subtle">
          {formatPeriod(data.since)} · 미리 보기로 누른 것도 포함돼요
        </span>
      )}
    </Toolbar>
  );

  if (error) {
    return (
      <>
        {toolbar}
        <Callout tone="danger">통계를 불러오지 못했어요. 잠시 후 다시 열어 주세요.</Callout>
      </>
    );
  }

  if (!data) {
    return (
      <>
        {toolbar}
        <SkeletonList rows={3} />
      </>
    );
  }

  const { summary, products, categories } = data;
  const linked = products.filter((p) => p.hasUrl);
  const maxClicks = Math.max(0, ...linked.map((p) => p.clicks));
  const maxCategory = Math.max(0, ...categories.map((c) => c.clicks));

  if (summary.views === 0 && summary.clicks === 0) {
    return (
      <>
        {toolbar}
        <Card>
          <EmptyState
            icon="chart"
            title="아직 기록이 없어요"
            description={range === 'all'
              ? '상점 링크를 학부모에게 보내 보세요. 누가 어떤 상품을 눌렀는지 여기에 모여요.'
              : '이 기간에는 방문·클릭이 없어요. 기간을 넓히거나 상점 링크를 다시 보내 보세요.'}
            action={<Button icon="link" onClick={onCopyLink}>링크 복사</Button>}
          />
        </Card>
      </>
    );
  }

  const columns = [
    {
      key: 'rank',
      header: '순위',
      width: '64px',
      render: (p) => <span className="shop-rank" data-top={p.rank === 1 || undefined}>{p.rank ?? '—'}</span>
    },
    {
      key: 'title',
      header: '상품',
      render: (p) => (
        <ProductItem
          product={p}
          subtitle={p.hasUrl ? p.categoryName : <>{p.categoryName} · <span className="ui-text-subtle">링크 없음</span></>}
        />
      )
    },
    {
      key: 'clicks',
      header: '클릭',
      width: '132px',
      numeric: true,
      render: (p) => (p.hasUrl ? (
        <span className="shop-bar-cell">
          <Progress value={p.clicks} max={maxClicks || 1} label={`${p.title} 클릭`} />
          <b className="ui-num">{p.clicks}</b>
        </span>
      ) : dash)
    },
    { key: 'visitors', header: '클릭한 방문자', width: '108px', numeric: true, render: (p) => (p.hasUrl ? p.visitors : dash) },
    { key: 'last', header: '마지막 클릭', width: '120px', render: (p) => formatClickTime(p.lastClickedAt) || dash }
  ];

  return (
    <>
      {toolbar}

      <div className="shop-stat-grid">
        <Stat label="상점 방문" value={summary.views} icon="eye" hint="링크를 연 횟수" />
        <Stat label="방문자" value={summary.visitors} icon="users" hint="서로 다른 브라우저" />
        <Stat label="상품 클릭" value={summary.clicks} icon="external" tone="brand" hint="상품 링크로 이동한 횟수" />
        <Stat
          label="클릭한 방문자"
          value={summary.clickVisitors}
          icon="user"
          tone="brand"
          hint={clickRateText(summary.clickVisitors, summary.visitors) || '상품을 누른 브라우저'}
        />
      </div>

      <div className="shop-stats-layout">
        <DataTable
          columns={columns}
          rows={products}
          caption="상품별 클릭 순위 — 클릭 0 인 상품도 보여요"
        />

        <Card>
          <CardHeader title="카테고리별 클릭" description="숨긴 상품의 클릭도 포함해요." />
          <div className="shop-cat-bars">
            {categories.map((c) => (
              <div className="shop-cat-bars__row" key={c.id ?? 'none'}>
                <div className="ui-row" data-gap="2" data-justify="between">
                  <span className="ui-text-sm">{c.name}</span>
                  <span className="ui-num ui-text-sm" style={{ fontWeight: 600 }}>{c.clicks}</span>
                </div>
                <Progress value={c.clicks} max={maxCategory || 1} label={`${c.name} 클릭`} />
              </div>
            ))}
          </div>
        </Card>
      </div>
    </>
  );
}

export default ShopStats;
