import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import ParentLayout from '../../components/parent/ParentLayout';
import { fetchWithAuth } from '../../utils/api';
import { albumSummaryText } from '../../utils/albumFilter';

/**
 * 사진 탭 — 자녀가 확정된 이벤트의 앨범만 보인다.
 * 일정에서 대회를 눌러 들어올 수도 있고, 여기서 모아 볼 수도 있다.
 */
function ParentAlbumList() {
  const navigate = useNavigate();
  const [albums, setAlbums] = useState(null);

  useEffect(() => {
    const load = async () => {
      try {
        const response = await fetchWithAuth('/api/parent/albums');
        if (!response.ok) return;
        const data = await response.json();
        setAlbums(data.items || []);
      } catch (error) {
        console.error('앨범 목록 조회 실패:', error);
      } finally {
        setAlbums((prev) => prev ?? []);
      }
    };
    load();
  }, []);

  if (albums === null) {
    return (
      <ParentLayout title="사진">
        <div style={{ textAlign: 'center', color: 'var(--color-gray-500)', padding: '40px 0' }}>불러오는 중...</div>
      </ParentLayout>
    );
  }

  if (!albums.length) {
    return (
      <ParentLayout title="사진" subtitle="확정된 이벤트의 앨범">
        <div style={{ textAlign: 'center', padding: '50px 20px' }}>
          <div style={{ fontSize: '2.5rem' }}>📷</div>
          <div style={{ fontSize: '1rem', fontWeight: 700, marginTop: '8px' }}>아직 앨범이 없어요</div>
          <div style={{ fontSize: '0.8125rem', color: 'var(--color-gray-500)', lineHeight: 1.6, marginTop: '6px' }}>
            확정된 대회의 사진이 여기에 모여요.<br />선생님이 앨범을 열면 바로 보여요.
          </div>
        </div>
      </ParentLayout>
    );
  }

  return (
    <ParentLayout title="사진" subtitle="확정된 이벤트의 앨범">
      {albums.map((album) => (
        <button
          key={album.eventId}
          type="button"
          onClick={() => navigate(`/parent/photos/${album.eventId}`)}
          style={{
            display: 'block', width: '100%', textAlign: 'left', padding: 0, marginBottom: '12px',
            background: '#fff', borderRadius: 'var(--radius-lg)', overflow: 'hidden',
            border: '1px solid transparent', boxShadow: '0 1px 2px rgba(0,0,0,.04)',
            cursor: 'pointer', fontFamily: 'inherit'
          }}
        >
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '2px', height: '88px', background: 'var(--color-gray-100)' }}>
            {(album.previews || []).slice(0, 4).map((url, i) => (
              <img
                key={i}
                src={url}
                alt=""
                loading="lazy"
                style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', background: 'var(--color-gray-200)' }}
                onError={(event) => { event.currentTarget.style.visibility = 'hidden'; }}
              />
            ))}
          </div>

          <div style={{ padding: '12px 14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
              <span className={`badge ${album.type === 'competition' ? 'badge-danger' : 'badge-purple'}`}>
                {album.type === 'competition' ? '🏆 대회' : '⭐ 스페셜'}
              </span>
              <span className={`badge ${album.uploadOpen ? 'badge-primary' : 'badge-gray'}`}>
                {album.uploadOpen ? '사진 올릴 수 있어요' : '업로드 마감'}
              </span>
            </div>

            <div style={{ fontSize: '0.9375rem', fontWeight: 700, lineHeight: 1.35, wordBreak: 'keep-all' }}>
              {album.title}
            </div>

            <div style={{
              fontSize: '0.75rem', color: 'var(--color-gray-500)', marginTop: '5px',
              display: 'flex', flexWrap: 'wrap', gap: '4px 10px'
            }}>
              <span>📅 {album.date}</span>
              {album.location && <span>📍 {album.location}</span>}
            </div>

            <div style={{
              fontSize: '0.75rem', color: 'var(--color-gray-500)', marginTop: '5px',
              display: 'flex', flexWrap: 'wrap', gap: '4px 10px'
            }}>
              <span>{albumSummaryText(album.counts)}</span>
              {album.counts?.mine
                ? <span style={{ color: 'var(--color-primary)', fontWeight: 700 }}>우리 아이 {album.counts.mine}장</span>
                : <span style={{ color: 'var(--color-gray-400)' }}>우리 아이 사진 없음</span>}
            </div>
          </div>
        </button>
      ))}

      <div style={{
        background: 'var(--color-gray-100)', color: 'var(--color-gray-600)', fontSize: '0.8125rem',
        padding: '11px 12px', borderRadius: 'var(--radius-md)', lineHeight: 1.55
      }}>
        확정된 이벤트의 앨범만 보여요. 일정에서 대회를 눌러 들어올 수도 있어요.
      </div>
    </ParentLayout>
  );
}

export default ParentAlbumList;
