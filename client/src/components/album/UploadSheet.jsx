import React, { useEffect, useRef, useState } from 'react';
import { fetchWithAuth } from '../../utils/api';
import { partitionFiles, readTakenAt, makePreview, MAX_FILES } from '../../utils/imagePrep';
import { uploadToDrive } from '../../utils/driveUpload';
import { detectFaces } from '../../utils/faceClient';
import { formatSize } from '../../utils/mediaUrls';

/**
 * 사진·영상 올리기 시트. 선생님·학부모가 같이 쓴다.
 *
 * 흐름: 파일 선택 → (형식·크기로 거르기) → 서버에서 세션 발급
 *      → 브라우저가 Drive 로 직접 전송(진행률) → 사진이면 얼굴 특징값 계산
 *      → 완료 보고. 얼굴 계산이 실패해도 업로드는 성공으로 끝난다.
 *
 * apiBase 예) '/api/events/3'  또는  '/api/parent/events/3'
 */
function UploadSheet({ apiBase, eventTitle, onClose, onDone }) {
  const [phase, setPhase] = useState('pick');       // pick | busy | done
  const [accepted, setAccepted] = useState([]);
  const [rejected, setRejected] = useState([]);
  const [progress, setProgress] = useState({});     // index → 0~100
  const [failed, setFailed] = useState({});         // index → 메시지
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    const onKey = (event) => event.key === 'Escape' && phase !== 'busy' && onClose?.();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, phase]);

  const pick = (fileList) => {
    const { accepted: ok, rejected: no } = partitionFiles(fileList);
    setAccepted(ok);
    setRejected(no);
    setError('');
  };

  const start = async () => {
    if (!accepted.length) return;
    setPhase('busy');
    setError('');

    try {
      // 1) 세션 발급 — 찍은 시각도 함께 보내 정렬에 쓴다.
      const files = [];
      for (const entry of accepted) {
        files.push({
          name: entry.file.name,
          size: entry.file.size,
          takenAt: await readTakenAt(entry.file)
        });
      }

      const response = await fetchWithAuth(`${apiBase}/media/uploads`, {
        method: 'POST',
        body: JSON.stringify({ files })
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error || '업로드를 시작하지 못했어요.');
        setPhase('pick');
        return;
      }

      // 2) 파일마다 Drive 로 직접 전송 → 3) 얼굴 계산 → 4) 완료 보고
      let uploaded = 0;
      let analyzed = 0;
      let skipped = 0;

      for (let i = 0; i < accepted.length; i += 1) {
        const entry = accepted[i];
        const session = data.items?.[i];

        if (!session?.sessionUri) {
          setFailed((prev) => ({ ...prev, [i]: session?.error || '올릴 수 없는 파일이에요' }));
          continue;
        }

        const result = await uploadToDrive(entry.file, session.sessionUri, {
          onProgress: (value) => setProgress((prev) => ({ ...prev, [i]: value }))
        });

        if (!result.ok) {
          setFailed((prev) => ({ ...prev, [i]: result.error || '업로드가 끊겼어요' }));
          continue;
        }

        let faces = null;
        if (entry.kind === 'image') {
          const preview = await makePreview(entry.file);
          if (preview) {
            faces = await detectFaces(preview);
            if (faces.length) analyzed += 1;
          } else {
            skipped += 1;   // HEIC 처럼 브라우저가 못 읽는 형식
          }
        }

        const completed = await fetchWithAuth(`${apiBase}/media/${session.mediaId}/complete`, {
          method: 'POST',
          body: JSON.stringify({
            driveFileId: result.file?.id,
            takenAt: files[i].takenAt,
            faces
          })
        });

        if (completed.ok) uploaded += 1;
        else {
          const body = await completed.json().catch(() => ({}));
          setFailed((prev) => ({ ...prev, [i]: body.error || '저장하지 못했어요' }));
        }
      }

      setSummary({
        uploaded,
        analyzed,
        skipped,
        images: accepted.filter((entry) => entry.kind === 'image').length,
        videos: accepted.filter((entry) => entry.kind === 'video').length
      });
      setPhase('done');
      onDone?.();
    } catch (uploadError) {
      console.error('업로드 실패:', uploadError);
      setError('업로드 중 문제가 생겼어요. 잠시 뒤 다시 시도해 주세요.');
      setPhase('pick');
    }
  };

  return (
    <>
      <div
        onClick={() => phase !== 'busy' && onClose?.()}
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 220 }}
      />
      <div
        role="dialog"
        aria-label="사진 영상 올리기"
        style={{
          position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 221, background: '#fff',
          borderRadius: '22px 22px 0 0', maxHeight: '92vh', display: 'flex', flexDirection: 'column',
          maxWidth: '640px', margin: '0 auto'
        }}
      >
        <div style={{ width: '40px', height: '4px', borderRadius: '4px', background: 'var(--color-gray-300)', margin: '10px auto 2px' }} />

        <div style={{ overflowY: 'auto', padding: '10px 18px 18px' }}>
          <h3 style={{ fontSize: '1.0625rem', fontWeight: 800, letterSpacing: '-0.4px', margin: '6px 0 10px' }}>
            {phase === 'done' ? '다 올렸어요 🎉' : phase === 'busy' ? '올리는 중…' : '사진 · 영상 올리기'}
          </h3>

          {phase === 'pick' && (
            <>
              <div style={{
                border: '1px dashed var(--color-gray-300)', borderRadius: 'var(--radius-md)',
                padding: '16px', textAlign: 'center', marginBottom: '12px'
              }}>
                <div style={{ fontSize: '1.6rem' }}>📷</div>
                <div style={{ fontWeight: 700, fontSize: '0.875rem', marginTop: '6px' }}>
                  {eventTitle ? `${eventTitle} 앨범에 올려요` : '앨범에 올려요'}
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--color-gray-500)', marginTop: '3px', lineHeight: 1.5 }}>
                  사진 25MB · 영상 500MB 까지, 한 번에 {MAX_FILES}개<br />
                  선생님과 확정된 학부모가 함께 봐요
                </div>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  style={{ marginTop: '12px' }}
                  onClick={() => inputRef.current?.click()}
                >파일 고르기</button>
                <input
                  ref={inputRef}
                  type="file"
                  accept="image/*,video/*"
                  multiple
                  data-testid="album-file-input"
                  onChange={(event) => pick(event.target.files)}
                  style={{ display: 'none' }}
                />
              </div>

              {accepted.length > 0 && (
                <div style={{ fontSize: '0.8125rem', fontWeight: 700, margin: '4px 0 2px' }}>
                  올릴 파일 {accepted.length}개
                </div>
              )}
              {accepted.map((entry, i) => (
                <FileRow key={`ok-${i}`} name={entry.file.name} size={entry.file.size} kind={entry.kind} status="대기" />
              ))}
              {rejected.map((entry, i) => (
                <FileRow key={`no-${i}`} name={entry.file.name} size={entry.file.size} kind="file" status={entry.message} error />
              ))}

              {error && (
                <div role="alert" style={{
                  background: 'var(--color-danger-bg)', color: 'var(--color-danger)', padding: '11px 13px',
                  borderRadius: 'var(--radius-md)', fontSize: '0.875rem', marginTop: '12px'
                }}>{error}</div>
              )}

              <div style={{
                background: 'var(--color-gray-100)', color: 'var(--color-gray-600)', fontSize: '0.8125rem',
                padding: '11px 12px', borderRadius: 'var(--radius-md)', lineHeight: 1.55, marginTop: '12px'
              }}>
                올린 사진은 선생님의 Google Drive 앨범 폴더에 원본 그대로 저장돼요.
              </div>
            </>
          )}

          {phase === 'busy' && (
            <>
              <div style={{
                background: 'var(--color-primary-bg)', color: 'var(--color-primary-dark)', fontSize: '0.8125rem',
                padding: '11px 12px', borderRadius: 'var(--radius-md)', marginBottom: '10px', lineHeight: 1.55
              }}>
                앱을 닫지 말아 주세요. 사진은 Google Drive 로 바로 올라가요.
              </div>
              {accepted.map((entry, i) => (
                <FileRow
                  key={`up-${i}`}
                  name={entry.file.name}
                  size={entry.file.size}
                  kind={entry.kind}
                  status={failed[i] || (progress[i] === 100 ? '완료' : `${progress[i] || 0}%`)}
                  error={Boolean(failed[i])}
                  progress={progress[i] || 0}
                />
              ))}
            </>
          )}

          {phase === 'done' && summary && (
            <>
              <div style={{
                background: 'var(--color-success-bg)', color: '#047857', fontSize: '0.8125rem',
                padding: '11px 12px', borderRadius: 'var(--radius-md)', marginBottom: '10px'
              }}>
                {summary.images ? `사진 ${summary.images}장` : ''}
                {summary.images && summary.videos ? ' · ' : ''}
                {summary.videos ? `영상 ${summary.videos}개` : ''}
                {' '}올렸어요.
              </div>
              <div style={{ fontSize: '0.8125rem', color: 'var(--color-gray-600)', lineHeight: 1.7 }}>
                {summary.analyzed > 0 && <div>🔍 얼굴 분석 {summary.analyzed}장 완료 — 우리 아이 사진에 자동으로 모아드려요</div>}
                {summary.skipped > 0 && <div>⚠️ {summary.skipped}장은 분석하지 못했어요 (선생님이 다시 분석할 수 있어요)</div>}
                {summary.videos > 0 && <div>🎬 영상은 얼굴을 찾지 않아요</div>}
                {Object.keys(failed).length > 0 && (
                  <div style={{ color: 'var(--color-danger)' }}>❌ {Object.keys(failed).length}개는 올리지 못했어요</div>
                )}
              </div>
            </>
          )}
        </div>

        <div style={{
          padding: '12px 18px calc(16px + env(safe-area-inset-bottom))',
          borderTop: '1px solid var(--color-gray-100)', display: 'flex', gap: '8px', flexShrink: 0
        }}>
          {phase === 'pick' && (
            <>
              <button type="button" className="btn btn-outline" style={{ flex: 1 }} onClick={onClose}>닫기</button>
              <button
                type="button"
                className="btn btn-primary"
                style={{ flex: 1 }}
                disabled={!accepted.length}
                onClick={start}
              >{accepted.length ? `${accepted.length}개 올리기` : '올리기'}</button>
            </>
          )}
          {phase === 'busy' && (
            <button type="button" className="btn btn-outline" style={{ flex: 1 }} disabled>올리는 중…</button>
          )}
          {phase === 'done' && (
            <button type="button" className="btn btn-primary" style={{ flex: 1 }} onClick={onClose}>앨범에서 보기</button>
          )}
        </div>
      </div>
    </>
  );
}

function FileRow({ name, size, kind, status, error, progress }) {
  const icon = kind === 'video' ? '🎬' : kind === 'image' ? '🖼️' : '📄';
  return (
    <div style={{
      display: 'flex', gap: '10px', alignItems: 'center', padding: '9px 0',
      borderTop: '1px solid var(--color-gray-100)'
    }}>
      <span style={{
        width: '34px', height: '34px', borderRadius: 'var(--radius-sm)', flexShrink: 0,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem',
        background: error ? 'var(--color-danger-bg)' : 'var(--color-primary-bg)'
      }}>{icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <b style={{
          display: 'block', fontSize: '0.8125rem', fontWeight: 600, overflow: 'hidden',
          textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          color: error ? 'var(--color-gray-400)' : undefined,
          textDecoration: error ? 'line-through' : 'none'
        }}>{name}</b>
        <span style={{ fontSize: '0.6875rem', color: 'var(--color-gray-500)' }}>{formatSize(size)}</span>
        {progress !== undefined && !error && (
          <div style={{ height: '4px', borderRadius: '4px', background: 'var(--color-gray-200)', overflow: 'hidden', marginTop: '5px' }}>
            <i style={{ display: 'block', height: '100%', width: `${progress}%`, background: 'var(--color-primary)', transition: 'width .25s' }} />
          </div>
        )}
      </div>
      <div style={{
        fontSize: '0.6875rem', fontWeight: 700, whiteSpace: 'nowrap',
        color: error ? 'var(--color-danger)' : status === '완료' ? 'var(--color-success)' : 'var(--color-gray-500)'
      }}>{status}</div>
    </div>
  );
}

export default UploadSheet;
