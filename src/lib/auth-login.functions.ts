import { createServerFn } from "@tanstack/react-start";

export type LoginResult = { accessToken: string; refreshToken: string };

/** 아이디(또는 이메일) + 비밀번호로 로그인하고 세션 토큰을 반환 */
export const loginWithUsername = createServerFn({ method: "POST" })
  .inputValidator((input: { username: string; password: string }) => {
    const username = String(input?.username ?? "").trim().slice(0, 200);
    const password = String(input?.password ?? "");
    if (!username) throw new Error("아이디를 입력해 주세요.");
    if (!password) throw new Error("비밀번호를 입력해 주세요.");
    return { username, password };
  })
  .handler(async ({ data }): Promise<LoginResult> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let email = data.username.includes("@") ? data.username : "";
    if (!email) {
      const { data: rows } = await supabaseAdmin
        .from("staff")
        .select("email, username")
        .ilike("username", data.username)
        .limit(1);
      email = rows?.[0]?.email ?? "";
    }
    if (!email) throw new Error("아이디 또는 비밀번호가 올바르지 않습니다.");

    const { createClient } = await import("@supabase/supabase-js");
    const client = createClient(
      process.env["SUPABASE_URL"]!,
      process.env["SUPABASE_PUBLISHABLE_KEY"] ?? process.env["SUPABASE_ANON_KEY"]!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );

    const { data: signIn, error } = await client.auth.signInWithPassword({
      email,
      password: data.password,
    });
    if (error || !signIn.session) throw new Error("아이디 또는 비밀번호가 올바르지 않습니다.");

    return {
      accessToken: signIn.session.access_token,
      refreshToken: signIn.session.refresh_token,
    };
  });
