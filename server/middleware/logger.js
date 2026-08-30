import pool from '../database.js';

// 로그 기록 미들웨어
export const logAction = (action, target = null) => {
  return async (req, res, next) => {
    // 원본 응답 메서드 저장
    const originalJson = res.json;
    const originalSend = res.send;
    let logged = false; // 중복 방지 플래그

    // 응답 성공 시 로그 기록
    res.json = function(data) {
      if (res.statusCode >= 200 && res.statusCode < 300 && !logged) {
        logged = true;
        saveLog(req, action, target, data);
      }
      return originalJson.call(this, data);
    };

    res.send = function(data) {
      if (res.statusCode >= 200 && res.statusCode < 300 && !logged) {
        logged = true;
        saveLog(req, action, target, data);
      }
      return originalSend.call(this, data);
    };

    next();
  };
};

// 로그 저장 함수
const saveLog = async (req, action, target, responseData) => {
  try {
    // LOGIN/SIGNUP의 경우 req.body.username 사용, 그 외에는 req.user.username 사용
    let username = req.user?.username;
    if (!username && (action === 'LOGIN' || action === 'SIGNUP')) {
      username = req.body?.username || 'unknown';
    }
    username = username || 'unknown';

    let details = null;

    // 액션별 상세 정보 생성
    if (action === 'CREATE_STUDENT' && responseData) {
      details = `이름: ${responseData.name}`;
    } else if (action === 'UPDATE_STUDENT' && req.body) {
      details = `이름: ${req.body.name}`;
    } else if (action === 'DELETE_STUDENT' && target) {
      details = `ID: ${target}`;
    } else if (action === 'CREATE_CLASS' && responseData) {
      details = `수업명: ${responseData.name}`;
    } else if (action === 'UPDATE_CLASS' && req.body) {
      details = `수업명: ${req.body.name}`;
    } else if (action === 'DELETE_CLASS' && target) {
      details = `ID: ${target}`;
    } else if (action === 'CREATE_ATTENDANCE' && req.body) {
      details = `날짜: ${req.body.date}`;
    } else if (action === 'DELETE_ATTENDANCE' && target) {
      details = `ID: ${target}`;
    } else if (action === 'LOGIN') {
      details = `로그인 성공`;
    } else if (action === 'KAKAO_LOGIN' && responseData) {
      // 어느 역할로 들어왔는지 남긴다 (한 카카오 계정이 여러 역할을 가질 수 있다)
      const label = { admin: '관리자', user: '선생님', parent: '학부모' }[responseData.role] || responseData.role;
      details = `역할: ${label}${responseData.isNewUser ? ' (가입)' : ''}`;
    } else if (action === 'SWITCH_ROLE' && responseData) {
      const label = (r) => ({ admin: '관리자', user: '선생님', parent: '학부모' }[r] || r);
      details = `${label(req.user?.role)} → ${label(responseData.role)}`;
    } else if (action === 'ADD_ROLE' && responseData) {
      const label = (r) => ({ admin: '관리자', user: '선생님', parent: '학부모' }[r] || r);
      details = responseData.linkedOnly
        ? `${label(req.user?.role)} → 선생님 연결 추가`
        : `${label(req.user?.role)} → ${label(responseData.role)} 계정 생성`;
    } else if (action === 'GRANT_ADMIN' && responseData?.user) {
      details = `관리자 계정 ${responseData.user.username}`;
    } else if (action === 'CREATE_TEACHER_INVITE' && responseData) {
      details = `메모: ${responseData.label || '(없음)'}${responseData.expiresAt ? ` · 만료: ${responseData.expiresAt.slice(0, 10)}` : ' · 만료 없음'}`;
    } else if (action === 'REVOKE_TEACHER_INVITE' && req.params) {
      details = `초대 ID: ${req.params.id}`;
    } else if (action === 'ADD_PARENT_TEACHER' && responseData) {
      details = `선생님 연결 추가`;
    } else if (action === 'REMOVE_PARENT_TEACHER' && req.params) {
      details = `학부모 ${req.params.userId} ↔ 선생님 ${req.params.teacherId} 연결 해제`;
    } else if (action === 'SIGNUP' && req.body) {
      details = `사용자명: ${req.body.username}`;
    } else if (action === 'CREATE_COMPETITION' && responseData) {
      details = `대회명: ${responseData.name}`;
    } else if (action === 'UPDATE_COMPETITION' && req.body) {
      details = `대회명: ${req.body.name}`;
    } else if (action === 'DELETE_COMPETITION' && target) {
      details = `ID: ${target}`;
    } else if (action === 'CREATE_ALBUM' && responseData) {
      details = `앨범 폴더: ${responseData.driveFolderName}`;
    } else if (action === 'UPDATE_ALBUM' && req.body) {
      details = req.body.folderName
        ? `앨범 이름: ${req.body.folderName}`
        : `업로드 받기: ${req.body.albumUploadOpen ? '켬' : '끔'}`;
    } else if (action === 'UPLOAD_ALBUM_MEDIA' && responseData?.media) {
      details = `사진: ${responseData.media.fileName}`;
    } else if (action === 'UPDATE_ALBUM_MEDIA' && req.body) {
      details = `${req.body.action} · ${(req.body.mediaIds || []).length}건`;
    } else if (action === 'DELETE_ALBUM_MEDIA' && req.params) {
      details = `사진 ID: ${req.params.mediaId}`;
    } else if ((action === 'TAG_ALBUM_MEDIA' || action === 'UNTAG_ALBUM_MEDIA') && req.params) {
      details = `사진 ID: ${req.params.mediaId}`;
    } else if (action === 'DISCONNECT_DRIVE') {
      details = 'Google Drive 연결 해제';
    } else if (action === 'CREATE_FAQ' && responseData) {
      details = `질문: ${responseData.question}`;
    } else if (action === 'UPDATE_FAQ' && req.body) {
      details = `질문: ${req.body.question}`;
    } else if (action === 'DELETE_FAQ' && target) {
      details = `ID: ${target}`;
    } else if (action === 'UPDATE_CHAT_CHANNEL' && req.body) {
      details = `채널명: ${req.body.name}`;
    } else if (action === 'REPLY_CHAT_SESSION' && req.params) {
      details = `세션 ID: ${req.params.id}`;
    } else if (action === 'DELETE_CHAT_SESSION' && req.params) {
      details = `세션 ID: ${req.params.id}`;
    } else if (action === 'UPLOAD_FAQ_FILE' && responseData) {
      details = `파일: ${responseData.filename}`;
    } else if (action === 'DELETE_FAQ_FILE' && req.params) {
      details = `파일 ID: ${req.params.id}`;
    } else if (action === 'UPDATE_AI_PROVIDER' && req.body) {
      details = `AI 제공자: ${req.body.provider}` +
        (req.body.model ? ` / ${req.body.model}` : '') +
        (req.body.effort ? ` / ${req.body.effort}` : '');
    } else if (action === 'ADD_COMPETITION_STUDENT' && req.body) {
      details = `학생 ID: ${req.body.studentId}`;
    } else if (action === 'REMOVE_COMPETITION_STUDENT' && req.params) {
      details = `학생 ID: ${req.params.studentId}`;
    }

    await pool.query(
      `INSERT INTO logs (username, action, target, details, "createdAt")
       VALUES ($1, $2, $3, $4, $5)`,
      [username, action, target, details, new Date().toISOString()]
    );
  } catch (error) {
    console.error('로그 저장 실패:', error);
    // 로그 저장 실패가 응답에 영향을 주지 않도록 에러를 무시
  }
};
