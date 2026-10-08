import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchWithAuth } from '../../utils/api';
import { formatSize } from '../../utils/mediaUrls';
import {
  Badge, Button, Callout, Card, CardFooter, CardHeader, ConfirmDialog, Icon, Input, Progress, Spinner
} from '../../components/ui';

/**
 * 설정 화면의 Google 계정 카드 (docs/photo-menu FR-500~505).
 *
 * 사진 메뉴의 앨범은 선생님의 Google Drive 에 저장되므로 이 카드가 사진 기능의 출발점이다.
 * 연결은 이 카드에서만 한다 — 사진 메뉴는 연결 전이면 여기로 보낸다.
 * 연결은 브라우저 리다이렉트로 끝나기 때문에 돌아온 결과(?drive=...)를 여기서 한 줄로 알려 준다.
 * 지금 주소의 쿼리만 보고 고치므로(window.location) 이 카드가 어느 화면에 붙어도 된다.
 */

const CALLBACK_MESSAGES = {
  connected: { tone: 'success', text: 'Google 계정을 연결했습니다.' },
  denied: { tone: 'warning', text: 'Google 계정 연결을 취소했습니다.' },
  expired: { tone: 'warning', text: '연결 요청이 만료되었습니다. 다시 연결해 주세요.' },
  norefresh: { tone: 'warning', text: '권한을 다 받지 못했습니다. Google 계정 연결을 다시 해 주세요.' },
  error: { tone: 'danger', text: 'Google 계정을 연결하지 못했습니다. 잠시 뒤 다시 시도해 주세요.' }
};

/** 파랑·초록을 쓰지 않는 규칙이라 Google 마크는 잉크로 그린 G 다 (.ui-google-mark) */
const GoogleMark = ({ small = false }) => (
  <span className="ui-google-mark" data-size={small ? 'sm' : undefined} aria-hidden="true">G</span>
);

function DriveAccountCard() {
  const [account, setAccount] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [flash, setFlash] = useState(null);
  const [problem, setProblem] = useState('');
  const [busy, setBusy] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [confirmingDisconnect, setConfirmingDisconnect] = useState(false);

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
    setProblem('');
    try {
      const response = await fetchWithAuth('/api/drive/connect');
      const data = await response.json();
      if (!response.ok || !data.url) {
        setProblem(data.error || 'Google 연결을 시작하지 못했습니다.');
        return;
      }
      window.location.href = data.url;
    } catch (error) {
      console.error('Drive 연결 시작 실패:', error);
      setProblem('Google 연결을 시작하지 못했습니다.');
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
    setProblem('');
    try {
      const response = await fetchWithAuth('/api/drive/account', {
        method: 'PATCH',
        body: JSON.stringify({ rootFolderName: name })
      });
      const data = await response.json();
      if (!response.ok) {
        setProblem(data.error || '폴더 이름 변경에 실패했습니다.');
        return;
      }
      setAccount((prev) => ({ ...prev, ...data }));
      setRenaming(false);
    } catch (error) {
      console.error('Drive 폴더 이름 변경 실패:', error);
      setProblem('폴더 이름 변경에 실패했습니다.');
    } finally {
      setBusy(false);
    }
  };

  const disconnect = async () => {
    setBusy(true);
    setProblem('');
    try {
      const response = await fetchWithAuth('/api/drive/account', { method: 'DELETE' });
      const data = await response.json();
      if (!response.ok) {
        setProblem(data.error || '연결 해제에 실패했습니다.');
        return;
      }
      setFlash({ tone: 'neutral', text: 'Google 계정 연결을 해제했습니다. Drive 의 사진과 폴더는 그대로 있어요.' });
      setRenaming(false);
      await load();
    } catch (error) {
      console.error('Drive 연결 해제 실패:', error);
      setProblem('연결 해제에 실패했습니다.');
    } finally {
      setBusy(false);
      setConfirmingDisconnect(false);
    }
  };

  const connected = Boolean(account?.connected);
  const hasError = connected && account.status === 'error';

  const header = (
    <CardHeader
      title="Google 계정 (사진 저장)"
      description="사진 메뉴의 앨범은 선생님 Google Drive 에 저장돼요."
      actions={connected ? (hasError ? <Badge tone="danger" dot>연결 오류</Badge> : <Badge tone="success" dot>연결됨</Badge>) : null}
    />
  );

  const notices = (
    <>
      {flash && <div className="ui-mt-4"><Callout tone={flash.tone}>{flash.text}</Callout></div>}
      {problem && <div className="ui-mt-4"><Callout tone="danger">{problem}</Callout></div>}
    </>
  );

  if (loading) {
    return <Card padding="md" className="ui-mb-4">{header}<Spinner inline /></Card>;
  }

  if (loadFailed) {
    return (
      <Card padding="md" className="ui-mb-4">
        {header}
        <div className="ui-mt-4"><Callout tone="neutral">Google 계정 연결 정보를 불러오지 못했습니다. 잠시 뒤 다시 열어 주세요.</Callout></div>
      </Card>
    );
  }

  if (account?.configured === false) {
    return (
      <Card padding="md" className="ui-mb-4">
        {header}
        {notices}
        <div className="ui-mt-4">
          <Callout tone="neutral">Google Drive 연동이 아직 설정되지 않았습니다. <b>관리자</b>가 Google 연동 키를 등록해야 사용할 수 있습니다.</Callout>
        </div>
      </Card>
    );
  }

  if (!connected) {
    return (
      <Card padding="md" className="ui-mb-4">
        {header}
        {notices}
        <div className="ui-row ui-mt-4" data-gap="3" data-align="start">
          <GoogleMark />
          <div className="ui-stack" data-gap="2">
            <b>아직 연결하지 않았어요</b>
            <ul className="ui-text-sm ui-bullets">
              <li>연결하면 내 드라이브에 <b>RG Manager</b> 폴더가 생기고, 사진을 올릴 때 고른 <b>이벤트 이름</b>으로 앨범 폴더가 만들어져요.</li>
              <li>앱은 <b>앱이 만든 폴더·파일만</b> 볼 수 있어요. 선생님의 다른 파일은 보지 않아요.</li>
              <li>학부모가 올린 사진도 선생님 Drive 용량(무료 15GB)을 써요.</li>
            </ul>
          </div>
        </div>
        <CardFooter>
          <span className="ui-hand">Google 화면에서 ‘허용’을 누르면 여기로 돌아와요</span>
          <Button variant="primary" onClick={connect} loading={busy}>
            <GoogleMark small />Google 계정 연결하기
          </Button>
        </CardFooter>
      </Card>
    );
  }

  const quota = account.quota || null;
  const limit = Number(quota?.limit) || 0;
  const usage = Number(quota?.usage) || 0;
  const percent = limit > 0 ? Math.min(100, Math.round((usage / limit) * 100)) : 0;
  const nearFull = percent > 85;

  return (
    <Card padding="md" className="ui-mb-4">
      {header}
      {notices}

      {hasError && (
        <div className="ui-mt-4">
          <Callout tone="danger">
            <b>Google 계정 연결이 끊어졌어요.</b> 권한이 철회됐거나 연결 기간이 끝났어요. 앨범은 계속 보이지만 사진 올리기·지우기는 멈춰요.
            <div className="ui-mt-2"><Button size="sm" variant="primary" onClick={connect} loading={busy}>다시 연결</Button></div>
          </Callout>
        </div>
      )}

      {!hasError && nearFull && (
        <div className="ui-mt-4">
          <Callout tone="warning">
            <b>Drive 용량이 거의 찼습니다.</b> 새 업로드가 실패할 수 있으니 저장 용량을 늘리거나 지난 앨범을 정리해 주세요.
          </Callout>
        </div>
      )}

      <div className="ui-row ui-mt-4" data-gap="3">
        <GoogleMark />
        <div className="ui-drive-account__who">
          <b className="ui-drive-account__email">{account.email || '연결된 계정'}</b>
          <div className="ui-text-sm ui-text-muted">권한: 앱이 만든 파일만 (drive.file)</div>
        </div>
        <Button size="sm" onClick={() => setConfirmingDisconnect(true)} disabled={busy}>연결 해제</Button>
      </div>

      <dl className="ui-dl ui-mt-4">
        <div className="ui-dl__row">
          <dt className="ui-dl__label">저장 위치</dt>
          <dd className="ui-dl__value">
            {renaming ? (
              <div className="ui-row" data-gap="2" data-wrap="true">
                <Input
                  value={nameInput}
                  maxLength={60}
                  aria-label="루트 폴더 이름"
                  onChange={(event) => setNameInput(event.target.value)}
                />
                <Button size="sm" variant="primary" onClick={saveName} disabled={busy}>저장</Button>
                <Button size="sm" onClick={() => setRenaming(false)} disabled={busy}>취소</Button>
              </div>
            ) : (
              <div className="ui-row" data-gap="2" data-wrap="true">
                <span className="ui-folder-line">
                  <Icon name="folder" size={18} />
                  <span className="ui-folder-line__path"><span className="ui-folder-line__root">내 드라이브 / </span>{account.rootFolderName || 'RG Manager'}</span>
                </span>
                <Button size="sm" variant="ghost" onClick={startRename}>이름 바꾸기</Button>
              </div>
            )}
          </dd>
        </div>
        {quota && limit > 0 && (
          <div className="ui-dl__row">
            <dt className="ui-dl__label">Drive 사용량</dt>
            <dd className="ui-dl__value ui-drive-account__usage">
              <div className="ui-row ui-text-sm" data-justify="between"><span>{formatSize(usage)} / {formatSize(limit)}</span></div>
              <Progress className="ui-mt-2" value={percent} tone={nearFull ? undefined : 'success'} label="Drive 사용량" />
            </dd>
          </div>
        )}
      </dl>

      <p className="ui-text-xs ui-text-muted ui-mt-3">
        사진이 올라올 때 브라우저가 <b>얼굴 특징값만</b> 계산해 저장합니다. 사진 속 얼굴 이미지는 저장하지 않습니다.
      </p>

      <CardFooter>
        <Link className="ui-btn" data-variant={hasError ? 'outline' : 'primary'} data-size="md" to="/photos">
          사진 메뉴로 가기<Icon name="arrowRight" size={18} />
        </Link>
      </CardFooter>

      <ConfirmDialog
        open={confirmingDisconnect}
        title="Google 계정 연결을 해제할까요?"
        message="Drive 에 있는 사진과 폴더는 그대로 남아요. 해제하면 앨범은 볼 수만 있고, 새 사진을 올리거나 지울 수 없어요."
        confirmLabel="연결 해제"
        tone="danger"
        busy={busy}
        onCancel={() => setConfirmingDisconnect(false)}
        onConfirm={disconnect}
      />
    </Card>
  );
}

export default DriveAccountCard;
