import React, { useEffect, useState } from 'react';
import {
  homeScreenEnvironment, shouldOfferHomeScreen, isAnotherOverlayOpen, markShownThisSession, hideHomeScreenPrompt,
  getInstallPrompt, subscribeInstallPrompt, promptInstall, PROMPT_DELAY_MS
} from '../../utils/homeScreen';
import { openExternalUrl } from '../../utils/pushNotifications';
import { getImpersonator } from '../../utils/tokenStorage';
import { SERVICE_NAME } from '../../utils/brand';
import { Button, Checkbox, Icon, Modal } from '../ui';

/** 안내 문장 속 버튼 모양 — 화면에서 찾을 버튼을 그대로 그려 보여 준다 */
function Key({ icon, label }) {
  return (
    <span className="ui-a2hs__key" role="img" aria-label={label}>
      <Icon name={icon} size={16} />
    </span>
  );
}

function IosSteps() {
  return (
    <>
      <ol className="ui-a2hs__steps">
        <li>
          <b>공유</b> 버튼 <Key icon="share" label="공유" /> 을 누르고
          <span className="ui-a2hs__hint">아이폰은 화면 아래, 아이패드는 위에 있어요 · 안 보이면 ⋯ 안에 있어요</span>
        </li>
        <li><b>홈 화면에 추가</b> <Key icon="plusSquare" label="홈 화면에 추가" /> 를 고른 뒤</li>
        <li>오른쪽 위 <b>추가</b>를 누르면 끝이에요</li>
      </ol>
      <p className="ui-a2hs__note">아이폰은 홈 화면에 추가한 앱에서만 새 일정·사진 알림을 받을 수 있어요.</p>
    </>
  );
}

function AndroidSteps() {
  return (
    <ol className="ui-a2hs__steps">
      <li>
        브라우저 메뉴 <Key icon="more" label="메뉴" /> 를 누르고
        <span className="ui-a2hs__hint">삼성 인터넷은 아래쪽 <Key icon="menu" label="메뉴" /></span>
      </li>
      <li><b>홈 화면에 추가</b> 또는 <b>앱 설치</b>를 고른 뒤</li>
      <li><b>추가</b>(또는 <b>설치</b>)를 누르면 끝이에요</li>
    </ol>
  );
}

/**
 * 홈 화면에 추가 안내 (학부모 앱, docs/home-screen-prompt).
 *
 * 홈 화면 아이콘으로 열지 않은 휴대폰에서, 앱이 뜨고 잠시 뒤 바텀시트로 한 번 띄운다
 * (다른 창이 떠 있으면 그 창이 닫힌 뒤에).
 * [다시 보지 않기] 를 체크한 채 닫으면(닫기 · X · 바깥 · Esc · 버튼 어느 것이든) 이 기기에서는 다시 띄우지 않고,
 * 체크하지 않고 닫으면 이번 탭에서만 다시 안 띄운다(다음에 앱을 열면 또 뜬다).
 * 안드로이드에서 브라우저가 설치 창을 허락하면 [홈 화면에 추가] 한 번으로 설치 창을 연다.
 */
function HomeScreenPrompt({ delayMs = PROMPT_DELAY_MS }) {
  const [env] = useState(() => homeScreenEnvironment());
  const [open, setOpen] = useState(false);
  const [dontShowAgain, setDontShowAgain] = useState(false);
  const [installPrompt, setInstallPrompt] = useState(() => getInstallPrompt());
  const [installing, setInstalling] = useState(false);

  // 팝업이 메뉴 안내로 떠 있다가 설치 이벤트가 오면 그 자리에서 버튼이 생긴다
  useEffect(() => subscribeInstallPrompt(setInstallPrompt), []);

  useEffect(() => {
    const offer = () => shouldOfferHomeScreen({ env, impersonating: Boolean(getImpersonator()) });
    if (!offer()) return undefined;

    let timer;
    const tryOpen = () => {
      // 기다리는 사이 다른 탭에서 다시 보지 않기를 눌렀을 수도 있다
      if (!offer()) return;
      // 공유 링크로 연 사진 뷰어처럼 다른 창이 떠 있으면 닫힐 때까지 기다렸다가 띄운다
      if (isAnotherOverlayOpen()) {
        timer = setTimeout(tryOpen, delayMs);
        return;
      }
      markShownThisSession();
      setOpen(true);
    };
    timer = setTimeout(tryOpen, delayMs);
    return () => clearTimeout(timer);
  }, [env, delayMs]);

  if (!open) return null;

  const close = () => {
    if (dontShowAgain) hideHomeScreenPrompt();
    setOpen(false);
  };

  const install = async () => {
    setInstalling(true);
    const outcome = await promptInstall();
    setInstalling(false);
    // 브라우저가 거절하면(unavailable) 버튼이 사라지고 메뉴 안내로 바뀐 채 남는다
    if (outcome !== 'unavailable') close();
  };

  const canPrompt = env === 'android' && Boolean(installPrompt);

  let body;
  let action = null;
  if (env === 'kakaotalk') {
    body = (
      <>
        <p className="ui-a2hs__lead">
          카카오톡 안에서 연 화면은 홈 화면에 추가할 수 없어요. 아래 버튼으로 브라우저에서 연 뒤 추가해 주세요.
        </p>
        <p className="ui-a2hs__note">브라우저에서 카카오 로그인을 한 번 더 하면, 그곳에서 추가하는 방법을 다시 알려 드려요.</p>
      </>
    );
    action = (
      <Button as="a" variant="primary" icon="external" href={openExternalUrl(window.location.href)} onClick={close}>
        브라우저로 열기
      </Button>
    );
  } else if (env === 'ios') {
    body = <IosSteps />;
  } else if (canPrompt) {
    body = <p className="ui-a2hs__lead">버튼 한 번이면 홈 화면에 {SERVICE_NAME} 아이콘이 생겨요.</p>;
    action = (
      <Button variant="primary" icon="plusSquare" onClick={install} loading={installing}>
        홈 화면에 추가
      </Button>
    );
  } else {
    body = <AndroidSteps />;
  }

  return (
    <Modal
      open
      onClose={close}
      title={`홈 화면에 ${SERVICE_NAME} 추가하기`}
      description="앱처럼 아이콘 한 번에 일정·사진을 열 수 있어요."
      mode="sheet"
      size="sm"
      className="ui-a2hs"
      data-testid="home-screen-prompt"
      data-env={env}
      footer={(
        <>
          <Button variant={action ? 'outline' : 'primary'} onClick={close}>닫기</Button>
          {action}
        </>
      )}
    >
      {body}
      <div className="ui-a2hs__dont">
        <Checkbox
          label="다시 보지 않기"
          checked={dontShowAgain}
          onChange={(e) => setDontShowAgain(e.target.checked)}
        />
        <span className="ui-a2hs__hint">이미 추가했다면 체크하고 닫아 주세요</span>
      </div>
    </Modal>
  );
}

export default HomeScreenPrompt;
