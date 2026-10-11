import React, { useState } from 'react';
import { fetchWithAuth } from '../../utils/api';
import { Button, Callout, DateField, Field, Icon, Input, Modal, Stack } from '../../components/ui';
import { folderEditNote, folderNameFrom, newFolderProblem, NEW_FOLDER_TITLE_MAX } from './albumState';

/**
 * 사진 폴더의 이름·날짜 고치기 (docs/photo-menu FR-519) — 사진 전용 폴더도, 이벤트 앨범(대회·스페셜)도.
 *
 * 저장하면 Drive 폴더 이름("날짜 이름")도 따라 바뀐다 — 아래에 바뀔 이름을 미리 보여 준다.
 * 이벤트 앨범은 폴더 이름이 이벤트에서 나오므로 이벤트의 이름·날짜가 함께 바뀐다 — 창이 미리 알린다(folderEditNote).
 * onSaved(result) — 서버 응답 그대로({ title, date, eventUpdated, driveRenamed, … }).
 */
function FolderEditDialog({ album, onClose, onSaved }) {
  const [draft, setDraft] = useState({ title: album.eventTitle || '', date: album.eventDate || '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const problem = newFolderProblem(draft);
  const unchanged = draft.title.trim() === (album.eventTitle || '') && draft.date === (album.eventDate || '');
  const hasDriveFolder = Boolean(album.driveFolderId);
  const note = folderEditNote(album, draft);

  const save = async () => {
    if (problem || saving) return;
    setSaving(true);
    setError('');
    try {
      const response = await fetchWithAuth(`/api/albums/${album.eventId}`, {
        method: 'PATCH',
        body: JSON.stringify({ title: draft.title.trim(), date: draft.date })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) { setError(payload.error || '바꾸지 못했어요.'); return; }
      onSaved?.(payload);
    } catch (saveError) {
      console.error('사진 폴더 수정 실패:', saveError);
      setError('바꾸지 못했어요. 잠시 뒤 다시 시도해 주세요.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      onClose={saving ? undefined : onClose}
      title="폴더 이름 · 날짜 수정"
      footer={(
        <>
          <Button block disabled={saving} onClick={onClose}>취소</Button>
          <Button variant="primary" block loading={saving} disabled={Boolean(problem) || unchanged} onClick={save}>저장</Button>
        </>
      )}
    >
      <Stack gap={4}>
        <div className="ui-event-pick__new">
          <Field label="이름" required htmlFor="edit-folder-title">
            {(props) => (
              <Input
                {...props} type="text" value={draft.title} maxLength={NEW_FOLDER_TITLE_MAX} autoFocus
                onChange={(event) => setDraft((prev) => ({ ...prev, title: event.target.value }))}
              />
            )}
          </Field>
          <Field label="날짜" required htmlFor="edit-folder-date">
            {(props) => (
              <DateField
                {...props} value={draft.date}
                onChange={(date) => setDraft((prev) => ({ ...prev, date }))}
              />
            )}
          </Field>
        </div>

        <div>
          <div className="ui-text-xs ui-text-muted">{hasDriveFolder ? '바뀔 Drive 폴더 이름' : '사진을 올리면 생길 Drive 폴더 이름'}</div>
          <div className="ui-folder-line">
            <Icon name="folder" size={18} />
            <span className="ui-folder-line__path">
              <span className="ui-folder-line__root">{album.drive?.rootFolderName || 'RG Manager'} / </span>{folderNameFrom(draft)}
            </span>
          </div>
        </div>

        {note && <Callout tone="neutral">{note}</Callout>}

        {error && <Callout tone="danger">{error}</Callout>}
      </Stack>
    </Modal>
  );
}

export default FolderEditDialog;
