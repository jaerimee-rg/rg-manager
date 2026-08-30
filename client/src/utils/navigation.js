/**
 * 전체 새로고침 이동. 세션을 통째로 갈아 끼울 때(다른 계정으로 로그인, 관리자로 돌아가기)
 * SPA 이동 대신 쓴다 — 이전 계정으로 읽어 둔 화면 상태가 하나도 남지 않게 한다.
 * 테스트에서 jsdom 은 이동을 못 하므로 이 모듈을 통째로 가짜로 바꾼다.
 */
export const hardNavigate = (path) => {
  window.location.assign(path);
};

export default { hardNavigate };
