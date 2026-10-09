import React, { useCallback, useEffect, useState } from 'react';
import { fetchWithAuth } from '../../utils/api';
import { Button, Chip, DataTable, EmptyState, Toolbar } from '../../components/ui';
import RetryImage from '../../components/album/RetryImage';

const PAGE = 50;
const KINDS = [
  { key: 'all', label: '전체' },
  { key: 'album', label: '앨범 열기' },
  { key: 'media', label: '사진 보기' }
];

const formatTime = (iso) => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso || '';
  return date.toLocaleString('ko-KR', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
  });
};

/** 무엇을 봤는지 — 앨범 열기 · 사진(썸네일 + 파일 이름) · 지운 사진 */
const SeenCell = ({ row }) => {
  if (row.kind === 'album') return <span>앨범 열기</span>;
  if (row.mediaDeleted) return <span className="ui-text-subtle">(지운 사진)</span>;
  return (
    <span className="ui-row" data-gap="2">
      {row.thumbnailUrl && <RetryImage src={row.thumbnailUrl} className="ui-photo-log__thumb" loading="lazy" />}
      <span>{row.fileName || (row.mediaKind === 'video' ? '영상' : '사진')}</span>
    </span>
  );
};

/**
 * 관리자 → 로그 → 사진 보기 로그 — 학부모가 어느 선생님의 어느 앨범 · 어떤 사진을 언제 봤는지 (최근 것부터).
 * 같은 사람이 잠깐 사이 다시 본 것은 한 줄로 남는다(앨범 30분 · 사진 10분, server/models/AlbumView.js).
 */
function AdminPhotoViewLogs() {
  const [kind, setKind] = useState('all');
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async (offset = 0) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: String(PAGE), offset: String(offset) });
      if (kind !== 'all') params.set('kind', kind);
      const response = await fetchWithAuth(`/api/logs/photo-views?${params.toString()}`);
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) { setError(payload.error || '로그를 불러오지 못했어요.'); return; }
      setError('');
      setTotal(payload.total || 0);
      setItems((prev) => (offset ? [...prev, ...(payload.items || [])] : payload.items || []));
    } catch (loadError) {
      console.error('사진 보기 로그 조회 실패:', loadError);
      setError('로그를 불러오지 못했어요.');
    } finally {
      setLoading(false);
    }
  }, [kind]);

  useEffect(() => { load(0); }, [load]);

  const columns = [
    { key: 'time', header: '시각', width: '150px', render: (row) => formatTime(row.createdAt) },
    { key: 'viewer', header: '학부모', width: '120px', render: (row) => row.viewerName },
    { key: 'teacher', header: '선생님', width: '110px', render: (row) => row.teacherName || '—' },
    { key: 'album', header: '앨범', render: (row) => `${row.eventDate || ''} ${row.eventTitle || ''}`.trim() },
    { key: 'seen', header: '본 것', render: (row) => <SeenCell row={row} /> }
  ];

  return (
    <div className="ui-stack" data-gap="3">
      <Toolbar>
        {KINDS.map((option) => (
          <Chip key={option.key} selected={kind === option.key} onClick={() => setKind(option.key)}>{option.label}</Chip>
        ))}
      </Toolbar>
      {error && <p className="ui-field__error" role="alert">{error}</p>}
      <p className="ui-text-subtle">모두 {total}건 · 같은 사람이 잠깐 사이 다시 본 것은 한 줄로 남아요(앨범 30분 · 사진 10분)</p>
      <DataTable
        columns={columns}
        rows={items}
        caption="사진 보기 로그"
        empty={<EmptyState icon="image" title="아직 기록이 없어요" description="학부모가 사진 탭에서 앨범을 열면 여기에 남아요." />}
      />
      {items.length < total && (
        <div className="ui-row" data-justify="center">
          <Button loading={loading} onClick={() => load(items.length)}>더 보기</Button>
        </div>
      )}
    </div>
  );
}

export default AdminPhotoViewLogs;
