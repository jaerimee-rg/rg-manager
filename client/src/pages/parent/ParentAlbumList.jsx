import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import ParentLayout from '../../components/parent/ParentLayout';
import RetryImage from '../../components/album/RetryImage';
import AlbumCovers from '../../components/album/AlbumCovers';
import { Spinner } from '../../components/ui';
import { fetchWithAuth } from '../../utils/api';
import { albumSummaryText } from '../../utils/albumFilter';

/**
 * 사진 탭 — 선생님이 공개한 앨범 중 내가 볼 수 있는 것(공개 범위 안의 이벤트 앨범 + 사진 전용 폴더)만 보인다.
 * 일정에서 대회를 눌러 들어올 수도 있고, 여기서 모아 볼 수도 있다. 카드 표지는 선생님이 고른 대표 사진(없으면 최근 사진).
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
        <Spinner />
      </ParentLayout>
    );
  }

  if (!albums.length) {
    return (
      <ParentLayout title="사진" subtitle="선생님이 공개한 앨범">
        <div style={{ textAlign: 'center', padding: '50px 20px' }}>
          <div style={{ fontSize: '2.5rem' }}>📷</div>
          <div style={{ fontSize: '1rem', fontWeight: 700, marginTop: '8px' }}>아직 공개된 앨범이 없어요</div>
          <div style={{ fontSize: '0.8125rem', color: 'var(--color-gray-500)', lineHeight: 1.6, marginTop: '6px' }}>
            선생님이 대회·이벤트 앨범을 공개하면<br />여기에 바로 보여요.
          </div>
        </div>
      </ParentLayout>
    );
  }

  return (
    <ParentLayout title="사진" subtitle="선생님이 공개한 앨범">
      {albums.map((album) => (
        <button
          key={album.eventId}
          type="button"
          onClick={() => navigate(`/parent/photos/${album.eventId}`)}
          style={{
            display: 'block', width: '100%', textAlign: 'left', padding: 0, marginBottom: '12px',
            background: 'var(--surface)', borderRadius: 'var(--shape-panel)', overflow: 'hidden',
            border: 'var(--stroke)',
            cursor: 'pointer', fontFamily: 'inherit'
          }}
        >
          {/* 선생님이 대표 사진을 골랐으면 그것만 — 선생님 사진 목록과 같은 표지(16:10, 장수에 따라 놓는 모양이 다르다).
              안 골랐으면 최근 사진 줄. 줄은 행 높이를 묶고 넘침을 자른다 — 안 그러면 세로 사진(휴대폰 영상)이 원래 비율대로
              행을 늘려 아래 제목·날짜 글자를 덮는다. 4:1 이라 어느 폭에서도 칸이 정사각형이다. */}
          {album.covers?.length ? (
            <AlbumCovers urls={album.covers} data-testid="album-covers" />
          ) : (
            <div
              data-testid="album-previews"
              style={{
                display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gridTemplateRows: 'minmax(0, 1fr)',
                gap: '2px', aspectRatio: '4 / 1', overflow: 'hidden', background: 'var(--color-gray-100)'
              }}
            >
              {(album.previews || []).slice(0, 4).map((url, i) => (
                <RetryImage
                  key={i}
                  src={url}
                  loading="lazy"
                  style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', background: 'var(--color-gray-200)' }}
                />
              ))}
            </div>
          )}

          <div style={{ padding: '12px 14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
              {/* 사진 전용 폴더는 이벤트가 아니다 (photo-menu FR-517) */}
              <span className={`badge ${album.type === 'competition' ? 'badge-danger' : album.type === 'folder' ? 'badge-gray' : 'badge-purple'}`}>
                {album.type === 'competition' ? '🏆 대회' : album.type === 'folder' ? '📁 사진' : '⭐ 스페셜'}
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
        padding: '11px 12px', borderRadius: 'var(--shape-box)', lineHeight: 1.55
      }}>
        선생님이 공개한 앨범만 보여요. 이벤트 사진은 일정에서 그 이벤트를 눌러 들어올 수도 있어요.
      </div>
    </ParentLayout>
  );
}

export default ParentAlbumList;
