import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { fetchWithAuth } from '../../utils/api';
import { formatSize } from '../../utils/mediaUrls';
import { copyToClipboard } from '../../utils/copyToClipboard';
import { albumShareUrl, albumShareToast, canShareAlbum, ALBUM_SHARE_DISABLED_HINT } from '../../utils/albumShare';
import UploadSheet from '../../components/album/UploadSheet';
import MediaViewer from '../../components/album/MediaViewer';
import FacePeopleStrip from '../../components/album/FacePeopleStrip';
import {
  Button, Callout, Card, Chip, ConfirmDialog, EmptyState, Icon, IconButton, Menu, MenuItem, PageHeader, SkeletonList,
  StickyActions, Toast, Toolbar
} from '../../components/ui';
import PublishPanel from './PublishPanel';
import FolderEditDialog from './FolderEditDialog';
import FaceScanPanel from './FaceScanPanel';
import CoverOrderPanel from './CoverOrderPanel';
import CoverCropDialog from './CoverCropDialog';
import { coverCropsBody, coversFromPicks, dropCovers, sameCovers, setCoverCrops, toggleCover } from './coverDraft';
import ViewStatsPanel from './ViewStatsPanel';
import PhotoGrid from './PhotoGrid';
import {
  albumProblem, filterChips, folderDeleteMessage, folderDeletedToast, folderDeleteTitle, formatEventDate, isPhotoFolder,
  publishLocked, typeLabel, toViewerItem, PROBLEM_MESSAGES
} from './albumState';

const PAGE = 60;

/**
 * 선생님 사진 메뉴 — 앨범 하나 (docs/photo-menu FR-520~529).
 *
 * 위: 학부모 공개 패널 + Drive 폴더 카드. 아래: 얼굴 목록(누르면 그 사람 사진만), 필터 칩과 사진 칸,
 * 고르기 모드(숨기기 · 다시 보이기 · 지우기 · 대표 사진 만들기). 사진을 열어 [대표 사진으로] 를 눌러도 표지로 고른다(4장까지).
 * 대표 사진 칸의 [수정] 에서 끌어서 놓아 순서를 바꾸고 ✕ 로 빼며, 미리 보기의 사진을 눌러 보일 부분을 고른다(CoverCropDialog).
 * 대표 사진은 어디서 고쳐도 **[저장하기] 를 눌러야**
 * 반영된다 — 그 전까지는 화면의 초안(coverDraft)일 뿐이다.
 * Google 연결이 끊기거나 폴더가 사라져도 읽기는 계속되고 쓰기 버튼만 막힌다.
 */
function PhotoAlbum() {
  const { eventId } = useParams();
  const navigate = useNavigate();
  const apiBase = `/api/events/${eventId}`;

  const [album, setAlbum] = useState(null);
  const [notFound, setNotFound] = useState(false);
  const [filter, setFilter] = useState('all');
  const [people, setPeople] = useState([]);       // 얼굴 목록 — 앨범에 나온 사람마다 얼굴 하나
  const [person, setPerson] = useState(null);     // 고른 사람의 key — 그 사람이 나온 사진만
  const [items, setItems] = useState([]);
  const [cursor, setCursor] = useState(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [busy, setBusy] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState([]);
  const [confirmDelete, setConfirmDelete] = useState(null);   // 지울 id 배열
  // 폴더 관리 (FR-519): 이름·날짜 수정 창(사진 전용 폴더만) · 폴더 삭제 확인
  const [editingFolder, setEditingFolder] = useState(false);
  const [confirmFolderDelete, setConfirmFolderDelete] = useState(false);
  const [deletingFolder, setDeletingFolder] = useState(false);
  const [viewerId, setViewerId] = useState(null);
  // 대표 사진 고치기 초안 — null 이면 고치는 중이 아니다. [저장하기] 를 누르기 전까지 서버에 보내지 않는다
  const [coverDraft, setCoverDraft] = useState(null);
  const [cropIndex, setCropIndex] = useState(null);   // 보일 부분 고르기를 연 대표 사진(초안의 몇 번째) — 창에서 다른 사진으로 바꿀 수 있다
  const coverPanelRef = useRef(null);
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

  const loadPeople = useCallback(async () => {
    try {
      const response = await fetchWithAuth(`${apiBase}/album/people`);
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) return;
      const next = payload.people || [];
      setPeople(next);
      // 고른 사람이 묶음에서 사라졌으면(사진을 지웠거나 얼굴을 다시 찾았다) 고른 것을 푼다
      setPerson((prev) => (prev && !next.some((one) => one.key === prev) ? null : prev));
    } catch (error) {
      console.error('얼굴 목록 조회 실패:', error);
    }
  }, [apiBase]);

  const loadMedia = useCallback(async (nextCursor = null) => {
    const params = new URLSearchParams({ filter, limit: String(PAGE) });
    if (person) params.set('person', person);
    if (nextCursor) {
      params.set('cursorTakenAt', nextCursor.takenAt);
      params.set('cursorId', String(nextCursor.id));
    }
    try {
      const response = await fetchWithAuth(`${apiBase}/media?${params.toString()}`);
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) return;
      if (payload.personMissing) { setPerson(null); loadPeople(); return; }
      setItems((prev) => (nextCursor ? [...prev, ...(payload.items || [])] : payload.items || []));
      setCursor(payload.nextCursor || null);
    } catch (error) {
      console.error('사진 목록 조회 실패:', error);
    }
  }, [apiBase, filter, person, loadPeople]);

  useEffect(() => { loadAlbum(); }, [loadAlbum]);
  useEffect(() => {
    if (album?.driveFolderId) loadMedia();
  }, [album?.driveFolderId, loadMedia]);
  useEffect(() => {
    if (album?.driveFolderId) loadPeople();
  }, [album?.driveFolderId, loadPeople]);

  const reloadAll = () => { loadAlbum(); loadMedia(); loadPeople(); };

  // 얼굴 목록에서 관계없는 사람을 뺀다(길게 눌러 X). 사진은 그대로 — 그 사람의 얼굴과 자동 태그만 지운다.
  // 화면이 본 사진 수를 함께 보내 서버가 "같은 사람" 인지 확인한다 — 그 사이 묶음이 바뀌었으면 409 로 아무것도 지우지 않는다.
  const removePerson = async (key) => {
    const seen = people.find((one) => one.key === key);
    try {
      const response = await fetchWithAuth(
        `${apiBase}/album/people/${encodeURIComponent(key)}?photoCount=${seen?.photoCount ?? ''}`,
        { method: 'DELETE' }
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        const changed = payload.personMissing || payload.reason === 'person_changed';
        showToast(changed ? '얼굴 목록이 바뀌었어요. 다시 확인해 주세요.' : (payload.error || '얼굴을 빼지 못했어요.'));
        if (changed) loadPeople();
        return;
      }
      showToast('얼굴을 목록에서 뺐어요 · 사진은 그대로 있어요');
      if (person === key) {
        // 고른 것을 풀면 사진 목록은 그 변화로 다시 읽는다
        setPerson(null);
        loadAlbum();
        loadPeople();
      } else {
        reloadAll();
      }
    } catch (error) {
      console.error('얼굴 빼기 실패:', error);
      showToast('얼굴을 빼지 못했어요.');
    }
  };

  // 앨범 설정 바꾸기 → 됐으면 true. 안 됐으면 이유를 알리고 false
  const patchAlbum = async (body, message) => {
    setBusy(true);
    try {
      const response = await fetchWithAuth(`${apiBase}/album`, { method: 'PATCH', body: JSON.stringify(body) });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) { showToast(payload.error || '바꾸지 못했어요.'); return false; }
      if (message) showToast(message);
      await loadAlbum();
      return true;
    } catch (patchError) {
      console.error('앨범 설정 저장 실패:', patchError);
      showToast('바꾸지 못했어요. 잠시 뒤 다시 해 주세요.');
      return false;
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
      // 숨기거나 지운 사진은 대표 사진이 될 수 없다 — 고치던 초안에서도 뺀다
      if (action !== 'show') setCoverDraft((prev) => (prev ? dropCovers(prev, ids) : prev));
      reloadAll();
    } finally {
      setBusy(false);
    }
  };

  // 사진·영상 설명 — 앱 안의 글이라 Google 연결이 끊겨도 고칠 수 있다. 실패하면 뷰어의 입력 창이 그 글을 보여 준다.
  // 저장됐다는 알림은 띄우지 않는다 — 뷰어 아래쪽에 방금 쓴 설명이 뜨는 것이 알림이고, 토스트는 그 설명을 덮는다
  const saveCaption = async (item, caption) => {
    let response;
    try {
      response = await fetchWithAuth(`${apiBase}/media/${item.id}`, { method: 'PATCH', body: JSON.stringify({ caption }) });
    } catch (saveError) {
      console.error('사진 설명 저장 실패:', saveError);
      throw new Error('설명을 저장하지 못했어요. 잠시 뒤 다시 해 주세요.');
    }
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || '설명을 저장하지 못했어요.');
    const saved = payload.caption ?? null;
    setItems((prev) => prev.map((media) => (media.id === item.id ? { ...media, caption: saved } : media)));
  };

  // 대표 사진(최대 4장) — 사진 목록 카드의 표지. 고른 순서가 표지의 순서다. 앱 안의 값이라 Google 연결이 끊겨도 바꿀 수 있다.
  // 고르기 · 대표 사진 칸 · 사진 보기 어디서 고쳐도 초안만 바뀌고, [저장하기] 가 PATCH {coverMediaIds} 로 한 번에 보낸다.
  const savedCovers = album?.covers || [];
  const maxCovers = album?.maxCovers || 4;
  const shownCovers = coverDraft ?? savedCovers;
  const shownCoverIds = shownCovers.map((cover) => cover.id);
  const coverDirty = Boolean(coverDraft) && !sameCovers(coverDraft, savedCovers);

  // 저장하지 않은 대표 사진이 있는데 새로고침·창 닫기를 하면 브라우저가 한 번 묻는다
  useEffect(() => {
    if (!coverDirty) return undefined;
    const warn = (event) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [coverDirty]);

  // 사진 보기의 [대표 사진으로] / [대표 사진 n] — 초안에 넣거나 뺀다(고치는 중이 아니었으면 지금 대표 사진에서 시작한다)
  const toggleCoverDraft = (item) => setCoverDraft((prev) => toggleCover(prev ?? savedCovers, item, maxCovers));

  // 고르기에서 고른 것(1~4장)을 고른 순서대로 초안으로 — 대표 사진 칸에서 확인하고 고친 뒤 [저장하기]
  const makeCovers = (ids) => {
    setCoverDraft(coversFromPicks(ids, items));
    setSelected([]);
    setSelecting(false);
    coverPanelRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
  };

  // 미리 보기의 사진을 누르면 — 고치는 중이 아니었으면 지금 대표 사진에서 시작하고, 보일 부분 고르기를 그 사진부터 연다.
  // 창에서는 모든 대표 사진을 한 번에 고치고, [적용] 이 고친 것 모두를 초안에 넣는다
  const openCrop = (index) => {
    setCoverDraft((prev) => prev ?? savedCovers);
    setCropIndex(index);
  };
  const applyCrops = (crops) => {
    setCoverDraft((prev) => setCoverCrops(prev ?? savedCovers, crops));
    setCropIndex(null);
  };

  const saveCovers = async () => {
    const ok = await patchAlbum({ coverMediaIds: shownCoverIds, coverCrops: coverCropsBody(shownCovers) }, shownCoverIds.length
      ? `대표 사진 ${shownCoverIds.length}장을 저장했어요 · 사진 목록 카드에 반영돼요`
      : '대표 사진을 모두 뺐어요 · 사진 목록 카드에는 최근 사진이 보여요');
    if (ok) setCoverDraft(null);
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
  // 고른 것을 한 번에 대표 사진으로 — 1~maxCovers 장, 숨긴 사진 없이
  const coverBlock = selected.length > maxCovers ? `대표 사진은 ${maxCovers}장까지 골라 주세요`
    : anyHidden ? '숨긴 사진은 대표 사진이 될 수 없어요' : '';
  const nameDrift = hasAlbum && album.expectedFolderName && album.driveFolderName && album.expectedFolderName !== album.driveFolderName;

  const uploadButton = (
    <Button variant="primary" icon="upload" disabled={locked} onClick={() => setUploading(true)}>사진 올리기</Button>
  );

  // 학부모에게 보낼 링크 (FR-518) — 누른 그 자리에서 복사한다(주소는 앨범을 읽을 때 받아 둔 sharePath)
  const shareable = canShareAlbum(album);
  const share = async () => {
    const url = albumShareUrl(album);
    const ok = await copyToClipboard(url);
    showToast(ok ? albumShareToast(album) : url);
  };
  /* 사진 전용 폴더는 여기서 이름·날짜를 고치고 지운다 (FR-519). 이벤트 앨범은 [폴더 삭제] 만 — 사진 폴더(앨범)만 지우고
     이벤트는 남긴다. 이벤트의 이름·날짜와 이벤트 자체의 삭제는 이벤트 관리가 맡는다(신청·참가 학생이 걸려 있다). */
  const folder = isPhotoFolder(album.eventType);
  const canDeleteFolder = folder || hasAlbum;

  const folderSaved = async (result) => {
    setEditingFolder(false);
    await loadAlbum();
    showToast(result?.driveRenamed === false
      ? '이름·날짜를 바꿨어요 · Drive 폴더 이름은 [폴더 이름 맞추기] 로 맞춰 주세요'
      : '폴더 이름·날짜를 바꿨어요');
  };

  const deleteFolder = async () => {
    setDeletingFolder(true);
    try {
      const response = await fetchWithAuth(`/api/albums/${eventId}`, { method: 'DELETE' });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setConfirmFolderDelete(false);
        showToast(payload.error || '폴더를 지우지 못했어요.');
        return;
      }
      navigate('/photos', { replace: true, state: { toast: folderDeletedToast(payload) } });
    } catch (deleteError) {
      console.error('사진 폴더 삭제 실패:', deleteError);
      setConfirmFolderDelete(false);
      showToast('폴더를 지우지 못했어요.');
    } finally {
      setDeletingFolder(false);
    }
  };

  const headerActions = (
    <>
      {canDeleteFolder && (
        <span className="ui-page-header__icon-action">
          <Menu label="폴더 관리" trigger={(props) => <IconButton icon="more" label="폴더 관리" {...props} />}>
            {folder && <MenuItem icon="edit" onClick={() => setEditingFolder(true)}>이름 · 날짜 수정</MenuItem>}
            <MenuItem icon="trash" tone="danger" onClick={() => setConfirmFolderDelete(true)}>폴더 삭제</MenuItem>
          </Menu>
        </span>
      )}
      <Button
        icon="link"
        disabled={!shareable}
        title={shareable ? '학부모에게 보낼 링크 복사' : ALBUM_SHARE_DISABLED_HINT}
        onClick={share}
      >
        공유
      </Button>
      {uploadButton}
    </>
  );

  return (
    <>
      <PageHeader
        title={album.eventTitle}
        description={`${formatEventDate(album.eventDate)} · ${typeLabel(album.eventType)}`}
        onBack={() => navigate('/photos')}
        backLabel="사진"
        actions={headerActions}
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

      {/* 얼굴 찾기는 공유 링크로 Drive 사진을 읽는다 — Google 연결이 끊겨도 되지만 폴더가 없거나 공유가 꺼지면 못 읽는다 */}
      {hasAlbum && !['missing', 'unshared'].includes(album.albumStatus) && (
        <FaceScanPanel className="ui-mb-4" apiBase={apiBase} count={counts.unanalyzed || 0} onDone={reloadAll} autoStart />
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

          <div ref={coverPanelRef}>
            <CoverOrderPanel
              className="ui-mt-4"
              covers={shownCovers}
              max={maxCovers}
              editing={Boolean(coverDraft)}
              disabled={busy}
              onEdit={() => setCoverDraft(savedCovers)}
              onChange={setCoverDraft}
              onCrop={openCrop}
            />
          </div>

          <ViewStatsPanel className="ui-mt-4" stats={album.viewStats} top={album.topViewed || []} onOpen={setViewerId} />

          <FacePeopleStrip className="ui-mt-5" people={people} selected={person} onSelect={setPerson} onRemove={removePerson} />

          <div className={`ui-row ${people.length ? 'ui-mt-3' : 'ui-mt-5'} ui-mb-3`} data-gap="2" data-justify="between">
            {selecting ? (
              <>
                <span className="ui-row" data-gap="2">
                  <b>{selected.length}장 골랐어요</b>
                  {selected.length > maxCovers && <span className="ui-text-subtle">대표 사진은 {maxCovers}장까지</span>}
                </span>
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
              <p className="ui-dropzone__title">{filter === 'all' && !person ? '아직 사진이 없어요' : '이 조건의 사진이 없어요'}</p>
              {filter === 'all' && !person && (
                <p className="ui-dropzone__hint">[사진 올리기] 로 한 번에 30개까지 올릴 수 있어요. 사진 25MB · 영상 500MB 까지.</p>
              )}
            </div>
          ) : (
            <PhotoGrid
              items={items}
              showUploader
              selectable={selecting}
              selected={selected}
              coverIds={shownCoverIds}
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
            <StickyActions className="ui-photo-select-actions">
              <Button icon="eyeOff" disabled={busy || !anyVisible} onClick={() => bulk('hide', selected)}>숨기기</Button>
              <Button icon="eye" disabled={busy || !anyHidden} onClick={() => bulk('show', selected)}>다시 보이기</Button>
              <Button variant="danger-quiet" icon="trash" disabled={busy || locked || !selected.length} onClick={() => setConfirmDelete(selected)}>지우기</Button>
              <Button
                icon="star"
                disabled={busy || !selected.length || Boolean(coverBlock)}
                title={coverBlock || `고른 ${selected.length}장을 고른 순서대로 대표 사진 칸에 놓아요 — [저장하기] 를 눌러야 반영돼요`}
                onClick={() => makeCovers(selected)}
              >
                대표 사진 만들기
              </Button>
            </StickyActions>
          )}

          {/* 대표 사진을 고치는 동안 — 어느 폭에서나 화면 아래에 붙어 있다(대표 사진 칸은 위쪽이라 고르기 막대처럼 맨 끝에 두면 안 보인다) */}
          {coverDraft && !selecting && (
            <StickyActions className="ui-cover-save-bar" role="region" aria-label="대표 사진 저장">
              <span className="ui-cover-save-bar__note">
                {coverDirty ? '대표 사진을 고쳤어요 — [저장하기] 를 눌러야 사진 목록에 반영돼요' : '대표 사진 수정 중 — 바꾼 것이 아직 없어요'}
              </span>
              <Button disabled={busy} onClick={() => setCoverDraft(null)}>취소</Button>
              <Button variant="primary" icon="check" loading={busy} disabled={busy || !coverDirty} onClick={saveCovers}>저장하기</Button>
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

      {editingFolder && (
        <FolderEditDialog album={album} onClose={() => setEditingFolder(false)} onSaved={folderSaved} />
      )}

      <ConfirmDialog
        open={confirmFolderDelete}
        title={folderDeleteTitle(album)}
        message={folderDeleteMessage(album)}
        confirmLabel="폴더 삭제"
        tone="danger"
        busy={deletingFolder}
        onCancel={() => setConfirmFolderDelete(false)}
        onConfirm={deleteFolder}
      />

      {cropIndex !== null && shownCovers[cropIndex] && (
        <CoverCropDialog
          covers={shownCovers}
          index={cropIndex}
          onApply={applyCrops}
          onClose={() => setCropIndex(null)}
        />
      )}

      {viewerId && (
        <MediaViewer
          items={items.map(toViewerItem)}
          startId={viewerId}
          onClose={() => setViewerId(null)}
          onDelete={locked ? undefined : (item) => { setViewerId(null); setConfirmDelete([item.id]); }}
          onCaptionSave={saveCaption}
          showViews
          coverIds={shownCoverIds}
          coverLimit={maxCovers}
          coverPending={coverDirty}
          onCoverChange={toggleCoverDraft}
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
