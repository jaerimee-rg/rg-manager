import React, { useEffect, useRef, useState } from 'react';
import { fetchWithAuth } from '../../utils/api';
import { formatIsoDate } from '../../utils/calendar';
import { RESERVATION_STATUSES, countByStatus, formatRequestedAt } from '../../utils/shopReservation';
import {
  Button, Callout, Card, Chip, DataTable, EmptyState, Segmented, SkeletonList, Toolbar
} from '../../components/ui';
import { ProductItem } from './ProductList';

const FILTERS = [{ id: 'all', label: '전체' }, ...RESERVATION_STATUSES];

const DONE_MESSAGE = {
  requested: '요청 상태로 되돌렸어요',
  confirmed: '예약을 확정했어요 · 학부모께 연락해 주세요',
  cancelled: '예약을 취소했어요'
};

/**
 * 예약 탭 (docs/recommended-shop/05-reservations.md) — 공개 상점에서 들어온 예약 요청.
 * 상태는 요청 → 확정 / 취소 이고, 잘못 누른 것을 되돌릴 수 있게 어느 쪽으로든 바꿀 수 있다.
 * 학부모에게 자동으로 알리지 않는다 — 선생님이 남긴 번호로 직접 연락한다.
 *
 * onRequestedChange(n) — 처리 전(요청) 개수가 바뀌면 탭 옆 숫자를 맞춘다.
 */
function ShopReservations({ onRequestedChange, showToast }) {
  const [list, setList] = useState(null);
  const [error, setError] = useState(false);
  const [filter, setFilter] = useState('all');
  const onRequestedChangeRef = useRef(onRequestedChange);
  onRequestedChangeRef.current = onRequestedChange;

  // 목록이 바뀔 때마다 탭 옆 숫자(처리 전 요청)를 맞춘다
  useEffect(() => {
    if (list) onRequestedChangeRef.current?.(countByStatus(list).requested);
  }, [list]);

  const setStatusOf = (id, status) =>
    setList((current) => current.map((r) => (r.id === id ? { ...r, status } : r)));

  const load = async () => {
    setError(false);
    try {
      const response = await fetchWithAuth('/api/shop/reservations');
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      setList(data.reservations || []);
    } catch (err) {
      console.error('예약 목록 조회 실패:', err);
      setError(true);
    }
  };

  useEffect(() => {
    load();
  }, []);

  // 화면을 먼저 바꾸고, 저장이 실패하면 그 행만 되돌린다
  const changeStatus = async (reservation, status) => {
    if (reservation.status === status) return;
    setStatusOf(reservation.id, status);
    try {
      const response = await fetchWithAuth(`/api/shop/reservations/${reservation.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status })
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const { reservation: saved } = await response.json();
      setList((current) => current.map((r) => (r.id === saved.id ? saved : r)));
      showToast?.(DONE_MESSAGE[status]);
    } catch (err) {
      console.error('예약 상태 변경 실패:', err);
      setStatusOf(reservation.id, reservation.status);
      showToast?.('상태를 바꾸지 못했어요');
    }
  };

  const refresh = (
    <Button size="sm" variant="ghost" icon="refresh" onClick={() => { setList(null); load(); }}>새로고침</Button>
  );

  if (error) {
    return (
      <Callout tone="danger">
        예약을 불러오지 못했어요.{' '}
        <button type="button" className="ui-link" onClick={() => { setList(null); load(); }}>다시 시도</button>
      </Callout>
    );
  }

  if (!list) return <SkeletonList rows={3} />;

  if (list.length === 0) {
    return (
      <Card>
        <EmptyState
          icon="calendar"
          title="아직 예약 요청이 없어요"
          description="상품 등록·수정에서 ‘예약 받기’를 켜면 공개 상점의 상품 상세에 [예약하기] 버튼이 생겨요. 학부모가 남긴 예약이 여기에 모여요."
          action={refresh}
        />
      </Card>
    );
  }

  const counts = countByStatus(list);
  const rows = filter === 'all' ? list : list.filter((r) => r.status === filter);

  const columns = [
    {
      key: 'date',
      header: '예약 날짜',
      width: '132px',
      render: (r) => <span className="shop-reserve-date">{formatIsoDate(r.reservedDate)}</span>
    },
    {
      key: 'product',
      header: '상품',
      render: (r) => (
        <ProductItem
          product={{ title: r.productTitle, imageUrl: r.imageUrl }}
          subtitle={r.productId == null ? <span className="ui-text-subtle">삭제된 상품</span> : null}
        />
      )
    },
    { key: 'name', header: '이름', width: '120px', render: (r) => r.name },
    {
      key: 'phone',
      header: '전화번호',
      width: '140px',
      render: (r) => <a className="ui-link" href={`tel:${r.phone.replace(/\D/g, '')}`}>{r.phone}</a>
    },
    { key: 'createdAt', header: '요청 시각', width: '104px', render: (r) => formatRequestedAt(r.createdAt) },
    {
      key: 'status',
      header: '상태',
      width: '196px',
      render: (r) => (
        <Segmented
          items={RESERVATION_STATUSES}
          value={r.status}
          onChange={(status) => changeStatus(r, status)}
          aria-label={`${r.name} 예약 상태`}
        />
      )
    }
  ];

  return (
    <>
      <Toolbar aria-label="예약 상태">
        {FILTERS.map((f) => (
          <Chip key={f.id} selected={filter === f.id} count={counts[f.id]} onClick={() => setFilter(f.id)}>
            {f.label}
          </Chip>
        ))}
        <span style={{ flex: 1 }} />
        {refresh}
      </Toolbar>

      <DataTable
        className="shop-reserve-list"
        columns={columns}
        rows={rows}
        rowProps={(r) => ({ 'data-status': r.status })}
        caption="최근 요청이 위에 있어요 · 확정하면 남긴 번호로 연락해 주세요"
        empty={(
          <Card>
            <EmptyState icon="inbox" title="이 상태의 예약이 없어요" description="다른 상태를 골라 보세요." />
          </Card>
        )}
      />
    </>
  );
}

export default ShopReservations;
