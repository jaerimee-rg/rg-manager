import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { fetchWithAuth } from '../../utils/api';
import { formatSize } from '../../utils/mediaUrls';
import UploadSheet from '../../components/album/UploadSheet';
import MediaViewer from '../../components/album/MediaViewer';
import {
  Button, Callout, Card, Chip, ConfirmDialog, EmptyState, Icon, PageHeader, SkeletonList, StickyActions, Toast, Toolbar
} from '../../components/ui';
import PublishPanel from './PublishPanel';
import PhotoGrid from './PhotoGrid';
import {
  albumProblem, filterChips, formatEventDate, publishLocked, typeLabel, toViewerItem, PROBLEM_MESSAGES
} from './albumState';

const PAGE = 60;

/**
 * 선생님 사진 메뉴 — 앨범 하나 (docs/photo-menu FR-520~529).
 *
 * 위: 학부모 공개 패널 + Drive 폴더 카드. 아래: 필터 칩과 사진 칸, 고르기 모드(숨기기 · 다시 보이기 · 지우기).
 * Google 연결이 끊기거나 폴더가 사라져도 읽기는 계속되고 쓰기 버튼만 막힌다.
 */
function PhotoAlbum() {
  const { eventId } = useParams();
  const navigate = useNavigate();
  const apiBase = `/api/events/${eventId}`;

  const [album, setAlbum] = useState(null);
  const [notFound, setNotFound] = useState(false);
  const [filter, setFilter] = useState('all');
  const [items, setItems] = useState([]);
  const [cursor, setCursor] = useState(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [busy, setBusy] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState([]);
  const [confirmDelete, setConfirmDelete] = useState(null);   // 지울 id 배열
  const [viewerId, setViewerId] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [toast, setToast] = useState('');
  const toastTimer = useRef(null);

  const showToast = (message) => {
    setToast(message);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 2600);
  };
  useEffect(() => () => clearTimeout(toastTimer.current), []);

  const loadAlbum = useCallback(async () => {
    try {
      const response = await fetchWithAuth(`${apiBase}/album`);
      if (response.status === 404) { setNotFound(true); return; }
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) { showToast(payload.error || '앨범을 불러오지 못했어요.'); return; }
      setAlbum(payload);
    } catch (error) {
      console.error('앨범 조회 실패:', error);
      showToast('앨범을 불러오지 못했어요.');
    }
  }, [apiBase]);

  const loadMedia = useCallback(async (nextCursor = null) => {
    const params = new URLSearchParams({ filter, limit: String(PAGE) });
    if (nextCursor) {
      params.set('cursorTakenAt', nextCursor.takenAt);
      params.set('cursorId', String(nextCursor.id));
    }
    try {
      const response = await fetchWithAuth(`${apiBase}/media?${params.toString()}`);
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) return;
      setItems((prev) => (nextCursor ? [...prev, ...(payload.items || [])] : payload.items || []));
      setCursor(payload.nextCursor || null);
    } catch (error) {
      console.error('사진 목록 조회 실패:', error);
    }
  }, [apiBase, filter]);

  useEffect(() => { loadAlbum(); }, [loadAlbum]);
  useEffect(() => {
    if (album?.driveFolderId) loadMedia();
  }, [album?.driveFolderId, loadMedia]);

  const reloadAll = () => { loadAlbum(); loadMedia(); };

  const patchAlbum = async (body, message) => {
    setBusy(true);
    try {
      const response = await fetchWithAuth(`${apiBase}/album`, { method: 'PATCH', body: JSON.stringify(body) });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) { showToast(payload.error || '바꾸지 못했어요.'); return; }
      if (message) showToast(message);
      await loadAlbum();
    } finally {
      setBusy(false);
    }
  };

  const refresh = async () => {
    setBusy(true);
    try {
      const response = await fetchWithAuth(`${apiBase}/album/refresh`, { method: 'POST' });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) showToast(payload.error || '새로고침하지 못했어요.');
      else showToast(payload.missing ? `Drive 에서 사라진 사진 ${payload.missing}장을 정리했어요` : 'Drive 와 맞춰 봤어요');
      reloadAll();
    } finally {
      setBusy(false);
    }
  };

  const bulk = async (action, ids) => {
    setBusy(true);
    try {
      const response = await fetchWithAuth(`${apiBase}/media/bulk`, {
        method: 'POST',
        body: JSON.stringify({ action, mediaIds: ids })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) { showToast(payload.error || '처리하지 못했어요.'); return; }
      const done = { hide: '숨겼어요 — 학부모에게 보이지 않아요', show: '다시 보이게 했어요', delete: 'Drive 휴지통으로 옮겼어요' }[action];
      showToast(`${payload.affected ?? ids.length}장 ${done}`);
      setSelected([]);
      setSelecting(false);
      reloadAll();
    } finally {
      setBusy(false);
    }
  };

  if (notFound) {
    return (
      <>
        <PageHeader title="사진" onBack={() => navigate('/photos')} backLabel="사진" />
        <Card padding="lg"><EmptyState icon="image" title="이벤트를 찾을 수 없어요" description="지워졌거나 다른 선생님의 이벤트예요." /></Card>
      </>
    );
  }

  if (!album) {
    return (
      <>
        <PageHeader title="사진" onBack={() => navigate('/photos')} backLabel="사진" />
        <SkeletonList rows={3} />
      </>
    );
  }

  const problem = albumProblem(album);
  // locked = Drive 를 거치는 올리기 · 지우기만 막는다. 공개 · 범위 · 숨기기는 앱 안의 일이라 열어 둔다.
  const locked = Boolean(problem);
  const hasAlbum = Boolean(album.driveFolderId);
  const counts = album.counts || {};
  const chips = filterChips(counts);
  const selectedItems = items.filter((item) => selected.includes(item.id));
  const anyHidden = selectedItems.some((item) => item.isHidden);
  const anyVisible = selectedItems.some((item) => !item.isHidden);
  const nameDrift = hasAlbum && album.expectedFolderName && album.driveFolderName && album.expectedFolderName !== album.driveFolderName;

  const uploadButton = (
    <Button variant="primary" icon="upload" disabled={locked} onClick={() => setUploading(true)}>사진 올리기</Button>
  );

  return (
    <>
      <PageHeader
        title={album.eventTitle}
        description={`${formatEventDate(album.eventDate)} · ${typeLabel(album.eventType)}`}
        onBack={() => navigate('/photos')}
        backLabel="사진"
        actions={uploadButton}
      />

      {problem && (
        <div className="ui-mb-4">
          <Callout tone={problem.tone}>
            {PROBLEM_MESSAGES[problem.reason]}
            {(problem.reason === 'drive_error' || problem.reason === 'not_connected') && (
              <div className="ui-mt-2">
                <Button size="sm" variant="primary" onClick={() => navigate('/settings')}>
                  설정에서 {problem.reason === 'drive_error' ? '다시 ' : ''}연결<Icon name="arrowRight" size={16} />
                </Button>
              </div>
            )}
            {problem.reason === 'album_missing' && (
              <div className="ui-mt-2"><Button size="sm" icon="refresh" loading={busy} onClick={refresh}>새로고침</Button></div>
            )}
          </Callout>
        </div>
      )}
      {!problem && album.albumStatus === 'unshared' && (
        <div className="ui-mb-4">
          <Callout tone="warning">
            Drive 에서 이 폴더의 링크 공유가 꺼져 사진이 보이지 않을 수 있어요. Drive 에서 공유를 다시 켠 뒤 새로고침해 주세요.
            <div className="ui-mt-2"><Button size="sm" icon="refresh" loading={busy} onClick={refresh}>새로고침</Button></div>
          </Callout>
        </div>
      )}

      {!hasAlbum ? (
        <Card padding="lg">
          <EmptyState
            icon="image"
            title="아직 이 이벤트에 올린 사진이 없어요"
            description={`사진을 올리면 Drive 에 ‘${album.drive?.rootFolderName || 'RG Manager'} / ${album.expectedFolderName}’ 폴더가 생겨요. 앨범은 비공개로 시작해요.`}
            action={uploadButton}
          />
        </Card>
      ) : (
        <>
          <div className="ui-album-top">
            <PublishPanel
              album={album}
              locked={publishLocked(album)}
              busy={busy}
              onPublish={(on) => patchAlbum({ published: on }, on ? '학부모에게 공개했어요' : '비공개로 돌렸어요')}
              onAudience={(value) => patchAlbum({ audience: value }, '공개 범위를 바꿨어요')}
              onUploadOpen={(open) => patchAlbum({ albumUploadOpen: open }, open ? '학부모도 올릴 수 있어요' : '학부모 올리기를 껐어요')}
            />
            <Card padding="md" aria-label="Drive 폴더">
              <div className="ui-stack" data-gap="3">
                <div className="ui-row" data-gap="2" data-justify="between">
                  <h3 className="ui-card__title">Drive 폴더</h3>
                  {album.folderUrl && (
                    <a className="ui-btn" data-variant="ghost" data-size="sm" href={album.folderUrl} target="_blank" rel="noreferrer">
                      Drive 에서 열기<Icon name="external" size={16} />
                    </a>
                  )}
                </div>
                <div className="ui-folder-line">
                  <Icon name="folder" size={18} />
                  <span className="ui-folder-line__path">
                    <span className="ui-folder-line__root">{album.drive?.rootFolderName || 'RG Manager'} / </span>{album.driveFolderName}
                  </span>
                </div>
                {nameDrift && (
                  <Button size="sm" variant="ghost" icon="refresh" disabled={locked || busy}
                    onClick={() => patchAlbum({ folderName: album.expectedFolderName }, '폴더 이름을 이벤트에 맞췄어요')}>
                    폴더 이름 맞추기 → {album.expectedFolderName}
                  </Button>
                )}
                <dl className="ui-dl">
                  <div className="ui-dl__row">
                    <dt className="ui-dl__label">올린 것</dt>
                    <dd className="ui-dl__value">사진 {counts.images || 0} · 영상 {counts.videos || 0} · {formatSize(album.totalSize || 0)}</dd>
                  </div>
                  {album.drive?.quota?.limit ? (
                    <div className="ui-dl__row">
                      <dt className="ui-dl__label">Drive 남은 용량</dt>
                      <dd className="ui-dl__value">{formatSize(album.drive.quota.remaining)} / {formatSize(album.drive.quota.limit)}</dd>
                    </div>
                  ) : null}
                </dl>
                <p className="ui-hand">Drive 에서 직접 넣은 사진은 여기 안 보여요. 사진은 이 화면에서 올려 주세요.</p>
              </div>
            </Card>
          </div>

          <div className="ui-row ui-mt-5 ui-mb-3" data-gap="2" data-justify="between">
            {selecting ? (
              <>
                <b>{selected.length}장 골랐어요</b>
                <div className="ui-row" data-gap="2">
                  <Button size="sm" variant="ghost" onClick={() => setSelected(items.map((item) => item.id))}>모두 고르기</Button>
                  <Button size="sm" onClick={() => { setSelecting(false); setSelected([]); }}>취소</Button>
                </div>
              </>
            ) : (
              <>
                <Toolbar className="ui-photo-filters">
                  {chips.map((chip) => (
                    <Chip key={chip.key} selected={filter === chip.key} count={chip.count} onClick={() => setFilter(chip.key)}>
                      {chip.label}
                    </Chip>
                  ))}
                </Toolbar>
                <Button size="sm" icon="check" disabled={!items.length} onClick={() => setSelecting(true)}>고르기</Button>
              </>
            )}
          </div>

          {items.length === 0 ? (
            <div className="ui-dropzone">
              <Icon name="upload" size={28} />
              <p className="ui-dropzone__title">{filter === 'all' ? '아직 사진이 없어요' : '이 조건의 사진이 없어요'}</p>
              {filter === 'all' && (
                <p className="ui-dropzone__hint">[사진 올리기] 로 한 번에 30개까지 올릴 수 있어요. 사진 25MB · 영상 500MB 까지.</p>
              )}
            </div>
          ) : (
            <PhotoGrid
              items={items}
              showUploader
              selectable={selecting}
              selected={selected}
              onOpen={(item) => setViewerId(item.id)}
              onToggle={(item) => setSelected((prev) => (prev.includes(item.id) ? prev.filter((id) => id !== item.id) : [...prev, item.id]))}
            />
          )}

          {cursor && (
            <div className="ui-row ui-mt-4" data-justify="center">
              <Button loading={loadingMore} onClick={async () => { setLoadingMore(true); await loadMedia(cursor); setLoadingMore(false); }}>
                더 보기
              </Button>
            </div>
          )}

          {selecting && (
            <StickyActions>
              <Button icon="eyeOff" disabled={busy || !anyVisible} onClick={() => bulk('hide', selected)}>숨기기</Button>
              <Button icon="eye" disabled={busy || !anyHidden} onClick={() => bulk('show', selected)}>다시 보이기</Button>
              <Button variant="danger-quiet" icon="trash" disabled={busy || locked || !selected.length} onClick={() => setConfirmDelete(selected)}>지우기</Button>
            </StickyActions>
          )}
        </>
      )}

      <ConfirmDialog
        open={Boolean(confirmDelete)}
        title={`사진 ${confirmDelete?.length || 0}장을 지울까요?`}
        message="학부모 화면에서 바로 사라지고, Drive 에서는 휴지통으로 옮겨져요. 30일 안에는 Drive 휴지통에서 되살릴 수 있어요."
        confirmLabel="지우기"
        tone="danger"
        busy={busy}
        onCancel={() => setConfirmDelete(null)}
        onConfirm={async () => { const ids = confirmDelete; setConfirmDelete(null); await bulk('delete', ids); }}
      />

      {viewerId && (
        <MediaViewer
          items={items.map(toViewerItem)}
          startId={viewerId}
          onClose={() => setViewerId(null)}
          onDelete={locked ? undefined : (item) => { setViewerId(null); setConfirmDelete([item.id]); }}
        />
      )}

      {uploading && (
        <UploadSheet
          apiBase={apiBase}
          eventTitle={album.eventTitle}
          allowPublish
          published={album.published}
          photoFolder={album.eventType === 'folder'}
          audienceHint="공개하면 학부모도 볼 수 있어요"
          onClose={() => setUploading(false)}
          onDone={() => reloadAll()}
        />
      )}

      <Toast>{toast}</Toast>
    </>
  );
}

export default PhotoAlbum;
