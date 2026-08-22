import crypto from 'crypto';

/**
 * 추측 불가능한 공개 채팅 링크 토큰 생성 (128비트, URL-safe 22자)
 */
export const generatePublicId = () => crypto.randomBytes(16).toString('base64url');
