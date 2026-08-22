/**
 * 안전한 JSON.parse - 파싱 실패 시 기본값 반환
 */
export const safeJsonParse = (str, defaultValue = []) => {
  if (!str) return defaultValue;

  // JSON.parse 는 숫자·불리언을 그대로 돌려주므로, 문자열이 아닌 값이 들어오면
  // 배열을 기대하는 호출부(classIds, events, matchedFaqIds)가 깨진다.
  if (typeof str !== 'string') {
    console.error('JSON 파싱 오류:', '문자열이 아닙니다.', '원본:', str);
    return defaultValue;
  }

  try {
    return JSON.parse(str);
  } catch (e) {
    // 어떤 값이 깨졌는지 알아야 DB 행을 찾아 고칠 수 있다.
    console.error('JSON 파싱 오류:', e.message, '원본:', str);
    return defaultValue;
  }
};
