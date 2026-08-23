import React, { useState, useEffect, useRef } from 'react';
import { fetchWithAuth } from '../../utils/api';
import { copyToClipboard } from '../../utils/copyToClipboard';
import { buildFileMarkdown } from '../../utils/richText';

const MAX_BYTES = 4 * 1024 * 1024;
const ACCEPT = '.pdf,.html,.htm,.txt,.png,.jpg,.jpeg,.gif,.webp,.doc,.docx,.xls,.xlsx';

const KIND_ICON = { html: '📄', pdf: '📕', image: '🖼️', text: '📝', doc: '📘' };

export const formatSize = (bytes) => {
  if (!bytes && bytes !== 0) return '-';
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
};

const formatDate = (value) => {
  const d = new Date(value);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())}`;
};

function FaqFiles({ onToast, filterUserId, userName }) {
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [storageReady, setStorageReady] = useState(true);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    loadFiles();
  }, [filterUserId]);

  const toast = (message) => {
    if (onToast) onToast(message);
    else alert(message);
  };

  const loadFiles = async () => {
    try {
      const query = filterUserId && filterUserId !== 'all' ? `?filterUserId=${filterUserId}` : '';
      const response = await fetchWithAuth(`/api/faq-files${query}`);
      const data = await response.json();
      setFiles(Array.isArray(data.files) ? data.files : []);
      setStorageReady(data.storageReady !== false);
    } catch (error) {
      console.error('파일 목록 로드 실패:', error);
    } finally {
      setLoading(false);
    }
  };

  const upload = async (file) => {
    if (!file) return;

    if (file.size > MAX_BYTES) {
      toast('파일이 너무 큽니다. 4MB 이하만 올릴 수 있습니다.');
      return;
    }

    setUploading(true);
    try {
      // 파일 바이트를 그대로 보낸다 (base64 로 감싸면 용량이 늘어 한도에 걸린다).
      const response = await fetchWithAuth(
        `/api/faq-files?filename=${encodeURIComponent(file.name)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': file.type || 'application/octet-stream' },
          body: file
        }
      );

      const data = await response.json();

      if (response.ok) {
        await loadFiles();
        toast(`${data.filename} 을(를) 올렸습니다`);
      } else {
        toast(data.error || '파일 업로드에 실패했습니다');
      }
    } catch (error) {
      console.error('파일 업로드 실패:', error);
      toast('파일 업로드에 실패했습니다');
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    if (uploading) return;
    upload(e.dataTransfer.files?.[0]);
  };

  // FAQ 답변에 붙여넣으면 파일 이름으로 보이는 형식으로 복사한다.
  // HTML 은 우리 서버를 거치는 주소(linkUrl)를 써야 페이지로 열린다.
  const handleCopyForFaq = async (file) => {
    const ok = await copyToClipboard(buildFileMarkdown(file.filename, file.linkUrl || file.url));
    toast(ok ? 'FAQ 답변에 붙여넣을 링크를 복사했습니다' : '복사에 실패했습니다');
  };

  const handleCopyUrl = async (file) => {
    const ok = await copyToClipboard(file.url);
    toast(ok ? '파일 주소를 복사했습니다' : '복사에 실패했습니다');
  };

  const handleDelete = async (file) => {
    if (!confirm(`"${file.filename}" 을(를) 삭제하시겠습니까?\n\nFAQ 답변에 이 파일 링크가 들어 있으면 그 링크는 열리지 않게 됩니다.`)) {
      return;
    }

    try {
      const response = await fetchWithAuth(`/api/faq-files/${file.id}`, { method: 'DELETE' });
      if (response.ok) {
        await loadFiles();
        toast('파일이 삭제되었습니다');
      } else {
        const data = await response.json();
        toast(data.error || '파일 삭제에 실패했습니다');
      }
    } catch (error) {
      console.error('파일 삭제 실패:', error);
      toast('파일 삭제에 실패했습니다');
    }
  };

  return (
    <div className="faq-files">
      {!storageReady && (
        <div className="faq-inactive-notice" role="alert">
          파일 저장소가 설정되지 않아 업로드할 수 없습니다. 서버 환경변수
          (SUPABASE_SECRET_KEY)를 확인해 주세요.
        </div>
      )}

      <div
        className={`faq-file-drop ${dragOver ? 'over' : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
      >
        <div className="faq-file-drop-icon" aria-hidden="true">📎</div>
        <div className="faq-file-drop-title">
          파일을 끌어다 놓거나 아래 버튼으로 올려주세요
        </div>
        <div className="faq-file-drop-desc">
          PDF, HTML, 이미지, 문서 · 4MB 이하
        </div>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          onChange={(e) => upload(e.target.files?.[0])}
          disabled={uploading || !storageReady}
          style={{ display: 'none' }}
          data-testid="faq-file-input"
        />
        <button
          className="btn btn-primary"
          onClick={() => inputRef.current?.click()}
          disabled={uploading || !storageReady}
        >
          {uploading ? '올리는 중...' : '파일 선택'}
        </button>
      </div>

      <p className="faq-file-help">
        올린 파일의 <strong>FAQ 링크 복사</strong>를 눌러 FAQ 답변에 붙여넣으면,
        학부모 채팅에서 파일 이름으로 보이고 눌러서 열 수 있습니다.
        HTML 파일은 채팅 안에서 바로 펼쳐집니다.
      </p>

      {loading ? (
        <div className="faq-file-list">
          <div className="skeleton" style={{ height: 64, borderRadius: 8 }}></div>
          <div className="skeleton" style={{ height: 64, borderRadius: 8 }}></div>
        </div>
      ) : files.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">📎</div>
          <div className="empty-state-title">올린 파일이 없습니다</div>
          <div className="empty-state-description">
            안내문, 신청서 같은 자료를 올려 FAQ 답변에 링크로 붙일 수 있습니다.
          </div>
        </div>
      ) : (
        <div className="faq-file-list">
          {files.map((file) => (
            <div key={file.id} className="faq-file-item">
              <div className="faq-file-icon" aria-hidden="true">
                {KIND_ICON[file.kind] || '📎'}
              </div>
              <div className="faq-file-meta">
                <a
                  href={file.linkUrl || file.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="faq-file-name"
                >
                  {file.filename}
                </a>
                <div className="faq-file-sub">
                  {formatSize(file.size)} · {formatDate(file.createdAt)}
                  {userName && ` · ${userName(file.userId)}`}
                </div>
              </div>
              <div className="faq-file-actions">
                <button className="btn btn-primary btn-sm" onClick={() => handleCopyForFaq(file)}>
                  FAQ 링크 복사
                </button>
                <button className="btn btn-secondary btn-sm" onClick={() => handleCopyUrl(file)}>
                  주소만
                </button>
                <button className="btn btn-danger btn-sm" onClick={() => handleDelete(file)}>
                  삭제
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default FaqFiles;
