import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";

import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { loginWithUsername } from "@/lib/auth-login.functions";




export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "직원 로그인 | 허그앤멍 예약관리시스템" },
      { name: "description", content: "반려견 유치원 직원 계정으로 로그인해 예약, 등하원, 이용권을 관리하세요." },
      { property: "og:title", content: "직원 로그인 | 허그앤멍 예약관리시스템" },
      { property: "og:description", content: "반려견 유치원 예약·등하원·이용권 관리 시스템 직원 로그인" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const login = useServerFn(loginWithUsername);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/dashboard", replace: true });
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (session && (event === "SIGNED_IN" || event === "INITIAL_SESSION")) {
        navigate({ to: "/dashboard", replace: true });
      }
    });
    return () => sub.subscription.unsubscribe();
  }, [navigate]);

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const { accessToken, refreshToken } = await login({ data: { username, password } });
      const { error } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });
      if (error) throw new Error(error.message);
      navigate({ to: "/dashboard", replace: true });
    } catch (err) {
      toast.error("로그인에 실패했습니다", {
        description: err instanceof Error ? err.message : "아이디 또는 비밀번호를 확인해 주세요.",
      });
    } finally {
      setLoading(false);
    }
  }



  return (
    <div className="paw-grid flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-extrabold">허그앤멍 예약관리시스템</h1>
          <p className="mt-1 text-sm text-muted-foreground">원장·직원 전용 관리 시스템입니다.</p>
        </div>

        <div className="surface-card p-6">
          <form className="space-y-4" onSubmit={signIn}>
            <div className="space-y-2">
              <Label htmlFor="email">이메일</Label>
              <Input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="staff@example.com"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">비밀번호</Label>
              <Input
                id="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              로그인
            </Button>
          </form>

        
        </div>
      </div>
    </div>
  );
}
