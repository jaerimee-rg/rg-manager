import React, { useEffect, useRef, useState } from 'react';
import { fetchWithAuth } from '../../utils/api';
import { partitionFiles, readTakenAt, makePreview, MAX_FILES } from '../../utils/imagePrep';
import { uploadToDrive } from '../../utils/driveUpload';
import { detectFaces } from '../../utils/faceClient';
import { formatSize } from '../../utils/mediaUrls';
import { formatShortDate, targetState, uploadPublishNote } from '../../pages/Photos/albumState';
import {
  Badge, Button, Callout, Checkbox, Icon, List, ListRow, Modal, Progress, Stack
} from '../ui';

/**
 * 사진·영상 올리기 시트. 선생님·학부모가 같이 쓴다.
 *
 * 흐름: (이벤트 고르기) → 파일 선택 → (형식·크기로 거르기) → 서버에서 세션 발급
 *      → 브라우저가 Drive 로 직접 전송(진행률) → 사진이면 얼굴 특징값 계산
 *      → 완료 보고 → (선생님: "다 올리면 바로 공개" 를 골랐으면 공개).
 *      얼굴 계산이 실패해도 업로드는 성공으로 끝난다.
 *
 * apiBase 예) '/api/events/3'  또는  '/api/parent/events/3'
 *
 * 선생님 사진 메뉴(docs/photo-menu)에서만 쓰는 것:
 *   targets      — 주면 첫 단계가 "어느 이벤트 사진인가요?" 가 된다(FR-513). 고른 이벤트에 사진이 연결되고,
 *                  앨범이 없던 이벤트면 서버가 업로드 직전에 이벤트 이름 폴더를 만든다. apiBase 는 고른 이벤트로 정해진다.
 *   allowPublish — "다 올리면 바로 학부모에게 공개" 체크를 보인다(FR-515). 이미 공개된 앨범이면 체크 대신 안내 한 줄.
 *   published    — targets 없이 쓸 때 그 앨범이 공개 중인지
 * onDone({ eventId, uploaded, published }) — 다 올린 뒤 한 번 부른다.
 */
function UploadSheet({
  apiBase: fixedApiBase,
  eventTitle: fixedTitle,
  targets = null,
  initialEventId = null,
  allowPublish = false,
  published = false,
  audienceHint = '이 앨범을 보는 학부모와 선생님이 함께 봐요',
  rootFolderName = 'RG Manager',
  onClose,
  onDone
}) {
  const pickingTarget = Array.isArray(targets);
  const [targetId, setTargetId] = useState(() => initialEventId ?? (pickingTarget ? targets[0]?.eventId ?? null : null));
  const target = pickingTarget ? targets.find((t) => t.eventId === targetId) || null : null;
  const apiBase = pickingTarget ? (target ? `/api/events/${target.eventId}` : null) : fixedApiBase;
  const eventTitle = pickingTarget ? target?.title : fixedTitle;
  const alreadyPublished = pickingTarget ? Boolean(target?.hasAlbum && target?.published) : published;

  const [phase, setPhase] = useState(pickingTarget ? 'target' : 'pick');   // target | pick | busy | done
  const [publishWhenDone, setPublishWhenDone] = useState(false);
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

      // 5) "다 올리면 바로 공개" — 하나도 못 올렸으면 공개하지 않는다(빈 앨범을 공개하지 않게).
      let publishedNow = false;
      if (allowPublish && publishWhenDone && !alreadyPublished && uploaded > 0) {
        const patched = await fetchWithAuth(`${apiBase}/album`, {
          method: 'PATCH',
          body: JSON.stringify({ published: true })
        }).catch(() => null);
        publishedNow = Boolean(patched?.ok);
      }

      setSummary({
        uploaded,
        analyzed,
        skipped,
        publishedNow,
        images: accepted.filter((entry) => entry.kind === 'image').length,
        videos: accepted.filter((entry) => entry.kind === 'video').length
      });
      setPhase('done');
      onDone?.({
        eventId: pickingTarget ? target?.eventId : null,
        uploaded,
        published: alreadyPublished || publishedNow
      });
    } catch (uploadError) {
      console.error('업로드 실패:', uploadError);
      setError('업로드 중 문제가 생겼어요. 잠시 뒤 다시 시도해 주세요.');
      setPhase('pick');
    }
  };

  // 이벤트를 고르고 [사진 고르기] — 같은 클릭으로 파일 창을 연다(사용자 동작 안에서 열어야 브라우저가 막지 않는다).
  const chooseFiles = () => {
    setPhase('pick');
    inputRef.current?.click();
  };

  const publishControl = allowPublish && (alreadyPublished ? (
    <p className="ui-text-sm ui-row" data-gap="2">
      <Icon name="eye" size={16} />
      {uploadPublishNote({ hasAlbum: true, published: true }).text}
    </p>
  ) : (
    <Checkbox
      label={<>다 올리면 바로 학부모에게 공개 <span className="ui-text-muted ui-text-sm">(사진 탭 · 이 이벤트 상세)</span></>}
      checked={publishWhenDone}
      onChange={(event) => setPublishWhenDone(event.target.checked)}
    />
  ));

  const footer = (
    <>
      {phase === 'target' && (
        <>
          <Button block onClick={onClose}>닫기</Button>
          <Button variant="primary" block icon="image" disabled={!target} onClick={chooseFiles}>사진 고르기</Button>
        </>
      )}
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
      description={phase === 'target' ? '어느 이벤트 사진인가요? 고른 이벤트에 연결돼요.' : undefined}
      aria-label="사진 영상 올리기"
      footer={footer}
    >
      {/* 파일 입력은 단계와 상관없이 하나 — [사진 고르기] 가 같은 클릭으로 연다 */}
      <input
        ref={inputRef}
        type="file"
        accept="image/*,video/*"
        multiple
        data-testid="album-file-input"
        onChange={(event) => pick(event.target.files)}
        className="ui-visually-hidden"
      />

      {phase === 'target' && (
        <Stack gap={4}>
          {targets.length === 0 ? (
            <Callout tone="neutral">사진을 연결할 대회·스페셜 이벤트가 없어요. 이벤트 관리에서 먼저 등록해 주세요.</Callout>
          ) : (
            <div className="ui-event-pick" role="radiogroup" aria-label="이벤트 고르기">
              {targets.map((t) => {
                const selected = t.eventId === targetId;
                const state = targetState(t);
                return (
                  <button
                    key={t.eventId}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    aria-pressed={selected}
                    className="ui-choice"
                    onClick={() => setTargetId(t.eventId)}
                  >
                    <span className="ui-choice__mark" data-on={selected || undefined}><Icon name="check" size={14} /></span>
                    <span className="ui-event-pick__date">{formatShortDate(t.date)}</span>
                    <span className="ui-event-pick__title">
                      {t.title}{t.upcoming && <> <Badge tone="warning">예정</Badge></>}
                    </span>
                    <span className="ui-text-sm ui-text-muted">{state.text}</span>
                    {state.badge === 'published' && <Badge tone="success" dot>공개</Badge>}
                    {state.badge === 'private' && <Badge tone="muted" dot>비공개</Badge>}
                  </button>
                );
              })}
            </div>
          )}
          {target && (
            <div className="ui-event-pick__foot">
              <div className="ui-text-xs ui-text-muted">{target.hasAlbum ? '올라갈 폴더' : 'Drive 에 새로 만들 폴더'}</div>
              <div className="ui-folder-line">
                <Icon name="folder" size={18} />
                <span className="ui-folder-line__path">
                  <span className="ui-folder-line__root">{rootFolderName} / </span>{target.folderName}
                </span>
              </div>
              {publishControl}
            </div>
          )}
        </Stack>
      )}

      {phase === 'pick' && (
        <Stack gap={4}>
          {pickingTarget && (
            <Button variant="ghost" size="sm" icon="arrowLeft" onClick={() => setPhase('target')}>
              이벤트 다시 고르기
            </Button>
          )}
          <div className="ui-dropzone">
            <Icon name="camera" size={28} />
            <div className="ui-dropzone__title">
              {eventTitle ? `${eventTitle} 앨범에 올려요` : '앨범에 올려요'}
            </div>
            <p className="ui-dropzone__hint">
              사진 25MB · 영상 500MB 까지, 한 번에 {MAX_FILES}개<br />
              {audienceHint}
            </p>
            <Button size="sm" variant="primary" onClick={() => inputRef.current?.click()}>
              파일 고르기
            </Button>
          </div>

          {/* 이벤트를 고르는 단계가 없을 때(앨범 화면)는 여기서 공개 여부를 고른다 */}
          {!pickingTarget && publishControl}

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
            {summary.publishedNow && ' 학부모에게 공개했어요.'}
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
