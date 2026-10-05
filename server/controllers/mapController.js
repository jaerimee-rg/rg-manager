/**
 * 지도 설정 — 브라우저가 카카오 지도 SDK 를 불러올 때 쓰는 JavaScript 키를 내려준다.
 *
 * JavaScript 키는 원래 브라우저에 노출되는 키다(카카오 콘솔에 등록한 도메인에서만 동작).
 * 빌드 시점이 아니라 여기서 읽기 때문에 Vercel 환경변수만 바꾸고 재배포하면 된다.
 * 키가 없으면 null — 화면은 지도만 빼고 주소·"카카오맵에서 보기" 링크로 대신한다.
 * REST API 키(KAKAO_CLIENT_ID)는 지도 SDK 에 쓸 수 없으므로 대신 내려주지 않는다.
 */
export const getMapConfig = (req, res) => {
  const kakaoJsKey = String(process.env.KAKAO_JS_KEY ?? '').trim() || null;
  res.json({ kakaoJsKey });
};

export default { getMapConfig };
