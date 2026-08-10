// 로그인 세션을 localStorage(자동 로그인 유지)와 sessionStorage(탭 닫으면 로그아웃)
// 중 어디에 저장할지 "자동 로그인" 체크박스 값에 따라 전환하는 스토리지 어댑터.
const REMEMBER_KEY = "auth-remember-me";

export function getRememberMe(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(REMEMBER_KEY) === "1";
}

export function setRememberMe(remember: boolean) {
  if (typeof window === "undefined") return;
  if (remember) window.localStorage.setItem(REMEMBER_KEY, "1");
  else window.localStorage.removeItem(REMEMBER_KEY);
}

function activeStorage(): Storage {
  return getRememberMe() ? window.localStorage : window.sessionStorage;
}

// Supabase 세션 키(sb-<ref>-auth-token)는 activeStorage()에서 읽고 쓰되,
// 다른 저장소에 이전 세션이 남아있으면 함께 정리해 혼선을 막는다.
export const authStorage = {
  getItem(key: string) {
    return activeStorage().getItem(key);
  },
  setItem(key: string, value: string) {
    activeStorage().setItem(key, value);
    const other = activeStorage() === window.localStorage ? window.sessionStorage : window.localStorage;
    other.removeItem(key);
  },
  removeItem(key: string) {
    window.localStorage.removeItem(key);
    window.sessionStorage.removeItem(key);
  },
};
