import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchWithAuth } from '../../utils/api';
import { useIsMobile } from '../../hooks/useMediaQuery';
import { formatSize } from '../../utils/mediaUrls';
import { detectFaces } from '../../utils/faceClient';
import MediaGrid from '../../components/album/MediaGrid';
import UploadSheet from '../../components/album/UploadSheet';
import MediaDetailModal from './MediaDetailModal';

/**
 * 이벤트 상세의 사진·영상 앨범 (선생님).
 *
 * 앨범은 선생님의 Google Drive 폴더 하나로 표현된다. 폴더가 없으면 만들기 안내만,
 * 있으면 통계·필터·그리드·일괄 작업을 보여준다. Drive 가 끊겨도 조회는 계속되므로
 * 배너로 알리고 쓰기 버튼만 막는다.
 */

const FILTERS = [
  { key: 'all', label: '전체' },
  { key: 'teacher', label: '선생님' },
  { key: 'parent', label: '학부모' },
  { key: 'untagged', label: '태그 없음', countKey: 'untagged' },
  { key: 'candidates', label: '확인 필요', countKey: 'candidates' },
  { key: 'unanalyzed', label: '미분석', countKey: 'unanalyzed' },
  { key: 'hidden', label: '숨김', countKey: 'hidden' }
];

const MAX_ANALYZE_ROUNDS = 10;

const TONES = {
  ok: { background: 'var(--color-success-bg)', color: '#047857' },
  warn: { background: 'var(--color-warning-bg)', color: '#7A5D00' },
  danger: { background: 'var(--color-danger-bg)', color: '#C62828' },
  info: { background: 'var(--color-primary-bg)', color: 'var(--color-primary-dark)' },
  gray: { background: 'var(--color-gray-100)', color: 'var(--color-gray-600)' }
};

const noticeStyle = (tone) => ({
  ...TONES[tone] || TONES.gray,
  fontSize: '0.8125rem',
  padding: '11px 13px',
  borderRadius: 'var(--radius-md)',
  lineHeight: 1.6,
  marginBottom: '12px'
});

function Toggle({ checked, onChange, label, description, id, disabled }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      gap: '12px', padding: '12px 0', borderTop: '1px solid var(--color-gray-100)'
    }}>
      <div>
        <label htmlFor={id} style={{ fontSize: '0.9375rem', fontWeight: 600, cursor: 'pointer' }}>{label}</label>
        {description && (
          <div style={{ fontSize: '0.75rem', color: 'var(--color-gray-500)', marginTop: '2px' }}>{description}</div>
        )}
      </div>
      <input
        id={id}
        type="checkbox"
        role="switch"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        style={{ width: '44px', height: '26px', flexShrink: 0, cursor: 'pointer' }}
      />
    </div>
  );
}

function Stat({ label, value, unit, tone }) {
  const color = tone === 'warn' ? '#B26A00' : tone === 'ok' ? '#059669' : undefined;
  return (
    <div className="card" style={{ padding: '12px 14px', marginBottom: 0 }}>
      <div style={{ fontSize: '0.75rem', color: 'var(--color-gray-500)', fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: '1.375rem', fontWeight: 800, letterSpacing: '-0.5px', marginTop: '2px', color }}>
        {value}{unit && <span style={{ fontSize: '0.9rem' }}>{unit}</span>}
      </div>
    </div>
  );
}

/** 태그 요약 뱃지 — 자동은 파랑, 선생님이 붙인 것은 보라, 확인 필요는 주황 */
function TileBadges({ item }) {
  const tags = (item.tags || []).filter((tag) => tag.source !== 'excluded');
  const confirmed = tags.filter((tag) => tag.source !== 'candidate');
  const candidate = tags.find((tag) => tag.source === 'candidate');

  const chips = confirmed.map((tag) => ({
    key: `tag-${tag.studentId}`,
    text: tag.name || '이름 없음',
    background: tag.source === 'manual' ? 'rgba(124,92,252,.92)' : 'rgba(49,130,246,.92)'
  }));

  if (candidate) {
    chips.push({
      key: `cand-${candidate.studentId}`,
      text: `? ${candidate.name || ''}`.trim(),
      background: 'rgba(255,159,0,.92)'
    });
  }

  if (!chips.length && item.kind === 'image') {
    chips.push({
      key: 'none',
      text: item.faceStatus === 'failed' ? '분석 실패' : item.faceStatus === 'none' ? '얼굴 없음' : '태그 없음',
      background: 'rgba(25,31,40,.55)'
    });
  }

  return (
    <>
      <span style={{
        position: 'absolute', left: '5px', bottom: '5px', right: '5px',
        display: 'flex', gap: '3px', flexWrap: 'wrap'
      }}>
        {chips.map((chip) => (
          <span key={chip.key} style={{
            fontSize: '0.625rem', fontWeight: 800, padding: '2px 6px',
            borderRadius: 'var(--radius-full)', background: chip.background, color: '#fff'
          }}>{chip.text}</span>
        ))}
      </span>

      {item.uploaderRole === 'parent' && (
        <span style={{
          position: 'absolute', right: '5px', top: '5px', background: 'rgba(255,255,255,.9)',
          color: 'var(--color-gray-700)', fontSize: '0.625rem', fontWeight: 700,
          padding: '1px 6px', borderRadius: 'var(--radius-full)'
        }}>{item.uploaderName || '학부모'}</span>
      )}

      {item.isHidden && (
        <span style={{
          position: 'absolute', inset: 0, background: 'rgba(25,31,40,.62)', color: '#fff',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '0.75rem', fontWeight: 800
        }}>숨김</span>
      )}
    </>
  );
}

function EventAlbumSection({ event }) {
  const isMobile = useIsMobile();
  const eventId = event?.id;
  const enabled = Boolean(eventId) && event?.type !== 'closure';
  const apiBase = `/api/events/${eventId}`;

  const [album, setAlbum] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [items, setItems] = useState([]);
  const [loadingMedia, setLoadingMedia] = useState(false);
  const [filter, setFilter] = useState('all');
  const [folderName, setFolderName] = useState('');
  const [busy, setBusy] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);
  const [tagPicker, setTagPicker] = useState(false);
  const [studentQuery, setStudentQuery] = useState('');
  const [students, setStudents] = useState([]);
  const [uploadOpen, setUploadOpenSheet] = useState(false);
  const [detail, setDetail] = useState(null);
  const [progress, setProgress] = useState(null);

  const hasAlbum = Boolean(album) && album.albumStatus !== 'none';

  const loadAlbum = async () => {
    try {
      const response = await fetchWithAuth(`${apiBase}/album`);
      if (!response.ok) {
        setLoadFailed(true);
        return null;
      }
      const data = await response.json();
      setAlbum(data);
      setLoadFailed(false);
      setFolderName((prev) => prev || data.driveFolderName || data.defaultFolderName || '');
      return data;
    } catch (error) {
      console.error('앨범 조회 실패:', error);
      setLoadFailed(true);
      return null;
    } finally {
      setLoading(false);
    }
  };

  const loadMedia = async (nextFilter) => {
    setLoadingMedia(true);
    try {
      const response = await fetchWithAuth(`${apiBase}/media?filter=${encodeURIComponent(nextFilter)}&limit=60`);
      if (!response.ok) {
        setItems([]);
        return [];
      }
      const data = await response.json();
      const list = data.items || [];
      setItems(list);
      return list;
    } catch (error) {
      console.error('앨범 사진 조회 실패:', error);
      setItems([]);
      return [];
    } finally {
      setLoadingMedia(false);
    }
  };

  const loadStudents = async () => {
    try {
      const response = await fetchWithAuth('/api/students');
      if (!response.ok) return;
      const data = await response.json();
      setStudents(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('학생 목록 조회 실패:', error);
    }
  };

  useEffect(() => {
    if (!enabled) return;
    setLoading(true);
    setAlbum(null);
    setItems([]);
    setSelectedIds([]);
    setFolderName('');
    loadAlbum();
  }, [eventId, enabled]);

  useEffect(() => {
    if (!enabled || !hasAlbum) return;
    loadMedia(filter);
  }, [eventId, enabled, hasAlbum, filter]);

  useEffect(() => {
    if (!enabled || !hasAlbum) return;
    loadStudents();
  }, [enabled, hasAlbum]);

  if (!enabled) return null;

  const drive = album?.drive || {};
  const counts = album?.counts || {};
  const driveBroken = drive.status === 'error';
  const writeBlocked = driveBroken || album?.albumStatus === 'missing' || album?.foreignAccount;

  const createAlbum = async () => {
    const name = folderName.trim();
    if (!name) {
      alert('폴더 이름을 입력해 주세요.');
      return;
    }

    setBusy(true);
    try {
      const response = await fetchWithAuth(`${apiBase}/album`, {
        method: 'POST',
        body: JSON.stringify({ folderName: name })
      });
      const data = await response.json();
      if (!response.ok) {
        alert(data.error || '앨범 폴더를 만들지 못했습니다.');
        return;
      }
      await loadAlbum();
    } catch (error) {
      console.error('앨범 폴더 생성 실패:', error);
      alert('앨범 폴더를 만들지 못했습니다.');
    } finally {
      setBusy(false);
    }
  };

  const patchAlbum = async (body, failMessage) => {
    setBusy(true);
    try {
      const response = await fetchWithAuth(`${apiBase}/album`, {
        method: 'PATCH',
        body: JSON.stringify(body)
      });
      const data = await response.json();
      if (!response.ok) {
        alert(data.error || failMessage);
        return;
      }
      setAlbum((prev) => (prev ? { ...prev, ...data } : prev));
      if (data.driveFolderName) setFolderName(data.driveFolderName);
    } catch (error) {
      console.error('앨범 수정 실패:', error);
      alert(failMessage);
    } finally {
      setBusy(false);
    }
  };

  const renameFolder = () => {
    const next = window.prompt('앨범 폴더의 새 이름을 입력해 주세요.', album?.driveFolderName || '');
    if (next === null) return;
    const name = next.trim();
    if (!name) {
      alert('폴더 이름을 입력해 주세요.');
      return;
    }
    patchAlbum({ folderName: name }, '폴더 이름을 바꾸지 못했습니다.');
  };

  const refreshAlbum = async () => {
    setBusy(true);
    try {
      const response = await fetchWithAuth(`${apiBase}/album/refresh`, { method: 'POST' });
      const data = await response.json();
      if (!response.ok) {
        alert(data.error || '앨범을 새로고침하지 못했습니다.');
        return;
      }
      await loadAlbum();
      await loadMedia(filter);
    } catch (error) {
      console.error('앨범 새로고침 실패:', error);
      alert('앨범을 새로고침하지 못했습니다.');
    } finally {
      setBusy(false);
    }
  };

  const rematch = async () => {
    setBusy(true);
    try {
      const response = await fetchWithAuth(`${apiBase}/media/rematch`, { method: 'POST' });
      const data = await response.json();
      if (!response.ok) {
        alert(data.error || '다시 매칭하지 못했습니다.');
        return;
      }
      alert(`다시 매칭했습니다. 자동 태그 ${data.added || 0}개, 확인 필요 ${data.candidates || 0}개.\n선생님이 붙인 태그는 그대로 유지됩니다.`);
      await loadAlbum();
      await loadMedia(filter);
    } catch (error) {
      console.error('앨범 재매칭 실패:', error);
      alert('다시 매칭하지 못했습니다.');
    } finally {
      setBusy(false);
    }
  };

  /** 브라우저가 Drive 썸네일을 받아 얼굴을 다시 계산한다. 실패한 장은 그대로 두고 넘어간다. */
  const analyzeAgain = async () => {
    setBusy(true);
    let done = 0;
    let succeeded = 0;
    let total = 0;

    try {
      for (let round = 0; round < MAX_ANALYZE_ROUNDS; round += 1) {
        const response = await fetchWithAuth(`${apiBase}/media/unanalyzed?batch=5`);
        if (!response.ok) break;

        const data = await response.json();
        const list = data.items || [];
        if (round === 0) total = Number(data.remaining) || list.length;
        if (!list.length) break;

        setProgress({ done, total: Math.max(total, done + list.length) });

        for (const item of list) {
          const faces = await detectFaces(item.largeUrl);
          try {
            const saved = await fetchWithAuth(`${apiBase}/media/${item.id}/faces`, {
              method: 'POST',
              body: JSON.stringify({ faces })
            });
            if (saved.ok && faces.length) succeeded += 1;
          } catch (error) {
            console.error('얼굴 저장 실패:', error);
          }
          done += 1;
          setProgress({ done, total: Math.max(total, done) });
        }

        if (Number(data.remaining) <= list.length) break;
      }

      if (!done) alert('다시 분석할 사진이 없습니다.');
      else alert(`${done}장을 다시 분석했습니다. 얼굴을 찾은 사진은 ${succeeded}장입니다.`);

      await loadAlbum();
      await loadMedia(filter);
    } catch (error) {
      console.error('재분석 실패:', error);
      alert('다시 분석하지 못했습니다.');
    } finally {
      setProgress(null);
      setBusy(false);
    }
  };

  const toggleSelect = (id) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((value) => value !== id) : [...prev, id]));
  };

  const runBulk = async (action, studentIds) => {
    if (!selectedIds.length) return;
    if (action === 'delete'
      && !window.confirm(`${selectedIds.length}개를 삭제할까요?\nDrive 휴지통으로 옮겨지고 30일 안에 복구할 수 있습니다.`)) {
      return;
    }

    setBusy(true);
    try {
      const response = await fetchWithAuth(`${apiBase}/media/bulk`, {
        method: 'POST',
        body: JSON.stringify({ action, mediaIds: selectedIds, studentIds })
      });
      const data = await response.json();
      if (!response.ok) {
        alert(data.error || '작업에 실패했습니다.');
        return;
      }
      setSelectedIds([]);
      setTagPicker(false);
      await loadAlbum();
      await loadMedia(filter);
    } catch (error) {
      console.error('일괄 작업 실패:', error);
      alert('작업에 실패했습니다.');
    } finally {
      setBusy(false);
    }
  };

  const handleDetailChanged = async ({ closed } = {}) => {
    const list = await loadMedia(filter);
    loadAlbum();
    if (closed) {
      setDetail(null);
      return;
    }
    setDetail((prev) => (prev ? list.find((item) => item.id === prev.id) || null : null));
  };

  const heading = (
    <h3 style={{ fontSize: '1rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
      📷 사진 · 영상
      {hasAlbum && <span className="badge badge-success">앨범 있음</span>}
    </h3>
  );

  if (loading) {
    return (
      <section aria-label="사진 영상 앨범" style={{ marginTop: '20px' }}>
        <div className="card" style={{ padding: '18px', color: 'var(--color-gray-500)', fontSize: '0.875rem' }}>
          앨범을 불러오는 중...
        </div>
      </section>
    );
  }

  if (loadFailed) {
    return (
      <section aria-label="사진 영상 앨범" style={{ marginTop: '20px' }}>
        <div className="card" style={{ padding: '18px' }}>
          {heading}
          <div style={noticeStyle('gray')}>앨범 정보를 불러오지 못했습니다. 잠시 뒤 다시 열어 주세요.</div>
        </div>
      </section>
    );
  }

  // ── 앨범 없음 ──────────────────────────────────────────────
  if (!hasAlbum) {
    return (
      <section aria-label="사진 영상 앨범" style={{ marginTop: '20px' }}>
        <div className="card" style={{ padding: '18px' }}>
          {heading}
          <div style={{ fontSize: '0.8125rem', color: 'var(--color-gray-500)', lineHeight: 1.7, margin: '8px 0 14px' }}>
            아직 앨범이 없습니다. <b>폴더 이름을 넣으면</b> 선생님의 Google Drive 에 앨범 폴더가 만들어지고,
            그 뒤로 <b>확정된 학부모</b>가 앱에서 사진·영상을 올릴 수 있습니다.
          </div>

          {drive.configured === false ? (
            <div style={noticeStyle('warn')}>
              Google Drive 연동이 아직 설정되지 않았습니다. 관리자에게 문의해 주세요.
            </div>
          ) : drive.connected === false ? (
            <div style={noticeStyle('warn')}>
              먼저 <b>설정에서 Google Drive 를 연결해 주세요.</b>
              <div>
                <Link to="/settings" className="btn btn-primary btn-sm" style={{ marginTop: '8px' }}>설정으로 가기</Link>
              </div>
            </div>
          ) : (
            <>
              <div className="form-group">
                <label htmlFor="album-folder-name">폴더 이름</label>
                <input
                  id="album-folder-name"
                  type="text"
                  maxLength={100}
                  value={folderName}
                  onChange={(changeEvent) => setFolderName(changeEvent.target.value)}
                />
                <div style={{ fontSize: '0.75rem', color: 'var(--color-gray-500)', marginTop: '5px', lineHeight: 1.55 }}>
                  만들어질 위치: 내 드라이브 / <b>{drive.rootFolderName || 'RG Manager'}</b> / <b>{folderName || '(이름 없음)'}</b>
                </div>
              </div>
              <div style={noticeStyle('warn')}>
                폴더는 <b>&quot;링크가 있는 모든 사용자 — 보기&quot;</b> 로 공유됩니다. 앱에서 사진을 보여주기 위해 필요하며,
                링크는 확정된 학부모에게만 보입니다.
              </div>
              <button type="button" className="btn btn-primary" onClick={createAlbum} disabled={busy}>
                ＋ 앨범 폴더 만들기
              </button>
            </>
          )}
        </div>
      </section>
    );
  }

  // ── 앨범 있음 ──────────────────────────────────────────────
  const analyzed = Math.max(0, (counts.images || 0) - (counts.unanalyzed || 0));
  const analyzedPercent = Math.round((analyzed / Math.max(counts.images || 0, 1)) * 100);
  const filteredStudents = students.filter((student) =>
    !studentQuery.trim() || (student.name || '').includes(studentQuery.trim()));

  return (
    <section aria-label="사진 영상 앨범" style={{ marginTop: '20px' }}>
      <div className="card" style={{ padding: '18px' }}>
        {heading}
        <div style={{ fontSize: '0.8125rem', color: 'var(--color-gray-500)', margin: '8px 0 12px', wordBreak: 'break-all' }}>
          📁 내 드라이브 / {drive.rootFolderName || 'RG Manager'} / <b>{album.driveFolderName}</b>
        </div>

        {album.albumStatus === 'missing' && (
          <div style={noticeStyle('danger')} role="alert">
            Drive 에서 폴더를 찾을 수 없습니다. 폴더가 삭제되었거나 다른 계정으로 옮겨졌을 수 있습니다.
          </div>
        )}

        {album.albumStatus === 'unshared' && (
          <div style={noticeStyle('warn')}>
            폴더의 <b>링크 공유가 꺼져</b> 있어 학부모 화면에서 사진이 보이지 않습니다. [새로고침] 을 눌러 공유 상태를 다시 확인해 주세요.
          </div>
        )}

        {driveBroken && (
          <div style={noticeStyle('danger')} role="alert">
            Google Drive 연결이 끊어져 <b>업로드·삭제·분석</b>을 할 수 없습니다. 조회는 그대로 됩니다.
            <div>
              <Link to="/settings" className="btn btn-primary btn-sm" style={{ marginTop: '8px' }}>설정에서 다시 연결</Link>
            </div>
          </div>
        )}

        {album.foreignAccount && (
          <div style={noticeStyle('warn')}>
            이 앨범은 지금 연결된 계정과 <b>다른 Google 계정</b>으로 만들어졌습니다. 새 파일을 올리거나 지울 수 없습니다.
          </div>
        )}

        <Toggle
          id="album-upload-open"
          checked={album.albumUploadOpen !== false}
          disabled={busy}
          onChange={(value) => patchAlbum({ albumUploadOpen: value }, '설정을 바꾸지 못했습니다.')}
          label="학부모 업로드 받기"
          description='끄면 학부모 화면의 [올리기] 버튼이 "업로드 마감" 으로 바뀝니다. 선생님은 계속 올릴 수 있습니다.'
        />
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(5, 1fr)',
        gap: '10px', marginBottom: '14px'
      }}>
        <Stat label="사진" value={counts.images || 0} />
        <Stat label="영상" value={counts.videos || 0} />
        <Stat label="얼굴 분석" value={`${analyzedPercent}%`} tone="ok" />
        <Stat label="태그 없는 사진" value={counts.untagged || 0} tone="warn" />
        <Stat label="사용 용량" value={formatSize(album.totalSize) || '0KB'} />
      </div>

      {progress && (
        <div style={{
          background: '#fff', border: '1px solid var(--color-primary)', borderRadius: 'var(--radius-md)',
          padding: '12px 14px', marginBottom: '14px'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8125rem', fontWeight: 700, marginBottom: '6px' }}>
            <span>🔍 얼굴 분석 중… (5장씩 처리)</span>
            <span>{progress.done}/{progress.total}장</span>
          </div>
          <div style={{ height: '6px', borderRadius: '4px', background: 'var(--color-gray-200)', overflow: 'hidden' }}>
            <i style={{
              display: 'block', height: '100%',
              width: `${Math.round((progress.done / Math.max(progress.total, 1)) * 100)}%`,
              background: 'var(--color-primary)'
            }} />
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '14px' }}>
        <button
          type="button" className="btn btn-primary btn-sm" disabled={busy || writeBlocked}
          onClick={() => setUploadOpenSheet(true)} style={{ fontFamily: 'inherit' }}
        >＋ 사진·영상 올리기</button>
        <button
          type="button" className="btn btn-outline btn-sm" disabled={busy || writeBlocked}
          onClick={analyzeAgain} style={{ fontFamily: 'inherit' }}
        >🔍 미분석 다시 분석 {counts.unanalyzed ? <span className="badge badge-warning" style={{ marginLeft: '4px' }}>{counts.unanalyzed}</span> : null}</button>
        <button
          type="button" className="btn btn-outline btn-sm" disabled={busy || writeBlocked}
          onClick={rematch} style={{ fontFamily: 'inherit' }}
        >🔗 다시 매칭</button>
        <button
          type="button" className="btn btn-outline btn-sm" disabled={busy}
          onClick={refreshAlbum} style={{ fontFamily: 'inherit' }}
        >🔄 새로고침</button>
        {album.folderUrl && (
          <a className="btn btn-outline btn-sm" href={album.folderUrl} target="_blank" rel="noreferrer">Drive 에서 열기</a>
        )}
        <button
          type="button" className="btn btn-outline btn-sm" disabled={busy || writeBlocked}
          onClick={renameFolder} style={{ fontFamily: 'inherit' }}
        >폴더 이름 변경</button>
        <button
          type="button" className="btn btn-outline btn-sm"
          aria-pressed={selectMode}
          onClick={() => { setSelectMode((prev) => !prev); setSelectedIds([]); setTagPicker(false); }}
          style={{
            fontFamily: 'inherit',
            background: selectMode ? 'var(--color-primary-bg)' : undefined,
            color: selectMode ? 'var(--color-primary)' : undefined
          }}
        >선택</button>
      </div>

      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '12px' }}>
        {FILTERS.map((chip) => {
          const on = filter === chip.key;
          const count = chip.countKey ? counts[chip.countKey] : undefined;
          return (
            <button
              key={chip.key}
              type="button"
              aria-pressed={on}
              onClick={() => { setFilter(chip.key); setSelectedIds([]); }}
              style={{
                padding: '7px 12px', borderRadius: 'var(--radius-full)', cursor: 'pointer',
                border: `1px solid ${on ? 'var(--color-primary)' : 'var(--color-gray-200)'}`,
                background: on ? 'var(--color-primary)' : '#fff',
                color: on ? '#fff' : 'var(--color-gray-700)',
                fontSize: '0.8125rem', fontWeight: 600, fontFamily: 'inherit'
              }}
            >
              {chip.label}
              {count !== undefined && (
                <span style={{ opacity: 0.7, fontSize: '0.6875rem', fontWeight: 700, marginLeft: '3px' }}>{count}</span>
              )}
            </button>
          );
        })}
      </div>

      {loadingMedia ? (
        <div style={{ ...noticeStyle('gray'), textAlign: 'center' }}>불러오는 중...</div>
      ) : items.length === 0 ? (
        <div style={{ ...noticeStyle('gray'), textAlign: 'center' }}>해당하는 사진이 없어요</div>
      ) : (
        <MediaGrid
          items={items}
          columns={isMobile ? 3 : 6}
          selectable={selectMode}
          selectedIds={selectedIds}
          onToggleSelect={toggleSelect}
          onOpen={(item) => setDetail(item)}
          renderBadge={(item) => <TileBadges item={item} />}
        />
      )}

      {selectedIds.length > 0 && (
        <div style={{
          position: 'sticky', bottom: '12px', marginTop: '14px', background: 'var(--color-gray-900)',
          color: '#fff', borderRadius: 'var(--radius-lg)', padding: '10px 14px', display: 'flex',
          alignItems: 'center', gap: '8px', flexWrap: 'wrap', zIndex: 20
        }}>
          <span style={{ fontWeight: 800, fontSize: '0.875rem', marginRight: '4px' }}>{selectedIds.length}개 선택</span>
          <button type="button" className="btn btn-sm" disabled={busy} onClick={() => runBulk('hide')}
            style={{ fontFamily: 'inherit', background: 'rgba(255,255,255,.14)', color: '#fff' }}>숨기기</button>
          <button type="button" className="btn btn-sm" disabled={busy} onClick={() => runBulk('show')}
            style={{ fontFamily: 'inherit', background: 'rgba(255,255,255,.14)', color: '#fff' }}>보이기</button>
          <button type="button" className="btn btn-sm" disabled={busy} aria-pressed={tagPicker}
            onClick={() => setTagPicker((prev) => !prev)}
            style={{ fontFamily: 'inherit', background: 'rgba(255,255,255,.14)', color: '#fff' }}>학생 태그</button>
          <span style={{ flex: 1 }} />
          <button type="button" className="btn btn-sm" disabled={busy} onClick={() => runBulk('delete')}
            style={{ fontFamily: 'inherit', background: 'rgba(255,72,72,.25)', color: '#FFC0C0' }}>삭제</button>
          <button type="button" className="btn btn-sm" onClick={() => { setSelectedIds([]); setTagPicker(false); }}
            style={{ fontFamily: 'inherit', background: 'rgba(255,255,255,.14)', color: '#fff' }}>선택 해제</button>
        </div>
      )}

      {selectedIds.length > 0 && tagPicker && (
        <div className="card" style={{ padding: '12px', marginTop: '10px' }}>
          <div style={{ fontSize: '0.8125rem', fontWeight: 800, color: 'var(--color-gray-500)', marginBottom: '8px' }}>
            학생 태그 붙이기
          </div>
          <input
            type="text"
            aria-label="학생 이름 검색"
            placeholder="학생 이름"
            value={studentQuery}
            onChange={(changeEvent) => setStudentQuery(changeEvent.target.value)}
          />
          <div style={{ maxHeight: '190px', overflowY: 'auto', marginTop: '8px' }}>
            {filteredStudents.length === 0 ? (
              <div style={{ fontSize: '0.8125rem', color: 'var(--color-gray-400)', padding: '8px 0' }}>학생이 없습니다</div>
            ) : filteredStudents.map((student) => (
              <button
                key={student.id}
                type="button"
                disabled={busy}
                onClick={() => runBulk('tag', [student.id])}
                style={{
                  display: 'block', width: '100%', textAlign: 'left', border: 'none', background: 'none',
                  padding: '8px 6px', borderRadius: 'var(--radius-sm)', cursor: 'pointer',
                  fontSize: '0.875rem', fontFamily: 'inherit'
                }}
              >{student.name}</button>
            ))}
          </div>
        </div>
      )}

      {uploadOpen && (
        <UploadSheet
          apiBase={apiBase}
          eventTitle={event.title}
          onClose={() => setUploadOpenSheet(false)}
          onDone={async () => { await loadAlbum(); await loadMedia(filter); }}
        />
      )}

      {detail && (
        <MediaDetailModal
          eventId={eventId}
          media={detail}
          students={students}
          onClose={() => setDetail(null)}
          onChanged={handleDetailChanged}
        />
      )}
    </section>
  );
}

export default EventAlbumSection;
