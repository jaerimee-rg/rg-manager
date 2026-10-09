import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import ParentLayout from '../../components/parent/ParentLayout';
import { Button, EmptyState, Spinner } from '../../components/ui';
import MediaGrid from '../../components/album/MediaGrid';
import MediaViewer from '../../components/album/MediaViewer';
import FacePeopleStrip from '../../components/album/FacePeopleStrip';
import { createViewTracker } from '../../utils/albumViews';
import { fetchWithAuth } from '../../utils/api';

const PAGE = 60;

/** 서버의 학부모 사진 → 뷰어 — 어느 앨범의 사진인지(albumTitle)를 정보 줄에. 지우기는 그 앨범 화면에서 한다 */
export const toParentAllPhotosViewerItem = (item) => ({ ...item, albumTitle: item.album?.title || null });

/**
 * 학부모 사진 탭 — 전체 사진 (`/parent/photos/all`). 볼 수 있는 모든 앨범(공개된 이벤트 앨범 + 사진 폴더)의 사진을 찍은 순서로 한 화면에.
 *
 * 맨 위 얼굴 목록은 그 앨범들의 얼굴을 함께 묶은 것이라(GET /api/parent/albums/people) 같은 아이는 앨범이 달라도 얼굴 하나다 —
 * 우리 아이가 맨 앞("우리 아이"). 누르면 그 사람이 나온 사진만 모든 앨범에서 모아 보고, 다시 누르거나 [전체] 를 누르면 푼다.
 * 사진을 열면 어느 앨범의 사진인지 보이고 저장할 수 있다. 크게 본 사진은 그 앨범에 본 기록으로 남는다(앨범 화면과 같다).
 * 올리기 · 지우기 · 우리 아이 확인은 앨범 화면에서 한다.
 */
function ParentAllPhotos() {
  const navigate = useNavigate();
  const [people, setPeople] = useState([]);
  const [person, setPerson] = useState(null);
  const [items, setItems] = useState(null);       // null = 처음 읽는 중
  const [cursor, setCursor] = useState(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [failed, setFailed] = useState(false);
  const [viewerId, setViewerId] = useState(null);
  // 얼굴을 빨리 바꿔 누르면 늦게 온 앞 응답이 지금 목록을 덮을 수 있다 — 마지막 요청의 응답만 쓴다
  const latest = useRef(0);

  const loadPeople = useCallback(async () => {
    try {
      const response = await fetchWithAuth('/api/parent/albums/people');
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) return;
      const next = payload.people || [];
      setPeople(next);
      setPerson((prev) => (prev && !next.some((one) => one.key === prev) ? null : prev));
    } catch (error) {
      console.error('전체 사진 얼굴 목록 조회 실패:', error);
    }
  }, []);

  const loadMedia = useCallback(async (nextCursor = null) => {
    latest.current += 1;
    const request = latest.current;
    // 처음부터 다시 읽는 동안에는 [더 보기] 를 감춘다 — 얼굴을 바꾼 직후 누르면 앞 목록의 커서가 새 얼굴과 섞인다
    if (!nextCursor) setCursor(null);
    const params = new URLSearchParams({ limit: String(PAGE) });
    if (person) params.set('person', person);
    if (nextCursor) {
      params.set('cursorTakenAt', nextCursor.takenAt);
      params.set('cursorId', String(nextCursor.id));
    }
    try {
      const response = await fetchWithAuth(`/api/parent/albums/media?${params.toString()}`);
      const payload = await response.json().catch(() => ({}));
      if (request !== latest.current) return;
      if (!response.ok) {
        setFailed(true);
        setItems((prev) => prev || []);
        return;
      }
      if (payload.personMissing) { setPerson(null); loadPeople(); return; }
      setFailed(false);
      setItems((prev) => (nextCursor ? [...(prev || []), ...(payload.items || [])] : payload.items || []));
      setCursor(payload.nextCursor || null);
    } catch (error) {
      console.error('전체 사진 조회 실패:', error);
      if (request !== latest.current) return;
      setFailed(true);
      setItems((prev) => prev || []);
    }
  }, [person, loadPeople]);

  useEffect(() => { loadPeople(); }, [loadPeople]);
  useEffect(() => { loadMedia(); }, [loadMedia]);

  // 본 기록 — 크게 본 사진마다 그 사진의 앨범에(이 화면에 있는 동안 같은 사진은 한 번). 앨범을 연 것으로는 세지 않는다
  const trackers = useMemo(() => new Map(), []);
  const trackShown = (item) => {
    if (!item?.eventId) return;
    if (!trackers.has(item.eventId)) trackers.set(item.eventId, createViewTracker(item.eventId));
    trackers.get(item.eventId).media(item.id);
  };

  if (items === null) {
    return (
      <ParentLayout title="전체 사진" back="/parent/photos">
        <Spinner />
      </ParentLayout>
    );
  }

  const nothingYet = !items.length && !person && !failed;

  return (
    <ParentLayout title="전체 사진" subtitle="볼 수 있는 모든 앨범의 사진" back="/parent/photos">
      {nothingYet ? (
        <EmptyState
          icon="image"
          title="아직 볼 수 있는 사진이 없어요"
          description="선생님이 앨범을 공개하면 모든 앨범의 사진이 여기에 모여요."
          action={<Button onClick={() => navigate('/parent/photos')}>사진 목록으로</Button>}
        />
      ) : (
        <>
          <FacePeopleStrip people={people} selected={person} onSelect={setPerson} className="ui-mb-2" />

          {failed && (
            <p className="ui-hand ui-mb-2">사진을 불러오지 못했어요. 잠시 뒤 다시 열어 주세요.</p>
          )}

          {items.length > 0 ? (
            <MediaGrid items={items} columns={3} onOpen={(item) => setViewerId(item.id)} />
          ) : (
            <EmptyState icon="image" title={person ? '이 얼굴이 나온 사진이 없어요' : '사진이 없어요'} />
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

      {viewerId && (
        <MediaViewer
          items={items.map(toParentAllPhotosViewerItem)}
          startId={viewerId}
          onClose={() => setViewerId(null)}
          onShow={trackShown}
        />
      )}
    </ParentLayout>
  );
}

export default ParentAllPhotos;
