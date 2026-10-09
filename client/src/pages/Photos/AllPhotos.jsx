import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchWithAuth } from '../../utils/api';
import MediaViewer from '../../components/album/MediaViewer';
import FacePeopleStrip from '../../components/album/FacePeopleStrip';
import { Button, Callout, Card, EmptyState, Icon, PageHeader, SkeletonList, StickyActions, Toast } from '../../components/ui';
import PhotoGrid from './PhotoGrid';
import PersonPhotosBar from './PersonPhotosBar';
import { saveMediaCaption } from './mediaCaptionSave';
import { editPersonPhotos, excludeBlock, personPhotosToast } from './personPhotos';
import { toAllPhotosViewerItem } from './albumState';

const PAGE = 60;

/**
 * 선생님 사진 메뉴 — 전체 사진 (`/photos/all`). 모든 폴더(이벤트 앨범 + 사진 전용 폴더)의 사진·영상을 찍은 순서(최근 먼저)로 한 화면에.
 *
 * 위의 얼굴 목록은 모든 폴더의 얼굴을 함께 묶은 것이라(GET /api/albums/people) 같은 아이는 폴더가 달라도 얼굴 하나다.
 * 누르면 그 아이가 나온 사진만 모든 폴더에서 모아 보고, 다시 누르거나 [전체] 를 누르면 푼다.
 * 얼굴을 고르면 다른 사람 사진이 섞였을 때 [고르기] 로 골라 **이 얼굴에서 뺀다**("이 얼굴 아님", 사진은 그대로) — 뺀 사진은
 * [뺀 사진] 에서 다시 넣는다(PersonPhotosBar · personPhotos.js).
 * 사진을 열면 어느 폴더의 사진인지 보이고 설명을 고칠 수 있다. 숨기기 · 지우기 · 대표 사진 · 얼굴 통째로 빼기는 폴더 화면에서 한다 —
 * 공개 여부와 Drive 연결이 폴더마다 다르다.
 */
function AllPhotos() {
  const navigate = useNavigate();
  const [people, setPeople] = useState([]);       // 모든 폴더에 나온 사람마다 얼굴 하나
  const [person, setPerson] = useState(null);     // 고른 사람의 key — 그 사람이 나온 사진만
  const [items, setItems] = useState(null);       // null = 처음 읽는 중
  const [cursor, setCursor] = useState(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [viewerId, setViewerId] = useState(null);
  const [removedView, setRemovedView] = useState(false);   // 고른 얼굴에서 "이 얼굴 아님" 으로 뺀 사진 보기
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState([]);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState('');
  const toastTimer = useRef(null);
  // 얼굴을 빨리 바꿔 누르면 늦게 온 앞 응답이 지금 목록을 덮을 수 있다 — 마지막 요청의 응답만 쓴다
  const latest = useRef(0);

  const loadPeople = useCallback(async () => {
    try {
      const response = await fetchWithAuth('/api/albums/people');
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) return;
      const next = payload.people || [];
      setPeople(next);
      // 고른 사람이 묶음에서 사라졌으면(사진을 지웠거나 얼굴을 다시 찾았다) 고른 것을 푼다
      setPerson((prev) => (prev && !next.some((one) => one.key === prev) ? null : prev));
    } catch (loadError) {
      console.error('전체 사진 얼굴 목록 조회 실패:', loadError);
    }
  }, []);

  const loadMedia = useCallback(async (nextCursor = null) => {
    latest.current += 1;
    const request = latest.current;
    // 처음부터 다시 읽는 동안에는 [더 보기] 를 감춘다 — 얼굴을 바꾼 직후 누르면 앞 목록의 커서가 새 얼굴과 섞인다
    if (!nextCursor) setCursor(null);
    const params = new URLSearchParams({ limit: String(PAGE) });
    if (person) params.set('person', person);
    if (person && removedView) params.set('removed', '1');
    if (nextCursor) {
      params.set('cursorTakenAt', nextCursor.takenAt);
      params.set('cursorId', String(nextCursor.id));
    }
    try {
      const response = await fetchWithAuth(`/api/albums/media?${params.toString()}`);
      const payload = await response.json().catch(() => ({}));
      if (request !== latest.current) return;
      if (!response.ok) {
        setError(payload.error || '사진을 불러오지 못했어요.');
        setItems((prev) => prev || []);
        return;
      }
      if (payload.personMissing) { setPerson(null); loadPeople(); return; }
      setError('');
      setItems((prev) => (nextCursor ? [...(prev || []), ...(payload.items || [])] : payload.items || []));
      setCursor(payload.nextCursor || null);
    } catch (loadError) {
      console.error('전체 사진 조회 실패:', loadError);
      if (request !== latest.current) return;
      setError('사진을 불러오지 못했어요.');
      setItems((prev) => prev || []);
    }
  }, [person, removedView, loadPeople]);

  useEffect(() => { loadPeople(); }, [loadPeople]);
  useEffect(() => { loadMedia(); }, [loadMedia]);
  useEffect(() => () => clearTimeout(toastTimer.current), []);

  const showToast = (message) => {
    setToast(message);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 2600);
  };

  const stopSelecting = () => { setSelecting(false); setSelected([]); };
  // 다른 얼굴을 고르면(또는 풀면) 그 얼굴의 사진부터 — 뺀 사진 보기와 고르던 것은 푼다
  const choosePerson = (key) => {
    setPerson(key);
    setRemovedView(false);
    stopSelecting();
  };
  const chooseView = (removed) => {
    setRemovedView(removed);
    stopSelecting();
  };

  const chosen = people.find((one) => one.key === person) || null;
  // 다시 넣어 뺀 사진이 하나도 안 남으면 그 얼굴의 사진으로 돌아간다
  useEffect(() => {
    if (removedView && chosen && !chosen.removedCount) setRemovedView(false);
  }, [removedView, chosen]);

  // 고른 사진을 이 얼굴에서 빼거나(이 얼굴 아님) 다시 넣는다 — 사진은 그대로. 얼굴의 key 가 바뀌면 그 key 로 계속 본다
  const editSelected = async () => {
    const action = removedView ? 'restore' : 'exclude';
    setBusy(true);
    const result = await editPersonPhotos('/api/albums', person, action, selected);
    setBusy(false);
    if (!result.ok) {
      showToast(result.message);
      if (result.changed) loadPeople();
      return;
    }
    showToast(personPhotosToast(action, result.count));
    stopSelecting();
    if (result.key && result.key !== person) setPerson(result.key);
    else if (!result.key) choosePerson(null);
    else loadMedia();
    loadPeople();
  };

  // 설명은 그 사진이 든 폴더(앨범)의 주소로 저장한다
  const saveCaption = async (item, caption) => {
    const saved = await saveMediaCaption(item.eventId, item.id, caption);
    setItems((prev) => prev.map((media) => (media.id === item.id ? { ...media, caption: saved } : media)));
  };

  const header = (
    <PageHeader
      title="전체 사진"
      description="모든 폴더의 사진을 찍은 순서대로 모아 봐요. 얼굴을 누르면 그 아이가 나온 사진만 모든 폴더에서 찾아 줘요."
      onBack={() => navigate('/photos')}
      backLabel="사진"
    />
  );

  if (items === null) {
    return (
      <>
        {header}
        <SkeletonList rows={3} />
      </>
    );
  }

  const nothingYet = !items.length && !person && !error;

  return (
    <>
      {header}

      {error && <div className="ui-mb-4"><Callout tone="danger">{error}</Callout></div>}

      {nothingYet ? (
        <Card padding="lg">
          <EmptyState
            icon="image"
            title="아직 올린 사진이 없어요"
            description="사진 목록에서 사진을 올리면 모든 폴더의 사진이 여기에 모여요."
            action={<Button onClick={() => navigate('/photos')}>사진 목록으로</Button>}
          />
        </Card>
      ) : (
        <>
          <FacePeopleStrip className="ui-mb-4" people={people} selected={person} onSelect={choosePerson} />

          {chosen && (
            <div className="ui-row ui-mb-3" data-gap="2" data-justify="between" data-align="start">
              {selecting ? (
                <>
                  <b>{selected.length}장 골랐어요</b>
                  <div className="ui-row" data-gap="2">
                    <Button size="sm" variant="ghost" onClick={() => setSelected(items.map((item) => item.id))}>모두 고르기</Button>
                    <Button size="sm" onClick={stopSelecting}>취소</Button>
                  </div>
                </>
              ) : (
                <>
                  <PersonPhotosBar person={chosen} removedView={removedView} onViewChange={chooseView} />
                  <Button size="sm" icon="check" disabled={!items.length} onClick={() => setSelecting(true)}>고르기</Button>
                </>
              )}
            </div>
          )}

          {items.length === 0 ? (
            <div className="ui-dropzone">
              <Icon name="image" size={28} />
              <p className="ui-dropzone__title">
                {removedView ? '뺀 사진이 없어요' : person ? '이 얼굴이 나온 사진이 없어요' : '사진이 없어요'}
              </p>
            </div>
          ) : (
            <PhotoGrid
              items={items}
              showUploader
              showViews
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
        </>
      )}

      {selecting && chosen && (
        <StickyActions className="ui-photo-select-actions" role="region" aria-label="고른 사진">
          {removedView ? (
            <Button variant="primary" icon="refresh" loading={busy} disabled={busy || !selected.length} onClick={editSelected}>
              이 얼굴에 다시 넣기
            </Button>
          ) : (
            <Button
              variant="primary"
              icon="x"
              loading={busy}
              disabled={busy || Boolean(excludeBlock(selected.length, chosen.photoCount))}
              title={excludeBlock(selected.length, chosen.photoCount) || '고른 사진을 이 얼굴의 사진에서 빼요 — 사진은 그대로예요'}
              onClick={editSelected}
            >
              이 얼굴에서 빼기
            </Button>
          )}
        </StickyActions>
      )}

      {viewerId && (
        <MediaViewer
          items={items.map(toAllPhotosViewerItem)}
          startId={viewerId}
          onClose={() => setViewerId(null)}
          onCaptionSave={saveCaption}
          showViews
        />
      )}

      <Toast>{toast}</Toast>
    </>
  );
}

export default AllPhotos;
