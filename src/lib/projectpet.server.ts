const BASE_URL = "https://noleowebdev.projectpet.kr:3100/api/v1";

type TokenCache = { token: string; expiresAt: number };
let cache: TokenCache | null = null;

async function login(): Promise<string> {
  const username = process.env["PROJECTPET_API_USERNAME"];
  const password = process.env["PROJECTPET_API_PASSWORD"];
  if (!username || !password) {
    throw new Error("외부 API 계정 정보가 설정되지 않았습니다.");
  }

  const res = await fetch(`${BASE_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });

  if (!res.ok) {
    const body = await res.text();
    console.error(`ProjectPet login failed [${res.status}]: ${body}`);
    throw new Error(`외부 API 로그인 실패 [${res.status}]`);
  }

  const data = (await res.json()) as { access_token?: string };
  if (!data.access_token) throw new Error("외부 API가 토큰을 반환하지 않았습니다.");

  let expiresAt = Date.now() + 10 * 60 * 1000;
  try {
    const payload = JSON.parse(atob(data.access_token.split(".")[1] ?? "")) as { exp?: number };
    if (payload.exp) expiresAt = payload.exp * 1000;
  } catch {
    // keep default TTL
  }
  cache = { token: data.access_token, expiresAt };
  return data.access_token;
}

async function getToken(force = false): Promise<string> {
  if (!force && cache && Date.now() < cache.expiresAt - 30_000) return cache.token;
  return login();
}

export async function apiGet<T>(path: string, params?: Record<string, string | number | undefined>): Promise<T> {
  const url = new URL(`${BASE_URL}${path}`);
  for (const [k, v] of Object.entries(params ?? {})) {
    if (v !== undefined && v !== "") url.searchParams.set(k, String(v));
  }

  const call = async (token: string) =>
    fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } });

  let res = await call(await getToken());
  if (res.status === 401) res = await call(await getToken(true));

  if (!res.ok) {
    const body = await res.text();
    console.error(`ProjectPet GET ${path} failed [${res.status}]: ${body}`);
    throw new Error(`외부 API 요청 실패 [${res.status}]`);
  }
  return (await res.json()) as T;
}

export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const call = async (token: string) =>
    fetch(`${BASE_URL}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

  let res = await call(await getToken());
  if (res.status === 401) res = await call(await getToken(true));

  if (!res.ok) {
    const text = await res.text();
    console.error(`ProjectPet POST ${path} failed [${res.status}]: ${text}`);
    let message = `외부 API 요청 실패 [${res.status}]`;
    try {
      const parsed = JSON.parse(text) as { message?: string | string[] };
      if (parsed.message) message = Array.isArray(parsed.message) ? parsed.message.join(", ") : parsed.message;
    } catch {
      // keep default message
    }
    throw new Error(message);
  }
  return (await res.json()) as T;
}
