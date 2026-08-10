import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getRememberMe, setRememberMe } from "@/integrations/supabase/auth-storage";
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
  const [errorOpen, setErrorOpen] = useState(false);
  const [rememberMe, setRememberMeState] = useState(false);
  const login = useServerFn(loginWithUsername);

  useEffect(() => {
    setRememberMeState(getRememberMe());
  }, []);

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
      setRememberMe(rememberMe);
      const { error } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });
      if (error) throw new Error(error.message);
      navigate({ to: "/dashboard", replace: true });
    } catch {
      setErrorOpen(true);
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
              <Label htmlFor="username">아이디</Label>
              <Input
                id="username"
                autoComplete="username"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="아이디를 입력하세요"
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

            <div className="flex items-center gap-2">
              <Checkbox
                id="remember-me"
                checked={rememberMe}
                onCheckedChange={(v) => setRememberMeState(v === true)}
              />
              <Label htmlFor="remember-me" className="cursor-pointer text-sm font-normal text-muted-foreground">
                자동 로그인
              </Label>
            </div>

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  로그인 중…
                </>
              ) : (
                "로그인"
              )}
            </Button>
          </form>


        </div>
      </div>

      <AlertDialog open={errorOpen} onOpenChange={setErrorOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-center">로그인 실패</AlertDialogTitle>
            <AlertDialogDescription className="text-center">
              아이디 또는 비밀번호를 확인해주세요.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="sm:justify-center">
            <AlertDialogAction onClick={() => setErrorOpen(false)}>확인</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
