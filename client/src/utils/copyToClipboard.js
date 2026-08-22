/**
 * 클립보드 복사 (모바일 사파리·비HTTPS 환경 폴백 포함)
 * @returns {Promise<boolean>} 성공 여부
 */
export const copyToClipboard = async (text) => {
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (e) {
      // 권한 거부 등 → 아래 폴백 사용
    }
  }

  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.top = '0';
  textarea.style.opacity = '0';

  try {
    document.body.appendChild(textarea);
    textarea.select();
    textarea.setSelectionRange(0, textarea.value.length);
    return document.execCommand('copy');
  } catch (e) {
    return false;
  } finally {
    // 복사 실패·예외 상황에서도 임시 요소를 남기지 않는다
    if (textarea.parentNode) textarea.parentNode.removeChild(textarea);
  }
};

export default copyToClipboard;
