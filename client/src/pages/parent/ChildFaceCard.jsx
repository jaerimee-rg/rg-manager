import React, { useEffect, useRef, useState } from 'react';
import { fetchWithAuth } from '../../utils/api';
import { detectSingleFace } from '../../utils/faceClient';
import { makePreview } from '../../utils/imagePrep';
import { formatDate } from '../../utils/dateHelpers';
import { Button, ConfirmDialog } from '../../components/ui';

/**
 * 자녀 얼굴 등록 카드 (내 정보 화면).
 *
 * 사진은 브라우저 안에서만 다루고, 서버로는 **얼굴 특징값만** 보낸다.
 * 얼굴이 없거나 두 명 이상이면 여기서 막는다.
 *
 * 등록한 사진은 아이마다 목록으로 보이고 **내가 등록한 것은 지울 수 있다**. 사진 자체는 저장하지 않으므로
 * 목록에는 등록한 날짜만 나온다. 지우면 서버가 그 사진으로만 맞던 "우리 아이" 표시를 함께 정리한다.
 */
function ChildFaceCard({ children = [], onChanged }) {
  const linked = children.filter((child) => child.status === 'linked' && child.studentId);
  const [counts, setCounts] = useState({});
  const [faces, setFaces] = useState({});               // childId → [{ id, createdAt, mine }]
  const [busyChildId, setBusyChildId] = useState(null);
  const [consentChildId, setConsentChildId] = useState(null);
  const [consent, setConsent] = useState(true);
  const [message, setMessage] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(null);   // { child, face, order }
  const [deleting, setDeleting] = useState(false);
  const inputRef = useRef(null);
  const pendingChild = useRef(null);

  const loadFaces = async (child) => {
    try {
      const response = await fetchWithAuth(`/api/parent/children/${child.id}/faces`);
      if (!response?.ok) return;
      const data = await response.json().catch(() => ({}));
      setFaces((prev) => ({ ...prev, [child.id]: data.items || [] }));
    } catch (error) {
      console.error('등록한 얼굴 사진 조회 실패:', error);
    }
  };

  useEffect(() => {
    setCounts(Object.fromEntries(linked.map((child) => [child.id, child.faceProfileCount || 0])));
    // children 이 새로 들어오면 개수를 맞추고, 등록한 사진이 있는 아이는 목록을 읽는다.
    linked.filter((child) => child.faceProfileCount > 0).forEach(loadFaces);
  }, [children]);   // eslint-disable-line react-hooks/exhaustive-deps

  if (!linked.length) return null;

  const removeFace = async () => {
    const { child, face } = confirmDelete;
    setDeleting(true);
    try {
      const response = await fetchWithAuth(`/api/parent/children/${child.id}/faces/${face.id}`, { method: 'DELETE' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setMessage(data.error || '지우지 못했어요.');
        return;
      }
      setFaces((prev) => ({ ...prev, [child.id]: (prev[child.id] || []).filter((item) => item.id !== face.id) }));
      setCounts((prev) => ({ ...prev, [child.id]: Math.max((prev[child.id] || 1) - 1, 0) }));
      setMessage(data.remaining > 0
        ? '얼굴 사진을 지웠어요. 남은 사진으로 다시 찾아 둘게요.'
        : `얼굴 사진을 지웠어요. ${child.childName} 사진 찾기를 멈췄어요.`);
      onChanged?.();
    } catch (error) {
      console.error('자녀 얼굴 삭제 실패:', error);
      setMessage('지우지 못했어요. 잠시 뒤 다시 시도해 주세요.');
    } finally {
      setDeleting(false);
      setConfirmDelete(null);
    }
  };

  const openConsent = (child) => {
    setConsentChildId(child.id);
    setConsent(true);
    setMessage('');
  };

  const pickPhoto = (child) => {
    pendingChild.current = child;
    inputRef.current?.click();
  };

  const handleFile = async (event) => {
    const file = event.target.files?.[0];
    const child = pendingChild.current;
    if (inputRef.current) inputRef.current.value = '';
    if (!file || !child) return;

    setBusyChildId(child.id);
    setMessage('');

    try {
      const preview = await makePreview(file, 1024);
      if (!preview) {
        setMessage('이 사진은 읽을 수 없어요. 다른 사진으로 시도해 주세요.');
        return;
      }

      const found = await detectSingleFace(preview);
      if (!found.ok) {
        const reasons = {
          none: '얼굴이 보이지 않아요. 정면 사진으로 다시 시도해 주세요.',
          multiple: '아이 한 명만 나온 사진을 올려 주세요.',
          failed: '얼굴을 분석하지 못했어요. 잠시 뒤 다시 시도해 주세요.'
        };
        setMessage(reasons[found.reason] || '얼굴을 찾지 못했어요.');
        return;
      }

      const response = await fetchWithAuth(`/api/parent/children/${child.id}/faces`, {
        method: 'POST',
        body: JSON.stringify({ descriptor: found.descriptor, consent: true })
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        setMessage(data.error || '등록하지 못했어요.');
        return;
      }

      setCounts((prev) => ({ ...prev, [child.id]: (prev[child.id] || 0) + 1 }));
      if (data.profile) setFaces((prev) => ({ ...prev, [child.id]: [...(prev[child.id] || []), data.profile] }));
      setConsentChildId(null);
      setMessage(data.matched?.photos
        ? `앨범 ${data.matched.albums}개에서 ${child.childName} 사진 ${data.matched.photos}장을 찾았어요`
        : '등록했어요. 새 사진이 올라오면 자동으로 찾아드려요');
      onChanged?.();
    } catch (error) {
      console.error('자녀 얼굴 등록 실패:', error);
      setMessage('등록하지 못했어요. 잠시 뒤 다시 시도해 주세요.');
    } finally {
      setBusyChildId(null);
    }
  };

  return (
    <div className="card" style={{ padding: '16px', marginBottom: '12px' }}>
      <h3 className="ui-display" style={{ fontSize: 'var(--display-sm)', marginBottom: '10px' }}>
        우리 아이 사진 찾기
      </h3>

      <div style={{ fontSize: '0.8125rem', color: 'var(--color-gray-600)', lineHeight: 1.6, marginBottom: '4px' }}>
        아이 얼굴 사진을 등록하면 앨범에서 <b>우리 아이가 나온 사진만</b> 모아 볼 수 있어요.
        등록한 사진은 다른 학부모에게 보이지 않아요.
      </div>

      {linked.map((child) => {
        const count = counts[child.id] || 0;
        const busy = busyChildId === child.id;

        return (
          <div key={child.id} style={{ borderTop: '1px solid var(--color-gray-100)', paddingTop: '12px', marginTop: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
              <span style={{
                width: '38px', height: '38px', borderRadius: 'var(--shape-blob)', background: 'var(--color-primary-bg)',
                color: 'var(--color-primary)', fontWeight: 800, display: 'inline-flex',
                alignItems: 'center', justifyContent: 'center'
              }}>{(child.childName || '?').charAt(0)}</span>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: '0.9375rem' }}>{child.childName}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--color-gray-500)' }}>
                  {count ? `얼굴 사진 ${count}장 등록됨` : '아직 등록하지 않았어요'}
                </div>
              </div>

              <span className={`badge ${count ? 'badge-success' : 'badge-gray'}`}>{count ? '찾는 중' : '미등록'}</span>
            </div>

            {(faces[child.id] || []).length > 0 && (
              <ul
                aria-label={`${child.childName} 등록한 얼굴 사진`}
                style={{ listStyle: 'none', padding: 0, margin: '0 0 10px', display: 'grid', gap: '6px' }}
              >
                {faces[child.id].map((face, index) => (
                  <li key={face.id} style={{
                    display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 10px',
                    border: 'var(--stroke-thin)', borderRadius: 'var(--shape-box)', fontSize: '0.8125rem'
                  }}>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <b>얼굴 사진 {index + 1}</b>
                      <span style={{ color: 'var(--color-gray-500)' }}> · {formatDate(face.createdAt)} 등록</span>
                    </span>
                    {face.mine ? (
                      <Button
                        size="sm"
                        variant="danger-quiet"
                        icon="trash"
                        aria-label={`${child.childName} 얼굴 사진 ${index + 1} 삭제`}
                        onClick={() => setConfirmDelete({ child, face, order: index + 1 })}
                      >삭제</Button>
                    ) : (
                      <span style={{ color: 'var(--color-gray-500)', fontSize: '0.75rem' }}>다른 보호자가 등록</span>
                    )}
                  </li>
                ))}
              </ul>
            )}

            {consentChildId === child.id ? (
              <div style={{
                background: 'var(--bg-tertiary)', border: '1px solid var(--color-gray-200)',
                borderRadius: 'var(--shape-box)', padding: '12px'
              }}>
                <label style={{
                  display: 'flex', gap: '8px', alignItems: 'flex-start', fontSize: '0.75rem',
                  color: 'var(--color-gray-600)', lineHeight: 1.55, marginBottom: '10px', cursor: 'pointer'
                }}>
                  <input
                    type="checkbox"
                    checked={consent}
                    onChange={(event) => setConsent(event.target.checked)}
                    style={{ marginTop: '3px', width: '16px', height: '16px', flexShrink: 0 }}
                  />
                  <span>
                    자녀 사진은 <b>우리 아이 사진 찾기</b>에만 사용되며, 얼굴 특징값과 함께 저장됩니다.
                    언제든 삭제할 수 있습니다.
                  </span>
                </label>

                <div style={{ fontSize: '0.75rem', color: 'var(--color-gray-500)', lineHeight: 1.55, marginBottom: '10px' }}>
                  정면이 잘 보이고 <b>아이 한 명만</b> 나온 사진을 골라 주세요.
                </div>

                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    type="button"
                    className="btn btn-outline btn-sm"
                    style={{ flex: 1 }}
                    onClick={() => setConsentChildId(null)}
                  >취소</button>
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    style={{ flex: 1 }}
                    disabled={!consent || busy}
                    onClick={() => pickPhoto(child)}
                  >{busy ? '분석 중...' : '사진 고르기'}</button>
                </div>
              </div>
            ) : (
              count < 3 && (
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  style={{ width: '100%' }}
                  onClick={() => openConsent(child)}
                >＋ 얼굴 사진 등록</button>
              )
            )}
          </div>
        );
      })}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        data-testid="child-face-input"
        onChange={handleFile}
        style={{ display: 'none' }}
      />

      {message && (
        <div role="status" style={{
          background: 'var(--color-primary-bg)', color: 'var(--color-primary-dark)', fontSize: '0.8125rem',
          padding: '11px 12px', borderRadius: 'var(--shape-box)', lineHeight: 1.55, marginTop: '12px'
        }}>{message}</div>
      )}

      <div style={{
        background: 'var(--color-gray-100)', color: 'var(--color-gray-600)', fontSize: '0.75rem',
        padding: '11px 12px', borderRadius: 'var(--shape-box)', lineHeight: 1.55, marginTop: '12px'
      }}>
        아이당 최대 3장까지 등록할 수 있어요. 등록하면 지난 앨범에서도 바로 찾아드려요.
        잘못 등록한 사진은 [삭제] 로 지울 수 있어요.
      </div>

      <ConfirmDialog
        open={Boolean(confirmDelete)}
        title="얼굴 사진을 지울까요?"
        message={confirmDelete
          ? `${confirmDelete.child.childName}의 얼굴 사진 ${confirmDelete.order}번을 지워요. 이 사진으로 찾은 ‘우리 아이’ 표시도 함께 정리돼요. 직접 [맞아요] 한 사진은 그대로예요.`
          : ''}
        confirmLabel="지우기"
        tone="danger"
        busy={deleting}
        onCancel={() => setConfirmDelete(null)}
        onConfirm={removeFace}
      />
    </div>
  );
}

export default ChildFaceCard;
