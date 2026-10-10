import React, { useEffect, useState } from 'react';
import {
  pushEnvironment, loadPushConfig, registerServiceWorker, currentSubscription,
  enablePush, disablePush, openExternalUrl, isIos
} from '../../utils/pushNotifications';
import { Button, Callout, Card, CardHeader, SwitchField } from '../../components/ui';

/**
 * 새 일정 알림 카드 (내 정보 화면).
 *
 * 이 기기(브라우저)의 알림을 켜고 끈다. 선생님이 이벤트를 저장하며 [학부모에게 알림 보내기] 를 체크하면
 * 알림을 켠 기기로 간다. 알림이 안 되는 곳(카카오톡 안, 아이폰 사파리 탭 …)에서는 스위치 대신 받는 방법을 안내한다.
 * 서버에 알림 키가 없으면 카드를 그리지 않는다.
 */
function EventPushCard() {
  const [env] = useState(() => pushEnvironment());
  const [config, setConfig] = useState(null);
  const [registration, setRegistration] = useState(null);
  const [registerFailed, setRegisterFailed] = useState(false);
  const [subscribed, setSubscribed] = useState(false);
  const [permission, setPermission] = useState(
    () => (typeof Notification === 'undefined' ? 'default' : Notification.permission)
  );
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;

    (async () => {
      const loaded = await loadPushConfig().catch(() => ({ configured: false }));
      if (!alive) return;
      setConfig(loaded);
      if (!loaded.configured || env !== 'supported') return;

      // 버튼을 누르기 전에 서비스 워커를 준비해 둔다 — 아이폰은 누른 동작 안에서 바로 권한을 물어야 한다
      try {
        const ready = await registerServiceWorker();
        if (!alive) return;
        setRegistration(ready);
        const existing = await currentSubscription(ready);
        if (alive) setSubscribed(Boolean(existing));
      } catch {
        if (alive) setRegisterFailed(true);
      }
    })();

    return () => { alive = false; };
  }, [env]);

  if (!config?.configured) return null;

  const toggle = async (e) => {
    const turnOn = e.target.checked;
    setNotice('');
    setError('');
    setBusy(true);
    try {
      if (turnOn) {
        const result = await enablePush({ registration, publicKey: config.publicKey });
        setPermission(result);
        if (result === 'granted') {
          setSubscribed(true);
          setNotice('알림을 켰어요. 선생님이 새 일정을 열면 이 기기로 알려 드려요.');
        }
      } else {
        await disablePush({ registration });
        setSubscribed(false);
        setNotice('이 기기의 알림을 껐어요.');
      }
    } catch {
      setError(turnOn ? '알림을 켜지 못했어요. 잠시 뒤 다시 해 주세요.' : '알림을 끄지 못했어요. 잠시 뒤 다시 해 주세요.');
    } finally {
      setBusy(false);
    }
  };

  const denied = permission === 'denied' && !subscribed;

  return (
    <Card padding="md" className="ui-push-card" data-testid="event-push-card">
      <CardHeader title="새 일정 알림" description="선생님이 새 일정을 열면 휴대폰·PC 알림으로 알려 드려요." />

      {env === 'kakaotalk' && (
        <Callout tone="warning">
          카카오톡 안에서 연 화면에서는 알림을 받을 수 없어요. 크롬·사파리 같은 브라우저로 열어서 알림을 켜 주세요.
          {isIos(navigator) && ' 아이폰은 사파리에서 홈 화면에 추가한 뒤 그 아이콘으로 열어야 해요.'}
          <div className="ui-push-card__action">
            <Button as="a" size="sm" variant="secondary" icon="external" href={openExternalUrl(window.location.href)}>
              브라우저로 열기
            </Button>
          </div>
        </Callout>
      )}

      {env === 'ios-install' && (
        <Callout tone="brand" icon="bell">
          아이폰·아이패드는 <b>홈 화면에 추가한 앱</b>에서만 알림을 받을 수 있어요.
          <ol className="ui-push-card__steps">
            <li>사파리 아래쪽 <b>공유</b> 버튼을 누르고</li>
            <li><b>홈 화면에 추가</b>를 고른 뒤</li>
            <li>홈 화면의 <b>JR 리듬체조</b> 아이콘으로 열어 로그인하고, 여기서 알림을 켜 주세요.</li>
          </ol>
        </Callout>
      )}

      {env === 'ios-update' && (
        <Callout tone="warning">
          iOS 16.4 이상에서 알림을 받을 수 있어요. 설정 › 일반 › 소프트웨어 업데이트에서 업데이트해 주세요.
        </Callout>
      )}

      {(env === 'unsupported' || (env === 'supported' && registerFailed)) && (
        <Callout tone="warning">이 브라우저에서는 알림을 받을 수 없어요. 크롬이나 사파리로 열어 주세요.</Callout>
      )}

      {env === 'supported' && !registerFailed && (
        <>
          <SwitchField
            id="event-push-toggle"
            label="이 기기로 새 일정 알림 받기"
            checked={subscribed}
            onChange={toggle}
            disabled={busy || !registration || denied}
            description={subscribed ? '켜져 있어요 · 다른 기기에서도 받으려면 그 기기에서 켜 주세요' : '꺼져 있어요'}
          />
          {denied && (
            <Callout tone="warning">
              이 기기에서 알림이 차단돼 있어요. 브라우저 설정의 사이트 권한에서 알림을 허용한 뒤 다시 켜 주세요.
            </Callout>
          )}
        </>
      )}

      {notice && <p role="status" className="ui-push-card__notice">{notice}</p>}
      {error && <Callout tone="danger">{error}</Callout>}
    </Card>
  );
}

export default EventPushCard;
