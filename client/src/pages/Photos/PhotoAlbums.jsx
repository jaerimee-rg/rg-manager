import React, { useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { fetchWithAuth } from '../../utils/api';
import UploadSheet from '../../components/album/UploadSheet';
import RetryImage from '../../components/album/RetryImage';
import AlbumCovers from '../../components/album/AlbumCovers';
import {
  Badge, Button, Callout, Card, EmptyState, Icon, PageHeader, SkeletonList, Toast
} from '../../components/ui';
import { canUploadWith, driveNotice, formatEventDate, typeLabel, PROBLEM_MESSAGES } from './albumState';

/**
 * 선생님 사진 메뉴 — 앨범 목록 (docs/photo-menu FR-510~516).
 *
 * 앨범 하나 = 이벤트 하나. [사진 올리기] 는 먼저 "어느 이벤트 사진인가요?" 를 묻고,
 * 고른 이벤트에 사진을 연결한다(앨범이 없던 이벤트면 서버가 이벤트 이름 폴더를 만든다).
 * 맞는 이벤트가 없으면 그 자리에서 이름·날짜로 사진 전용 폴더를 만든다(FR-517) — 이벤트는 생기지 않는다.
 * Google 계정 연결은 설정에서만 한다 — 여기서는 안내하고 설정으로 보낸다.
 */
function PhotoAlbums() {
  const navigate = useNavigate();
  const location = useLocation();
  // 앨범 화면에서 폴더를 지우고 돌아왔을 때의 알림 (FR-519) — 한 번만 보이게 주소 상태에서 지운다
  const [toast, setToast] = useState(() => location.state?.toast || '');
  useEffect(() => {
    if (!location.state?.toast) return undefined;
    navigate(location.pathname, { replace: true, state: null });
    const timer = setTimeout(() => setToast(''), 3200);
    return () => clearTimeout(timer);
    // 처음 한 번만
  }, []);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(false);
  const [doneEventId, setDoneEventId] = useState(null);

  const load = useCallback(async () => {
    try {
      const response = await fetchWithAuth('/api/albums');
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) { setError(payload.error || '사진 목록을 불러오지 못했어요.'); return; }
      setError('');
      setData(payload);
    } catch (loadError) {
      console.error('사진 목록 조회 실패:', loadError);
      setError('사진 목록을 불러오지 못했어요.');
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const notice = driveNotice(data?.drive);
  const ready = canUploadWith(data?.drive);
  const albums = data?.albums || [];

  const closeUpload = () => {
    setUploading(false);
    // 다 올렸으면 그 앨범으로 간다(FR-514). 중간에 닫았으면 목록만 새로 읽는다.
    if (doneEventId) navigate(`/photos/${doneEventId}`);
    else load();
  };

  const uploadButton = (
    <Button variant="primary" icon="upload" disabled={!ready} onClick={() => { setDoneEventId(null); setUploading(true); }}>
      사진 올리기
    </Button>
  );

  return (
    <>
      <PageHeader
        title="사진"
        description="사진을 올릴 때 이벤트를 고르면 그 이벤트에 연결되고, 이벤트가 없으면 새 폴더를 만들어 올려요. 공개한 앨범만 학부모 ‘사진’ 탭(이벤트면 이벤트 상세에도)에 보여요."
        actions={uploadButton}
      />

      {error && <Callout tone="danger">{error}</Callout>}

      {notice && (
        <div className="ui-mb-4">
          <Callout tone={notice === 'error' ? 'danger' : notice === 'not_configured' ? 'neutral' : 'warning'}>
            {notice === 'not_connected' ? (
              <><b>사진은 선생님 Google Drive 에 저장돼요.</b> 설정에서 Google 계정을 먼저 연결해 주세요.</>
            ) : notice === 'error' ? PROBLEM_MESSAGES.drive_error : PROBLEM_MESSAGES.not_configured}
            {notice !== 'not_configured' && (
              <div className="ui-mt-2">
                <Button size="sm" variant="primary" onClick={() => navigate('/settings')}>
                  {notice === 'error' ? '설정에서 다시 연결' : '설정으로 가기'}
                  <Icon name="arrowRight" size={16} />
                </Button>
              </div>
            )}
          </Callout>
        </div>
      )}

      {!data && !error && <SkeletonList rows={3} />}

      {data && albums.length === 0 && (
        <Card padding="lg">
          <EmptyState
            icon="image"
            title="아직 앨범이 없어요"
            description="사진을 올릴 때 이벤트를 고르거나 새 폴더를 만들면, Drive 에 그 이름의 폴더가 생기고 앨범이 만들어져요."
            action={uploadButton}
          />
        </Card>
      )}

      {albums.length > 0 && (
        <div className="ui-grid" data-auto="true">
          {albums.map((album) => (
            <AlbumCard key={album.eventId} album={album} onOpen={() => navigate(`/photos/${album.eventId}`)} />
          ))}
        </div>
      )}

      {uploading && (
        <UploadSheet
          targets={data?.targets || []}
          rootFolderName={data?.drive?.rootFolderName}
          allowPublish
          audienceHint="공개하면 학부모도 볼 수 있어요"
          onClose={closeUpload}
          onDone={(result) => { if (result?.eventId && result.uploaded > 0) setDoneEventId(result.eventId); }}
        />
      )}

      <Toast>{toast}</Toast>
    </>
  );
}

/** 앨범 카드 — 표지는 선생님이 고른 대표 사진·영상들(covers, 최대 4장 · 영상도 표시 없이 그 장면만), 없으면 최근 사진 4장 */
function AlbumCard({ album, onOpen }) {
  const counts = album.counts || {};
  const previews = (album.previews || []).slice(0, 4);
  return (
    <button type="button" className="ui-album-card" onClick={onOpen}>
      {album.covers?.length ? (
        <AlbumCovers urls={album.covers} crops={album.coverCrops} />
      ) : previews.length ? (
        <div className="ui-album-card__cover">
          {previews.map((url) => <RetryImage key={url} src={url} loading="lazy" />)}
        </div>
      ) : (
        <div className="ui-album-card__cover" data-empty><Icon name="image" size={22} />아직 사진이 없어요</div>
      )}
      <div className="ui-album-card__body">
        <h3 className="ui-album-card__title">{album.title}</h3>
        <div className="ui-album-card__meta">
          <span>{formatEventDate(album.date)} · {typeLabel(album.type)}</span>
          <span>사진 {counts.images || 0}{counts.videos ? ` · 영상 ${counts.videos}` : ''}</span>
          {album.viewers > 0 && <span><Icon name="eye" size={13} /> {album.viewers}명이 봤어요</span>}
        </div>
        <div className="ui-album-card__badges">
          {album.published ? (
            <>
              <Badge tone="success" dot>공개</Badge>
              <Badge tone="neutral">{album.audience === 'all' ? '모든 학부모' : '참가 학부모'}</Badge>
            </>
          ) : <Badge tone="muted" dot>비공개</Badge>}
          {counts.fromParents > 0 && <Badge tone="neutral">학부모가 올린 {counts.fromParents}장</Badge>}
        </div>
      </div>
    </button>
  );
}

export default PhotoAlbums;
