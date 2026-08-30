import React, { useEffect, useRef, useState } from 'react';
import { fetchWithAuth } from '../../utils/api';
import { partitionFiles, readTakenAt, makePreview, MAX_FILES } from '../../utils/imagePrep';
import { uploadToDrive } from '../../utils/driveUpload';
import { detectFaces } from '../../utils/faceClient';
import { formatSize } from '../../utils/mediaUrls';
import {
  Button, Callout, Icon, List, ListRow, Modal, Progress, Stack
} from '../ui';

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

  const footer = (
    <>
      {phase === 'pick' && (
        <>
          <Button block onClick={onClose}>닫기</Button>
          <Button variant="primary" block disabled={!accepted.length} onClick={start}>
            {accepted.length ? `${accepted.length}개 올리기` : '올리기'}
          </Button>
        </>
      )}
      {phase === 'busy' && <Button block disabled loading>올리는 중…</Button>}
      {phase === 'done' && <Button variant="primary" block onClick={onClose}>앨범에서 보기</Button>}
    </>
  );

  return (
    <Modal
      open
      onClose={phase === 'busy' ? undefined : onClose}
      closeOnScrim={phase !== 'busy'}
      title={phase === 'done' ? '다 올렸어요' : phase === 'busy' ? '올리는 중…' : '사진 · 영상 올리기'}
      aria-label="사진 영상 올리기"
      footer={footer}
    >
      {phase === 'pick' && (
        <Stack gap={4}>
          <div className="ui-dropzone">
            <Icon name="camera" size={28} />
            <div className="ui-dropzone__title">
              {eventTitle ? `${eventTitle} 앨범에 올려요` : '앨범에 올려요'}
            </div>
            <p className="ui-dropzone__hint">
              사진 25MB · 영상 500MB 까지, 한 번에 {MAX_FILES}개<br />
              선생님과 확정된 학부모가 함께 봐요
            </p>
            <Button size="sm" variant="primary" onClick={() => inputRef.current?.click()}>
              파일 고르기
            </Button>
            <input
              ref={inputRef}
              type="file"
              accept="image/*,video/*"
              multiple
              data-testid="album-file-input"
              onChange={(event) => pick(event.target.files)}
              className="ui-visually-hidden"
            />
          </div>

          {(accepted.length > 0 || rejected.length > 0) && (
            <Stack gap={2}>
              {accepted.length > 0 && (
                <span className="ui-text-sm ui-text-muted">올릴 파일 {accepted.length}개</span>
              )}
              <List>
                {accepted.map((entry, i) => (
                  <FileRow key={`ok-${i}`} name={entry.file.name} size={entry.file.size} kind={entry.kind} status="대기" />
                ))}
                {rejected.map((entry, i) => (
                  <FileRow key={`no-${i}`} name={entry.file.name} size={entry.file.size} kind="file" status={entry.message} error />
                ))}
              </List>
            </Stack>
          )}

          {error && <Callout tone="danger">{error}</Callout>}

          <Callout tone="neutral">
            올린 사진은 선생님의 Google Drive 앨범 폴더에 원본 그대로 저장돼요.
          </Callout>
        </Stack>
      )}

      {phase === 'busy' && (
        <Stack gap={4}>
          <Callout tone="brand">앱을 닫지 말아 주세요. 사진은 Google Drive 로 바로 올라가요.</Callout>
          <List>
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
          </List>
        </Stack>
      )}

      {phase === 'done' && summary && (
        <Stack gap={4}>
          <Callout tone="success">
            {summary.images ? `사진 ${summary.images}장` : ''}
            {summary.images && summary.videos ? ' · ' : ''}
            {summary.videos ? `영상 ${summary.videos}개` : ''}
            {' '}올렸어요.
          </Callout>
          <Stack gap={2} className="ui-text-sm ui-text-muted">
            {summary.analyzed > 0 && <div>얼굴 분석 {summary.analyzed}장 완료 — 우리 아이 사진에 자동으로 모아드려요</div>}
            {summary.skipped > 0 && <div>{summary.skipped}장은 분석하지 못했어요 (선생님이 다시 분석할 수 있어요)</div>}
            {summary.videos > 0 && <div>영상은 얼굴을 찾지 않아요</div>}
            {Object.keys(failed).length > 0 && (
              <div className="ui-text-danger">{Object.keys(failed).length}개는 올리지 못했어요</div>
            )}
          </Stack>
        </Stack>
      )}
    </Modal>
  );
}

function FileRow({ name, size, kind, status, error, progress }) {
  return (
    <ListRow
      leading={
        <span className="ui-icon-tile" data-tone={error ? 'danger' : 'brand'}>
          <Icon name={kind === 'video' ? 'camera' : kind === 'image' ? 'image' : 'file'} size={16} />
        </span>
      }
      title={<span className={error ? 'ui-file-row--rejected' : undefined}>{name}</span>}
      subtitle={formatSize(size)}
      trailing={
        <span className={error ? 'ui-text-danger' : status === '완료' ? 'ui-text-upload-done' : 'ui-text-subtle'}>
          {status}
        </span>
      }
    >
      {progress !== undefined && !error && (
        <div className="ui-mt-2">
          <Progress value={progress} label={`${name} 업로드 진행률`} />
        </div>
      )}
    </ListRow>
  );
}

export default UploadSheet;
