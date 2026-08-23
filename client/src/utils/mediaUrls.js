/**
 * Drive 주소를 만드는 곳 (순수 함수).
 * 서버도 같은 주소를 만들지만, 화면이 직접 만들어야 하는 자리가 있어 여기에도 둔다.
 * 주소 형식이 바뀌면 여기 한 곳만 고치면 된다.
 */

const THUMBNAIL_BASE = 'https://drive.google.com/thumbnail';
const FILE_BASE = 'https://drive.google.com/file/d';

export const thumbnailUrl = (driveFileId, size = 400) =>
  (driveFileId ? `${THUMBNAIL_BASE}?id=${encodeURIComponent(driveFileId)}&sz=w${size}` : null);

export const originalUrl = (driveFileId) =>
  (driveFileId ? `${FILE_BASE}/${encodeURIComponent(driveFileId)}/view` : null);

export const previewUrl = (driveFileId) =>
  (driveFileId ? `${FILE_BASE}/${encodeURIComponent(driveFileId)}/preview` : null);

export const downloadUrl = (driveFileId) =>
  (driveFileId ? `https://drive.google.com/uc?export=download&id=${encodeURIComponent(driveFileId)}` : null);

export const folderUrl = (folderId) =>
  (folderId ? `https://drive.google.com/drive/folders/${encodeURIComponent(folderId)}` : null);

/** 0:64 이 아니라 1:04 로 보이게 */
export const formatDuration = (ms) => {
  const total = Math.round(Number(ms) / 1000);
  if (!Number.isFinite(total) || total <= 0) return null;
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
};

/** 3.2MB 처럼 */
export const formatSize = (bytes) => {
  const n = Number(bytes);
  if (!Number.isFinite(n) || n <= 0) return '';
  if (n < 1024 * 1024) return `${Math.round(n / 1024)}KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)}MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(1)}GB`;
};

export default { thumbnailUrl, originalUrl, previewUrl, downloadUrl, folderUrl, formatDuration, formatSize };
