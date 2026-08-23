import React, { useEffect, useState } from 'react';
import { fetchWithAuth } from '../../utils/api';
import { formatSize } from '../../utils/mediaUrls';

/**
 * 설정 화면의 Google Drive 연결 카드.
 *
 * 앨범 사진은 선생님의 Drive 에 저장되므로 이 카드가 앨범 기능의 출발점이다.
 * 연결은 브라우저 리다이렉트로 끝나기 때문에 돌아온 결과(?drive=...)를 여기서 한 줄로 알려 준다.
 * react-router 를 쓰지 않고 window.location 만 보는 이유는 이 카드가 어떤 화면에도 붙을 수 있어서다.
 */

const CALLBACK_MESSAGES = {
  connected: { tone: 'ok', text: 'Google 계정을 연결했습니다.' },
  denied: { tone: 'warn', text: 'Google 계정 연결을 취소했습니다.' },
  expired: { tone: 'warn', text: '연결 요청이 만료되었습니다. 다시 연결해 주세요.' },
  norefresh: { tone: 'warn', text: '권한을 다 받지 못했습니다. Google 계정 연결을 다시 해 주세요.' },
  error: { tone: 'danger', text: 'Google 계정을 연결하지 못했습니다. 잠시 뒤 다시 시도해 주세요.' }
};

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
  lineHeight: 1.6
});

const GoogleMark = ({ size = 42 }) => (
  <span
    aria-hidden="true"
    style={{
      width: `${size}px`, height: `${size}px`, borderRadius: 'var(--radius-md)', flexShrink: 0,
      background: 'linear-gradient(135deg,#FFD04D,#4285F4 60%,#0F9D58)',
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      color: '#fff', fontWeight: 900, fontSize: size >= 32 ? '1.1rem' : '0.7rem'
    }}
  >G</span>
);

function DriveAccountCard() {
  const [account, setAccount] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [flash, setFlash] = useState(null);
  const [busy, setBusy] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [nameInput, setNameInput] = useState('');

  const load = async () => {
    try {
      const response = await fetchWithAuth('/api/drive/account');
      if (!response.ok) {
        setLoadFailed(true);
        return;
      }
      setAccount(await response.json());
      setLoadFailed(false);
    } catch (error) {
      console.error('Drive 연결 조회 실패:', error);
      setLoadFailed(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // OAuth 콜백이 남긴 결과를 한 번 보여주고 주소는 깨끗하게 되돌린다.
    const params = new URLSearchParams(window.location.search || '');
    const result = params.get('drive');
    if (result) {
      setFlash(CALLBACK_MESSAGES[result] || CALLBACK_MESSAGES.error);
      params.delete('drive');
      const query = params.toString();
      window.history.replaceState({}, '', `${window.location.pathname}${query ? `?${query}` : ''}`);
    }
    load();
  }, []);

  const connect = async () => {
    setBusy(true);
    try {
      const response = await fetchWithAuth('/api/drive/connect');
      const data = await response.json();
      if (!response.ok || !data.url) {
        alert(data.error || 'Google 연결을 시작하지 못했습니다.');
        return;
      }
      window.location.href = data.url;
    } catch (error) {
      console.error('Drive 연결 시작 실패:', error);
      alert('Google 연결을 시작하지 못했습니다.');
    } finally {
      setBusy(false);
    }
  };

  const startRename = () => {
    setNameInput(account?.rootFolderName || 'RG Manager');
    setRenaming(true);
  };

  const saveName = async () => {
    const name = nameInput.trim();
    if (!name) return;

    setBusy(true);
    try {
      const response = await fetchWithAuth('/api/drive/account', {
        method: 'PATCH',
        body: JSON.stringify({ rootFolderName: name })
      });
      const data = await response.json();
      if (!response.ok) {
        alert(data.error || '폴더 이름 변경에 실패했습니다.');
        return;
      }
      setAccount((prev) => ({ ...prev, ...data }));
      setRenaming(false);
    } catch (error) {
      console.error('Drive 폴더 이름 변경 실패:', error);
      alert('폴더 이름 변경에 실패했습니다.');
    } finally {
      setBusy(false);
    }
  };

  const disconnect = async () => {
    if (!window.confirm('Google Drive 연결을 해제할까요?\n새 앨범을 만들 수 없게 되지만 Drive 에 있는 사진은 그대로 남습니다.')) return;

    setBusy(true);
    try {
      const response = await fetchWithAuth('/api/drive/account', { method: 'DELETE' });
      const data = await response.json();
      if (!response.ok) {
        alert(data.error || '연결 해제에 실패했습니다.');
        return;
      }
      setFlash({ tone: 'gray', text: 'Google Drive 연결을 해제했습니다.' });
      setRenaming(false);
      await load();
    } catch (error) {
      console.error('Drive 연결 해제 실패:', error);
      alert('연결 해제에 실패했습니다.');
    } finally {
      setBusy(false);
    }
  };

  const banner = flash ? <div style={{ ...noticeStyle(flash.tone), marginBottom: '14px' }}>{flash.text}</div> : null;

  const shell = (children) => (
    <div className="card" style={{ marginBottom: 'var(--spacing-lg)' }}>
      <div className="card-header">
        <h3 className="card-title">Google Drive</h3>
      </div>
      <div style={{ marginTop: 'var(--spacing-lg)' }}>
        {banner}
        {children}
      </div>
    </div>
  );

  if (loading) {
    return shell(<div style={{ color: 'var(--color-gray-500)', fontSize: '0.875rem' }}>불러오는 중...</div>);
  }

  if (loadFailed) {
    return shell(<div style={noticeStyle('gray')}>Google Drive 연결 정보를 불러오지 못했습니다. 잠시 뒤 다시 열어 주세요.</div>);
  }

  if (account?.configured === false) {
    return shell(
      <div style={noticeStyle('gray')}>
        Google Drive 연동이 아직 설정되지 않았습니다. <b>관리자</b>가 Google 연동 키를 등록해야 사용할 수 있습니다.
      </div>
    );
  }

  if (!account?.connected) {
    return shell(
      <>
        <div style={{ fontSize: '0.8125rem', color: 'var(--color-gray-600)', lineHeight: 1.7, marginBottom: '14px' }}>
          아직 연결되지 않았습니다. 연결하면 이벤트마다 <b>앨범 폴더</b>를 만들 수 있고, 확정된 학부모가 앱에서 바로 사진·영상을 올릴 수 있습니다.
          앱은 <b>앱이 만든 폴더와 파일만</b> 볼 수 있으며 선생님의 다른 파일에는 접근하지 않습니다.
        </div>
        <button
          type="button"
          className="btn btn-outline"
          onClick={connect}
          disabled={busy}
          style={{ fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center', gap: '8px', fontWeight: 700 }}
        >
          <GoogleMark size={20} />
          Google 계정 연결하기
        </button>
      </>
    );
  }

  const quota = account.quota || null;
  const limit = Number(quota?.limit) || 0;
  const usage = Number(quota?.usage) || 0;
  const percent = limit > 0 ? Math.min(100, Math.round((usage / limit) * 100)) : 0;
  const nearFull = percent > 85;
  const hasError = account.status === 'error';

  return shell(
    <>
      {hasError && (
        <div style={{ ...noticeStyle('danger'), marginBottom: '14px' }} role="alert">
          ⚠️ <b>Google Drive 연결이 끊어졌어요.</b> 권한이 철회되어 업로드·삭제·분석이 멈춰 있습니다. 앨범 조회는 계속됩니다.
          <div>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={connect}
              disabled={busy}
              style={{ marginTop: '8px', fontFamily: 'inherit' }}
            >다시 연결</button>
          </div>
        </div>
      )}

      {!hasError && nearFull && (
        <div style={{ ...noticeStyle('warn'), marginBottom: '14px' }}>
          ⚠️ <b>Drive 용량이 거의 찼습니다.</b> 새 업로드가 실패할 수 있으니 저장 용량을 늘리거나 지난 앨범을 정리해 주세요.
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
        <GoogleMark />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 800, wordBreak: 'break-all' }}>{account.email || '연결된 계정'}</div>
          <div style={{ fontSize: '0.8125rem', color: 'var(--color-gray-500)', marginTop: '2px' }}>
            <span className={`badge ${hasError ? 'badge-danger' : 'badge-success'}`}>
              {hasError ? '연결 오류' : '연결됨'}
            </span>
            {' '}권한: 앱이 만든 파일만 (drive.file)
          </div>
        </div>
        <button
          type="button"
          className="btn btn-outline btn-sm"
          onClick={disconnect}
          disabled={busy}
          style={{ fontFamily: 'inherit' }}
        >연결 해제</button>
      </div>

      {quota && limit > 0 && (
        <div style={{ marginTop: '12px' }}>
          <div style={{
            display: 'flex', justifyContent: 'space-between',
            fontSize: '0.75rem', color: 'var(--color-gray-500)', marginBottom: '5px'
          }}>
            <span>Drive 사용량</span>
            <span>{formatSize(usage)} / {formatSize(limit)}</span>
          </div>
          <div
            role="progressbar"
            aria-label="Drive 사용량"
            aria-valuenow={percent}
            aria-valuemin={0}
            aria-valuemax={100}
            style={{ height: '8px', borderRadius: '5px', background: 'var(--color-gray-200)', overflow: 'hidden' }}
          >
            <i style={{
              display: 'block', height: '100%', width: `${percent}%`,
              background: nearFull ? 'var(--color-warning)' : 'var(--color-primary)'
            }} />
          </div>
        </div>
      )}

      <div style={{
        display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap',
        padding: '12px 0 4px', marginTop: '8px', borderTop: '1px solid var(--color-gray-100)', fontSize: '0.875rem'
      }}>
        <div style={{ width: '120px', flexShrink: 0, color: 'var(--color-gray-500)', fontSize: '0.8125rem', fontWeight: 600 }}>
          루트 폴더
        </div>
        {renaming ? (
          <div style={{ display: 'flex', gap: '8px', flex: 1, flexWrap: 'wrap' }}>
            <input
              type="text"
              value={nameInput}
              maxLength={60}
              aria-label="루트 폴더 이름"
              onChange={(event) => setNameInput(event.target.value)}
              style={{ flex: 1, minWidth: '140px' }}
            />
            <button type="button" className="btn btn-primary btn-sm" onClick={saveName} disabled={busy} style={{ fontFamily: 'inherit' }}>
              저장
            </button>
            <button type="button" className="btn btn-outline btn-sm" onClick={() => setRenaming(false)} disabled={busy} style={{ fontFamily: 'inherit' }}>
              취소
            </button>
          </div>
        ) : (
          <>
            <div style={{ flex: 1, minWidth: 0, wordBreak: 'break-all' }}>
              내 드라이브 / <b>{account.rootFolderName || 'RG Manager'}</b>
            </div>
            <button type="button" className="btn btn-outline btn-sm" onClick={startRename} style={{ fontFamily: 'inherit' }}>
              이름 변경
            </button>
          </>
        )}
      </div>

      <div style={{ fontSize: '0.75rem', color: 'var(--color-gray-500)', lineHeight: 1.7, marginTop: '8px' }}>
        사진이 올라올 때 브라우저가 <b>얼굴 특징값만</b> 계산해 저장합니다. 사진 속 얼굴 이미지는 저장하지 않습니다.
      </div>
    </>
  );
}

export default DriveAccountCard;
