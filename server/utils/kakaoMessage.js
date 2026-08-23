import User from '../models/User.js';
import KakaoMessageLog from '../models/KakaoMessageLog.js';
import NotificationSetting, { NOTIFICATION_EVENTS } from '../models/NotificationSetting.js';
import { APP_URL } from './appUrl.js';

const KAKAO_CLIENT_ID = process.env.KAKAO_CLIENT_ID;
const KAKAO_CLIENT_SECRET = process.env.KAKAO_CLIENT_SECRET;


// 학부모 요청 처리 중에 보내는 알림이 카카오 응답을 무한정 기다리지 않도록 하는 상한
const KAKAO_SEND_TIMEOUT_MS = 5000;

/**
 * 관리자가 이 이벤트의 알림을 꺼두었는지 확인한다.
 * 설정 조회가 실패하면 알림을 막지 않고 보내는 쪽(기존 동작)을 택한다.
 */
async function isEventEnabled(eventType) {
  try {
    return await NotificationSetting.isEnabled(eventType);
  } catch (error) {
    console.error('알림 설정 조회 실패, 발송을 계속합니다:', error);
    return true;
  }
}

const disabledResult = (eventType) => {
  const label = NOTIFICATION_EVENTS.find((e) => e.eventType === eventType)?.label || eventType;
  return {
    success: false,
    error: `'${label}'이 꺼져 있습니다. 관리자 > 알림에서 켤 수 있습니다.`,
    skipped: true,
    disabled: true,
  };
};

/**
 * 카카오 액세스 토큰 갱신
 */
async function refreshKakaoToken(userId, refreshToken) {
  try {
    const tokenParams = {
      grant_type: 'refresh_token',
      client_id: KAKAO_CLIENT_ID,
      refresh_token: refreshToken,
    };

    if (KAKAO_CLIENT_SECRET) {
      tokenParams.client_secret = KAKAO_CLIENT_SECRET;
    }

    const response = await fetch('https://kauth.kakao.com/oauth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8',
      },
      body: new URLSearchParams(tokenParams),
    });

    const data = await response.json();

    if (data.error) {
      console.error('카카오 토큰 갱신 실패:', data);
      return null;
    }

    const newAccessToken = data.access_token;
    // refresh_token은 만료 임박 시에만 반환됨
    const newRefreshToken = data.refresh_token || refreshToken;
    const expiresIn = data.expires_in;
    const tokenExpiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

    // DB에 새 토큰 저장
    await User.updateKakaoTokens(userId, {
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
      tokenExpiresAt,
    });

    console.log('카카오 토큰 갱신 완료');
    return newAccessToken;
  } catch (error) {
    console.error('카카오 토큰 갱신 오류:', error);
    return null;
  }
}

/**
 * 유효한 액세스 토큰 가져오기 (필요시 갱신)
 */
async function getValidAccessToken(userId, checkConsent = true) {
  const tokens = await User.getKakaoTokens(userId);

  if (!tokens) return null;
  if (!tokens.kakaoAccessToken) return null;
  if (checkConsent && !tokens.kakaoMessageConsent) return null;

  // 토큰 만료 확인 (5분 버퍼)
  const expiresAt = tokens.kakaoTokenExpiresAt ? new Date(tokens.kakaoTokenExpiresAt) : null;
  const now = new Date();
  const bufferMs = 5 * 60 * 1000; // 5분

  if (!expiresAt) {
    return await refreshKakaoToken(userId, tokens.kakaoRefreshToken);
  }

  if (expiresAt.getTime() - now.getTime() < bufferMs) {
    return await refreshKakaoToken(userId, tokens.kakaoRefreshToken);
  }

  return tokens.kakaoAccessToken;
}

/**
 * 요일 가져오기
 */
function getDayOfWeek(dateString) {
  const days = ['일', '월', '화', '수', '목', '금', '토'];
  const date = new Date(dateString);
  return days[date.getDay()];
}

/**
 * 카카오톡 출석 알림 메시지 전송
 */
export async function sendAttendanceKakaoMessage({
  userId,
  date,
  className,
  schedule,
  students,
  presentStudentIds,
}) {
  try {
    if (!(await isEventEnabled('ATTENDANCE'))) return disabledResult('ATTENDANCE');

    const accessToken = await getValidAccessToken(userId);

    if (!accessToken) {
      return {
        success: false,
        error: '유효한 카카오 토큰이 없거나 메시지 알림에 동의하지 않았습니다.',
        skipped: true,
      };
    }

    const dayOfWeek = getDayOfWeek(date);
    const presentCount = presentStudentIds.length;
    const totalCount = students.length;
    const presentStudentNames = students
      .filter((s) => presentStudentIds.includes(s.id))
      .map((s) => s.name)
      .join(', ');

    // Text 템플릿 사용 (List 템플릿보다 간단하고 안정적)
    const templateObject = {
      object_type: 'text',
      text: `📋 출석 체크 완료\n\n📅 ${date} (${dayOfWeek})\n📚 ${className}\n⏰ ${schedule}\n\n✅ 출석: ${presentCount}명 / ${totalCount}명\n👥 ${presentStudentNames || '없음'}`,
      link: {
        web_url: APP_URL,
        mobile_web_url: APP_URL,
      },
      button_title: '출석 관리 열기',
    };

    const response = await fetch('https://kapi.kakao.com/v2/api/talk/memo/default/send', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8',
      },
      body: new URLSearchParams({
        template_object: JSON.stringify(templateObject),
      }),
    });

    const result = await response.json();

    const messageContent = templateObject.text;

    if (result.result_code === 0) {
      console.log('카카오톡 메시지 전송 성공');
      // 로그 기록
      await KakaoMessageLog.create({
        senderId: userId,
        recipientId: userId,
        messageType: 'ATTENDANCE',
        messageContent,
        success: true,
        errorMessage: null,
      });
      return { success: true };
    } else {
      console.error('카카오톡 메시지 전송 실패:', result);
      // 실패 로그 기록
      await KakaoMessageLog.create({
        senderId: userId,
        recipientId: userId,
        messageType: 'ATTENDANCE',
        messageContent,
        success: false,
        errorMessage: result.msg || '메시지 전송 실패',
      });
      return { success: false, error: result.msg || '메시지 전송 실패' };
    }
  } catch (error) {
    console.error('카카오톡 메시지 전송 오류:', error);
    return { success: false, error: error.message };
  }
}

/**
 * 학부모 메시지가 들어왔을 때 채널 주인에게 카카오톡 알림 전송 (나에게 보내기)
 *
 * 학부모가 기다리는 요청 안에서 호출되므로 카카오 API 가 늦어져도 채팅이 막히지 않도록
 * 타임아웃을 두고, 실패는 로그만 남기고 조용히 넘어간다.
 *
 * `isFollowUp` 은 이미 진행 중인 대화에 이어진 메시지라는 뜻 — 문구만 달라지고
 * 이력의 messageType 은 그대로 FAQ_INQUIRY 로 남긴다.
 */
export async function sendFaqInquiryKakaoMessage({
  userId,
  channelName,
  visitorName,
  question,
  isFollowUp = false,
}) {
  try {
    if (!(await isEventEnabled('FAQ_INQUIRY'))) return disabledResult('FAQ_INQUIRY');

    const accessToken = await getValidAccessToken(userId);

    if (!accessToken) {
      return {
        success: false,
        error: '유효한 카카오 토큰이 없거나 메시지 알림에 동의하지 않았습니다.',
        skipped: true,
      };
    }

    // 카카오 텍스트 템플릿은 200자 제한이 있어 질문이 길면 잘라서 보낸다.
    const preview = question.length > 100 ? `${question.slice(0, 100)}…` : question;
    const chatUrl = `${APP_URL}/faq/chats`;

    const templateObject = {
      object_type: 'text',
      text: `${isFollowUp ? '💬 새 메시지가 도착했습니다' : '💬 새 문의가 도착했습니다'}\n\n📮 ${channelName}\n🙋 ${visitorName}\n\n"${preview}"`,
      link: {
        web_url: chatUrl,
        mobile_web_url: chatUrl,
      },
      button_title: isFollowUp ? '답장하러 가기' : '문의 확인하기',
    };

    const response = await fetch('https://kapi.kakao.com/v2/api/talk/memo/default/send', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8',
      },
      body: new URLSearchParams({
        template_object: JSON.stringify(templateObject),
      }),
      signal: AbortSignal.timeout(KAKAO_SEND_TIMEOUT_MS),
    });

    const result = await response.json();
    const messageContent = templateObject.text;

    if (result.result_code === 0) {
      await KakaoMessageLog.create({
        senderId: userId,
        recipientId: userId,
        messageType: 'FAQ_INQUIRY',
        messageContent,
        success: true,
        errorMessage: null,
      });
      return { success: true };
    }

    console.error('FAQ 문의 카카오 알림 전송 실패:', result);
    await KakaoMessageLog.create({
      senderId: userId,
      recipientId: userId,
      messageType: 'FAQ_INQUIRY',
      messageContent,
      success: false,
      errorMessage: result.msg || '메시지 전송 실패',
    });
    return { success: false, error: result.msg || '메시지 전송 실패' };
  } catch (error) {
    console.error('FAQ 문의 카카오 알림 전송 오류:', error);
    return { success: false, error: error.message };
  }
}

/**
 * 학부모가 이벤트에 신청·변경·취소했을 때 선생님에게 알림 (나에게 보내기)
 *
 * FAQ 문의 알림과 같은 규칙: 학부모 요청 안에서 호출되므로 타임아웃을 두고,
 * 실패는 로그만 남긴다 (신청 자체는 이미 저장돼 있다).
 */
export async function sendEventRegistrationKakaoMessage({
  userId,
  eventTitle,
  eventDate,
  childName,
  optionLabels = [],
  action = 'registered',
  eventId,
}) {
  try {
    if (!(await isEventEnabled('EVENT_REGISTRATION'))) return disabledResult('EVENT_REGISTRATION');

    const accessToken = await getValidAccessToken(userId);

    if (!accessToken) {
      return {
        success: false,
        error: '유효한 카카오 토큰이 없거나 메시지 알림에 동의하지 않았습니다.',
        skipped: true,
      };
    }

    const heading = {
      registered: '🙋 새 신청이 들어왔습니다',
      updated: '✏️ 신청 옵션이 변경되었습니다',
      cancelled: '🚫 신청이 취소되었습니다',
      cancelled_after_confirm: '⚠️ 확정된 신청이 취소되었습니다',
    }[action] || '🙋 신청 소식이 있습니다';

    const options = optionLabels.length > 0 ? `\n🏷️ ${optionLabels.join(', ')}` : '';
    const link = `${APP_URL}/events`;

    const templateObject = {
      object_type: 'text',
      text: `${heading}\n\n📅 ${eventTitle}${eventDate ? ` (${eventDate})` : ''}\n👧 ${childName}${options}`,
      link: {
        web_url: link,
        mobile_web_url: link,
      },
      button_title: '신청 현황 보기',
    };

    const response = await fetch('https://kapi.kakao.com/v2/api/talk/memo/default/send', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8',
      },
      body: new URLSearchParams({
        template_object: JSON.stringify(templateObject),
      }),
      signal: AbortSignal.timeout(KAKAO_SEND_TIMEOUT_MS),
    });

    const result = await response.json();
    const messageContent = templateObject.text;

    if (result.result_code === 0) {
      await KakaoMessageLog.create({
        senderId: userId,
        recipientId: userId,
        messageType: 'EVENT_REGISTRATION',
        messageContent,
        success: true,
        errorMessage: null,
      });
      return { success: true };
    }

    console.error('이벤트 신청 카카오 알림 전송 실패:', result);
    await KakaoMessageLog.create({
      senderId: userId,
      recipientId: userId,
      messageType: 'EVENT_REGISTRATION',
      messageContent,
      success: false,
      errorMessage: result.msg || '메시지 전송 실패',
    });
    return { success: false, error: result.msg || '메시지 전송 실패' };
  } catch (error) {
    console.error('이벤트 신청 카카오 알림 전송 오류:', error);
    return { success: false, error: error.message };
  }
}

/**
 * 관리자가 특정 사용자에게 커스텀 메시지 전송
 */
export async function sendCustomKakaoMessage({
  senderId,
  recipientId,
  message,
}) {
  try {
    if (!(await isEventEnabled('CUSTOM'))) return disabledResult('CUSTOM');

    // 수신자의 토큰으로 메시지 전송 (나에게 보내기 API 사용)
    const accessToken = await getValidAccessToken(recipientId, false);

    if (!accessToken) {
      return {
        success: false,
        error: '수신자의 카카오 토큰이 없습니다. 수신자가 카카오로 다시 로그인해야 합니다.',
      };
    }

    const templateObject = {
      object_type: 'text',
      text: message,
      link: {
        web_url: APP_URL,
        mobile_web_url: APP_URL,
      },
      button_title: '출석 관리 열기',
    };

    const response = await fetch('https://kapi.kakao.com/v2/api/talk/memo/default/send', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8',
      },
      body: new URLSearchParams({
        template_object: JSON.stringify(templateObject),
      }),
    });

    const result = await response.json();

    if (result.result_code === 0) {
      console.log('카카오톡 커스텀 메시지 전송 성공');
      // 로그 기록
      await KakaoMessageLog.create({
        senderId,
        recipientId,
        messageType: 'CUSTOM',
        messageContent: message,
        success: true,
        errorMessage: null,
      });
      return { success: true };
    } else {
      console.error('카카오톡 커스텀 메시지 전송 실패:', result);
      // 실패 로그 기록
      await KakaoMessageLog.create({
        senderId,
        recipientId,
        messageType: 'CUSTOM',
        messageContent: message,
        success: false,
        errorMessage: result.msg || '메시지 전송 실패',
      });
      return { success: false, error: result.msg || '메시지 전송 실패' };
    }
  } catch (error) {
    console.error('카카오톡 커스텀 메시지 전송 오류:', error);
    return { success: false, error: error.message };
  }
}

export default {
  sendAttendanceKakaoMessage,
  sendFaqInquiryKakaoMessage,
  sendEventRegistrationKakaoMessage,
  sendCustomKakaoMessage,
};
