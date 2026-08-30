import React, { useEffect, useState } from 'react';
import { fetchWithAuth } from '../../utils/api';
import { formatSize } from '../../utils/mediaUrls';
import { formatTime } from '../../utils/albumFilter';
import { useIsMobile } from '../../hooks/useMediaQuery';
import { Button, Modal } from '../../components/ui';

/**
 * 사진 한 장의 상세 — 얼굴 박스와 태그를 한 화면에서 다룬다.
 *
 * 얼굴 상자는 0~1 비율(box)을 퍼센트로 바꿔 그린다. 원본 비율이 어떻든
 * 이미지 위에 그대로 얹히므로 이미지 크기를 알 필요가 없다.
 * 영상은 얼굴을 분석하지 않으므로 Drive 미리보기를 대신 보여준다.
 */

const SOURCE_LABEL = {
  face: '자동',
  manual: '선생님',
  parent_confirmed: '학부모 확인',
  candidate: '확인 필요'
};

const SOURCE_BADGE = {
  face: 'badge-primary',
  manual: 'badge-purple',
  parent_confirmed: 'badge-success',
  candidate: 'badge-warning'
};

const FACE_STATUS_LABEL = {
  done: '완료',
  none: '얼굴 없음',
  failed: '실패',
  skipped: '분석 안 함',
  pending: '대기'
};

const sectionTitle = {
  fontSize: '0.8125rem', fontWeight: 800, color: 'var(--color-gray-500)', margin: '0 0 8px'
};

const percent = (value) => `${Math.max(0, Math.min(1, Number(value) || 0)) * 100}%`;

function MediaDetailModal({ eventId, media, students = [], onClose, onChanged }) {
  const isMobile = useIsMobile();
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState('');

  useEffect(() => {
    const onKey = (event) => { if (event.key === 'Escape') onClose?.(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (!media) return null;

  const mediaBase = `/api/events/${eventId}/media`;
  const tags = (media.tags || []).filter((tag) => tag.source !== 'excluded');
  const confirmed = tags.filter((tag) => tag.source !== 'candidate');
  const candidates = tags.filter((tag) => tag.source === 'candidate');
  const isVideo = media.kind === 'video';

  const tagOfFace = (faceId) => tags.find((tag) => tag.faceId && Number(tag.faceId) === Number(faceId));

  const addTag = async (studentId) => {
    setBusy(true);
    try {
      const response = await fetchWithAuth(`${mediaBase}/${media.id}/tags`, {
        method: 'POST',
        body: JSON.stringify({ studentId })
      });
      const data = await response.json();
      if (!response.ok) {
        alert(data.error || '태그를 붙이지 못했습니다.');
        return;
      }
      await onChanged?.();
    } catch (error) {
      console.error('태그 추가 실패:', error);
      alert('태그를 붙이지 못했습니다.');
    } finally {
      setBusy(false);
    }
  };

  const removeTag = async (studentId) => {
    setBusy(true);
    try {
      const response = await fetchWithAuth(`${mediaBase}/${media.id}/tags/${studentId}`, { method: 'DELETE' });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        alert(data.error || '태그를 해제하지 못했습니다.');
        return;
      }
      await onChanged?.();
    } catch (error) {
      console.error('태그 해제 실패:', error);
      alert('태그를 해제하지 못했습니다.');
    } finally {
      setBusy(false);
    }
  };

  const toggleHidden = async () => {
    setBusy(true);
    try {
      const response = await fetchWithAuth(`${mediaBase}/bulk`, {
        method: 'POST',
        body: JSON.stringify({ action: media.isHidden ? 'show' : 'hide', mediaIds: [media.id] })
      });
      const data = await response.json();
      if (!response.ok) {
        alert(data.error || '숨김 설정에 실패했습니다.');
        return;
      }
      await onChanged?.();
    } catch (error) {
      console.error('숨김 설정 실패:', error);
      alert('숨김 설정에 실패했습니다.');
    } finally {
      setBusy(false);
    }
  };

  const deleteOne = async () => {
    if (!window.confirm('이 파일을 삭제할까요?\nDrive 휴지통으로 옮겨지고 30일 안에 복구할 수 있습니다.')) return;

    setBusy(true);
    try {
      const response = await fetchWithAuth(`${mediaBase}/${media.id}`, { method: 'DELETE' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        alert(data.error || '삭제에 실패했습니다.');
        return;
      }
      await onChanged?.({ closed: true });
    } catch (error) {
      console.error('삭제 실패:', error);
      alert('삭제에 실패했습니다.');
    } finally {
      setBusy(false);
    }
  };

  const pickable = students.filter((student) =>
    !query.trim() || (student.name || '').includes(query.trim()));

  const footer = (
    <>
      {media.originalUrl && (
        <Button as="a" size="sm" href={media.originalUrl} target="_blank" rel="noreferrer" iconEnd="external">
          Drive 에서 열기
        </Button>
      )}
      <Button size="sm" disabled={busy} onClick={toggleHidden}>
        {media.isHidden ? '다시 보이기' : '학부모에게 숨기기'}
      </Button>
      <Button size="sm" variant="danger" disabled={busy} onClick={deleteOne}>삭제</Button>
    </>
  );

  return (
    <Modal
      open
      mode="modal"
      size="lg"
      onClose={onClose}
      title={media.fileName || '사진'}
      aria-label="사진 상세"
      footer={footer}
      className="ui-media-modal"
    >
      <div style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? '1fr' : 'minmax(0, 1fr) 260px',
          gap: '16px'
        }}>
          <div>
            {isVideo ? (
              media.previewUrl ? (
                <iframe
                  title="영상 미리보기"
                  src={media.previewUrl}
                  allow="autoplay"
                  style={{
                    width: '100%', aspectRatio: '4 / 3', border: 'none',
                    borderRadius: 'var(--radius-md)', background: 'var(--color-gray-900)'
                  }}
                />
              ) : (
                <div style={{
                  aspectRatio: '4 / 3', borderRadius: 'var(--radius-md)', background: 'var(--color-gray-200)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-gray-500)'
                }}>미리보기를 열 수 없어요</div>
              )
            ) : (
              <div style={{
                position: 'relative', borderRadius: 'var(--radius-md)', overflow: 'hidden',
                background: 'var(--color-gray-200)'
              }}>
                <img
                  src={media.largeUrl || media.thumbnailUrl}
                  alt={media.fileName || '사진'}
                  style={{ width: '100%', display: 'block' }}
                  onError={(event) => { event.currentTarget.style.visibility = 'hidden'; }}
                />
                {(media.faces || []).map((face) => {
                  const tag = tagOfFace(face.id);
                  const isCandidate = tag?.source === 'candidate';
                  const color = !tag ? '#00E07B' : isCandidate ? '#FF9F00' : '#3182F6';
                  const label = tag
                    ? `${tag.name || '학생'}${tag.distance != null ? ` · ${Number(tag.distance).toFixed(2)}` : ''}${isCandidate ? ' (확인 필요)' : ''}`
                    : '미지정';
                  return (
                    <div
                      key={face.id}
                      data-testid="face-box"
                      style={{
                        position: 'absolute',
                        left: percent(face.box?.x), top: percent(face.box?.y),
                        width: percent(face.box?.w), height: percent(face.box?.h),
                        border: `2px solid ${color}`, borderRadius: '4px',
                        boxShadow: '0 0 0 2px rgba(0,0,0,.25)'
                      }}
                    >
                      <span style={{
                        position: 'absolute', left: '-2px', top: '-20px', background: color, color: '#fff',
                        fontSize: '0.625rem', fontWeight: 800, padding: '2px 6px', borderRadius: '4px',
                        whiteSpace: 'nowrap'
                      }}>{label}</span>
                    </div>
                  );
                })}
              </div>
            )}

            <div style={{ fontSize: '0.75rem', color: 'var(--color-gray-500)', marginTop: '8px', lineHeight: 1.6 }}>
              {isVideo
                ? '영상은 얼굴을 분석하지 않습니다. 필요하면 오른쪽에서 학생을 직접 붙여 주세요.'
                : '초록 = 검출된 얼굴 · 파랑 = 매칭됨 · 주황 = 확인 필요. 저장하는 것은 특징값과 위치뿐이고 얼굴 이미지는 저장하지 않습니다.'}
            </div>
          </div>

          <div>
            <div style={sectionTitle}>태그</div>
            {confirmed.length === 0 ? (
              <div style={{
                background: 'var(--color-gray-100)', color: 'var(--color-gray-600)', fontSize: '0.8125rem',
                padding: '11px 13px', borderRadius: 'var(--radius-md)'
              }}>아직 태그가 없어요</div>
            ) : confirmed.map((tag) => (
              <div key={`tag-${tag.studentId}`} style={{
                display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 0',
                borderTop: '1px solid var(--color-gray-100)', fontSize: '0.8125rem'
              }}>
                <span className={`badge ${SOURCE_BADGE[tag.source] || 'badge-gray'}`}>
                  {SOURCE_LABEL[tag.source] || tag.source}
                </span>
                <b>{tag.name || '학생'}</b>
                {tag.distance != null && (
                  <span style={{ color: 'var(--color-gray-400)', fontSize: '0.75rem' }}>거리 {Number(tag.distance).toFixed(2)}</span>
                )}
                <span style={{ flex: 1 }} />
                <button
                  type="button" className="btn btn-outline btn-sm" disabled={busy}
                  onClick={() => removeTag(tag.studentId)} style={{ fontFamily: 'inherit' }}
                >해제</button>
              </div>
            ))}

            {candidates.length > 0 && (
              <>
                <div style={{ ...sectionTitle, marginTop: '14px' }}>확인 필요</div>
                {candidates.map((tag) => (
                  <div key={`cand-${tag.studentId}`} style={{
                    display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 0',
                    borderTop: '1px solid var(--color-gray-100)', fontSize: '0.8125rem'
                  }}>
                    <span className="badge badge-warning">확인 필요</span>
                    <b>{tag.name || '학생'}</b>
                    {tag.distance != null && (
                      <span style={{ color: 'var(--color-gray-400)', fontSize: '0.75rem' }}>거리 {Number(tag.distance).toFixed(2)}</span>
                    )}
                    <span style={{ flex: 1 }} />
                    <button
                      type="button" className="btn btn-outline btn-sm" disabled={busy}
                      onClick={() => addTag(tag.studentId)} style={{ fontFamily: 'inherit' }}
                    >맞음</button>
                    <button
                      type="button" className="btn btn-outline btn-sm" disabled={busy}
                      onClick={() => removeTag(tag.studentId)} style={{ fontFamily: 'inherit' }}
                    >아님</button>
                  </div>
                ))}
              </>
            )}

            <div style={{ ...sectionTitle, marginTop: '14px' }}>학생 직접 지정</div>
            <input
              type="text"
              aria-label="학생 이름 검색"
              placeholder="학생 이름"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <div style={{
              border: '1px solid var(--color-gray-200)', borderRadius: 'var(--radius-md)',
              padding: '6px', marginTop: '8px', maxHeight: '180px', overflowY: 'auto'
            }}>
              {pickable.length === 0 ? (
                <div style={{ fontSize: '0.8125rem', color: 'var(--color-gray-400)', padding: '6px' }}>학생이 없습니다</div>
              ) : pickable.map((student) => (
                <button
                  key={student.id}
                  type="button"
                  disabled={busy}
                  onClick={() => addTag(student.id)}
                  style={{
                    display: 'block', width: '100%', textAlign: 'left', border: 'none', background: 'none',
                    padding: '7px 6px', borderRadius: 'var(--radius-sm)', cursor: 'pointer',
                    fontSize: '0.8125rem', fontFamily: 'inherit'
                  }}
                >{student.name}</button>
              ))}
            </div>

            <div style={{ ...sectionTitle, marginTop: '14px' }}>정보</div>
            <MetaRow label="올린 사람" value={media.uploaderName || (media.uploaderRole === 'teacher' ? '선생님' : '학부모')} />
            <MetaRow label="촬영" value={media.takenAt ? `${String(media.takenAt).slice(0, 10)} ${formatTime(media.takenAt)}` : '-'} />
            <MetaRow label="파일" value={`${media.fileName || '-'}${media.size ? ` · ${formatSize(media.size)}` : ''}`} />
            <MetaRow
              label="분석"
              value={`${FACE_STATUS_LABEL[media.faceStatus] || media.faceStatus || '-'} · 얼굴 ${media.faceCount || 0}개`}
            />
          </div>
        </div>

    </Modal>
  );
}

function MetaRow({ label, value }) {
  return (
    <div style={{ display: 'flex', gap: '8px', fontSize: '0.75rem', color: 'var(--color-gray-500)', padding: '5px 0' }}>
      <span style={{ width: '64px', flexShrink: 0 }}>{label}</span>
      <span style={{ flex: 1, minWidth: 0, color: 'var(--color-gray-800)', wordBreak: 'break-all' }}>{value}</span>
    </div>
  );
}

export default MediaDetailModal;
