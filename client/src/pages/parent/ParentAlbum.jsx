import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import ParentLayout from '../../components/parent/ParentLayout';
import MediaGrid from '../../components/album/MediaGrid';
import MediaViewer from '../../components/album/MediaViewer';
import UploadSheet from '../../components/album/UploadSheet';
import { fetchWithAuth } from '../../utils/api';
import { applyTypeFilter, countsOf, formatTime, uploaderLabel } from '../../utils/albumFilter';

const TYPE_FILTERS = [
  { key: 'all', label: '전체' },
  { key: 'photo', label: '사진' },
  { key: 'video', label: '영상' },
  { key: 'uploaded', label: '내가 올린 것' }
];

/**
 * 앨범 갤러리.
 *
 * "우리 아이 사진만 보기" 는 서버가 태그로 걸러 주고(mine=1), 사진/영상/내가 올린 것은
 * 화면에서 한 번 더 거른다. 사진을 누르면 뷰어가 열리고 거기서 원본을 저장할 수 있다.
 */
function ParentAlbum() {
  const { eventId } = useParams();
  const navigate = useNavigate();

  const [data, setData] = useState(null);
  const [denied, setDenied] = useState(null);
  const [mineOnly, setMineOnly] = useState(false);
  const [childId, setChildId] = useState(null);
  const [typeFilter, setTypeFilter] = useState('all');
  const [viewerId, setViewerId] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (mineOnly) params.set('mine', '1');
      if (mineOnly && childId) params.set('studentId', String(childId));

      const response = await fetchWithAuth(`/api/parent/events/${eventId}/media?${params.toString()}`);
      const payload = await response.json().catch(() => ({}));

      if (response.status === 403) { setDenied(payload.error || '아직 사진을 볼 수 없어요.'); setData(null); return; }
      if (!response.ok) { setDenied('사진을 불러오지 못했어요.'); return; }

      setDenied(null);
      setData(payload);
      setChildId((prev) => prev ?? payload.children?.[0]?.studentId ?? null);
    } catch (error) {
      console.error('앨범 조회 실패:', error);
      setDenied('사진을 불러오지 못했어요.');
    }
  }, [eventId, mineOnly, childId]);

  useEffect(() => { load(); }, [load]);

  const toast = (text) => {
    setMessage(text);
    setTimeout(() => setMessage(''), 2600);
  };

  const confirmCandidate = async (mediaId, studentId, confirmed) => {
    try {
      const response = await fetchWithAuth(`/api/parent/events/${eventId}/media/${mediaId}/confirm`, {
        method: 'POST',
        body: JSON.stringify({ studentId, confirmed })
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        toast(payload.error || '확인하지 못했어요.');
        return;
      }
      toast(confirmed ? '우리 아이 사진으로 저장했어요' : '다음부터 보여드리지 않을게요');
      load();
    } catch (error) {
      console.error('사진 확인 실패:', error);
      toast('확인하지 못했어요.');
    }
  };

  const removeMedia = async (item) => {
    if (!window.confirm('이 사진을 지울까요? Drive 휴지통으로 옮겨져요.')) return;
    try {
      const response = await fetchWithAuth(`/api/parent/events/${eventId}/media/${item.id}`, { method: 'DELETE' });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) { toast(payload.error || '지우지 못했어요.'); return; }
      setViewerId(null);
      toast('Drive 휴지통으로 옮겼어요');
      load();
    } catch (error) {
      console.error('사진 삭제 실패:', error);
      toast('지우지 못했어요.');
    }
  };

  if (denied) {
    return (
      <ParentLayout title="사진">
        <div style={{ textAlign: 'center', padding: '50px 20px' }}>
          <div style={{ fontSize: '2.5rem' }}>🔒</div>
          <div style={{ fontSize: '1rem', fontWeight: 700, marginTop: '8px' }}>아직 사진을 볼 수 없어요</div>
          <div style={{ fontSize: '0.8125rem', color: 'var(--color-gray-500)', lineHeight: 1.6, marginTop: '6px' }}>
            {denied}<br />신청 후 선생님이 확정하면 바로 열려요.
          </div>
          <button
            type="button"
            className="btn btn-outline btn-sm"
            style={{ marginTop: '12px' }}
            onClick={() => navigate('/parent/schedule')}
          >일정으로 가기</button>
        </div>
      </ParentLayout>
    );
  }

  if (!data) {
    return (
      <ParentLayout title="사진">
        <div style={{ textAlign: 'center', color: 'var(--color-gray-500)', padding: '40px 0' }}>불러오는 중...</div>
      </ParentLayout>
    );
  }

  const children = data.children || [];
  const selectedChild = children.find((child) => child.studentId === childId) || children[0];
  const visible = applyTypeFilter(data.items || [], typeFilter);
  const counts = countsOf(data.items || []);
  const candidates = mineOnly ? (data.candidates || []) : [];
  const uploadOpen = data.event?.uploadOpen;

  return (
    <ParentLayout title={data.event?.title || '사진'} subtitle={`${data.event?.date || ''} · 사진 ${counts.photo} · 영상 ${counts.video}`}>
      <button
        type="button"
        onClick={() => setMineOnly((prev) => !prev)}
        aria-pressed={mineOnly}
        style={{
          display: 'flex', alignItems: 'center', gap: '10px', width: '100%', textAlign: 'left',
          background: mineOnly ? 'var(--color-primary-bg)' : 'var(--bg-tertiary)',
          border: `1px solid ${mineOnly ? 'var(--color-primary)' : 'var(--color-gray-200)'}`,
          borderRadius: 'var(--radius-md)', padding: '10px 12px', cursor: 'pointer',
          fontFamily: 'inherit', marginBottom: '10px'
        }}
      >
        <span style={{ fontSize: '1.1rem' }}>🙂</span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <b style={{ display: 'block', fontSize: '0.875rem', fontWeight: 700 }}>우리 아이 사진만 보기</b>
          <span style={{ fontSize: '0.6875rem', color: mineOnly ? 'var(--color-primary-dark)' : 'var(--color-gray-500)' }}>
            {mineOnly
              ? `${selectedChild?.name || '우리 아이'} 얼굴로 찾은 사진만 보고 있어요`
              : '얼굴로 자동으로 찾아드려요'}
          </span>
        </span>
        <span
          aria-hidden="true"
          style={{
            width: '44px', height: '26px', borderRadius: 'var(--radius-full)', flexShrink: 0, position: 'relative',
            background: mineOnly ? 'var(--color-primary)' : 'var(--color-gray-300)', transition: 'background .18s'
          }}
        >
          <span style={{
            position: 'absolute', top: '3px', left: mineOnly ? '21px' : '3px', width: '20px', height: '20px',
            borderRadius: '50%', background: '#fff', transition: 'left .18s', boxShadow: '0 1px 3px rgba(0,0,0,.2)'
          }} />
        </span>
      </button>

      {mineOnly && children.length > 1 && (
        <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', paddingBottom: '2px', marginBottom: '8px' }}>
          {children.map((child) => (
            <button
              key={child.studentId}
              type="button"
              onClick={() => setChildId(child.studentId)}
              aria-pressed={child.studentId === childId}
              style={chipStyle(child.studentId === childId, true)}
            >{child.name}</button>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', paddingBottom: '2px', marginBottom: '4px' }}>
        {TYPE_FILTERS.map((filter) => (
          <button
            key={filter.key}
            type="button"
            onClick={() => setTypeFilter(filter.key)}
            aria-pressed={typeFilter === filter.key}
            style={chipStyle(typeFilter === filter.key)}
          >
            {filter.label} <span style={{ fontSize: '0.6875rem', opacity: 0.7, fontWeight: 700 }}>{counts[filter.key]}</span>
          </button>
        ))}
      </div>

      {mineOnly && candidates.length > 0 && (
        <div style={{
          background: '#fff', border: '1px solid var(--color-primary)', borderRadius: 'var(--radius-md)',
          padding: '12px', margin: '10px 0'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8125rem', fontWeight: 800, marginBottom: '4px' }}>
            🤔 혹시 우리 아이? <span className="badge badge-warning">{candidates.length}장</span>
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--color-gray-500)', lineHeight: 1.5, marginBottom: '6px' }}>
            비슷하지만 확실하지 않아요. 확인해 주시면 다음부터 더 정확해져요.
          </div>
          {candidates.map((item) => (
            <div key={item.id} style={{
              display: 'flex', gap: '10px', alignItems: 'center', padding: '8px 0',
              borderTop: '1px solid var(--color-gray-100)'
            }}>
              <img
                src={item.thumbnailUrl}
                alt=""
                onClick={() => setViewerId(item.id)}
                style={{ width: '58px', height: '58px', borderRadius: 'var(--radius-sm)', objectFit: 'cover', flexShrink: 0, background: 'var(--color-gray-200)', cursor: 'pointer' }}
              />
              <div style={{ flex: 1, minWidth: 0, fontSize: '0.75rem', color: 'var(--color-gray-500)' }}>
                <b style={{ display: 'block', fontSize: '0.8125rem', color: 'var(--color-gray-800)' }}>{formatTime(item.takenAt)}</b>
                {uploaderLabel(item.uploader)} 올림
              </div>
              <div style={{ display: 'flex', gap: '6px' }}>
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  onClick={() => confirmCandidate(item.id, item.myTags?.[0]?.studentId ?? childId, false)}
                >아니에요</button>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={() => confirmCandidate(item.id, item.myTags?.[0]?.studentId ?? childId, true)}
                >맞아요</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {mineOnly && selectedChild && !visible.length && !candidates.length && (
        <div style={{
          background: 'var(--color-primary-bg)', color: 'var(--color-primary-dark)', fontSize: '0.8125rem',
          padding: '12px', borderRadius: 'var(--radius-md)', lineHeight: 1.6, marginTop: '10px'
        }}>
          <b>{selectedChild.name}</b> 사진을 아직 찾지 못했어요.
          얼굴 사진을 등록하면 우리 아이가 나온 사진만 모아 볼 수 있어요.
          <button
            type="button"
            className="btn btn-primary btn-sm"
            style={{ width: '100%', marginTop: '9px' }}
            onClick={() => navigate('/parent/settings')}
          >얼굴 사진 등록하러 가기</button>
        </div>
      )}

      {visible.length > 0 ? (
        <MediaGrid items={visible} columns={3} onOpen={(item) => setViewerId(item.id)} />
      ) : (!mineOnly && (
        <div style={{ textAlign: 'center', padding: '44px 20px' }}>
          <div style={{ fontSize: '2.5rem' }}>{typeFilter === 'video' ? '🎬' : '📷'}</div>
          <div style={{ fontSize: '1rem', fontWeight: 700, marginTop: '8px' }}>
            {typeFilter === 'video' ? '영상이 없어요' : typeFilter === 'uploaded' ? '아직 올린 사진이 없어요' : '아직 사진이 없어요'}
          </div>
          <div style={{ fontSize: '0.8125rem', color: 'var(--color-gray-500)', lineHeight: 1.6, marginTop: '6px' }}>
            우하단 [+ 올리기] 로 사진·영상을 올려 보세요.
          </div>
        </div>
      ))}

      {visible.length > 0 && (
        <div style={{ fontSize: '0.75rem', color: 'var(--color-gray-400)', textAlign: 'center', padding: '14px 2px 0', lineHeight: 1.6 }}>
          사진을 누르면 크게 보고 저장할 수 있어요<br />원본 화질 그대로 Google Drive 에 보관돼요
        </div>
      )}

      <button
        type="button"
        onClick={() => uploadOpen && setUploading(true)}
        disabled={!uploadOpen}
        style={{
          position: 'fixed', right: '16px', bottom: 'calc(74px + env(safe-area-inset-bottom))',
          height: '50px', padding: '0 18px', borderRadius: 'var(--radius-full)',
          background: uploadOpen ? 'var(--color-primary)' : 'var(--color-gray-400)', color: '#fff',
          border: 'none', fontWeight: 800, fontSize: '0.9375rem', fontFamily: 'inherit',
          boxShadow: uploadOpen ? '0 6px 18px rgba(49,130,246,.4)' : 'none',
          cursor: uploadOpen ? 'pointer' : 'not-allowed', zIndex: 15
        }}
      >{uploadOpen ? '＋ 올리기' : '업로드 마감'}</button>

      {viewerId && (
        <MediaViewer
          items={visible}
          startId={viewerId}
          onClose={() => setViewerId(null)}
          onDelete={removeMedia}
        />
      )}

      {uploading && (
        <UploadSheet
          apiBase={`/api/parent/events/${eventId}`}
          eventTitle={data.event?.title}
          onClose={() => { setUploading(false); load(); }}
          onDone={load}
        />
      )}

      {message && (
        <div style={{
          position: 'fixed', left: '50%', transform: 'translateX(-50%)',
          bottom: 'calc(130px + env(safe-area-inset-bottom))',
          background: 'rgba(25,31,40,.94)', color: '#fff', padding: '10px 16px',
          borderRadius: 'var(--radius-md)', fontSize: '0.8125rem', fontWeight: 600,
          zIndex: 250, maxWidth: '88%', textAlign: 'center'
        }}>{message}</div>
      )}
    </ParentLayout>
  );
}

const chipStyle = (active, primary = false) => ({
  display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '6px 11px',
  borderRadius: 'var(--radius-full)', whiteSpace: 'nowrap', cursor: 'pointer',
  fontFamily: 'inherit', fontSize: '0.78rem', fontWeight: 600, minHeight: '34px',
  border: `1px solid ${active ? (primary ? 'var(--color-primary)' : 'var(--color-gray-900)') : 'var(--color-gray-200)'}`,
  background: active ? (primary ? 'var(--color-primary)' : 'var(--color-gray-900)') : '#fff',
  color: active ? '#fff' : 'var(--color-gray-700)'
});

export default ParentAlbum;
