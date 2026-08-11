import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";

import { CalendarDays, Dog, Eye, EyeOff, Ticket } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getRememberMe, setRememberMe } from "@/integrations/supabase/auth-storage";
import { supabase } from "@/integrations/supabase/client";
import { loginWithUsername } from "@/lib/auth-login.functions";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "허그앤멍 예약관리시스템 | 반려견 유치원 운영" },
      {
        name: "description",
        content:
          "예약 캘린더, 등하원 체크인, 강아지 프로필, 이용권·결제까지 한 곳에서 관리하는 반려견 유치원 관리 시스템.",
      },
      { property: "og:title", content: "허그앤멍 예약관리시스템 | 반려견 유치원 운영" },
      {
        property: "og:description",
        content: "예약 캘린더, 등하원 체크인, 강아지 프로필, 이용권·결제 관리를 한 곳에서.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Landing,
});

const FEATURES = [
  {
    icon: CalendarDays,
    title: "예약 캘린더 · 일별 현황",
    body: "월간 캘린더에서 날짜별 예약을 확인하고, 오늘 등원·하원 현황을 실시간으로 체크합니다.",
  },
  {
    icon: Dog,
    title: "강아지 · 보호자 프로필",
    body: "견종, 나이, 몸무게, 특이사항과 보호자 연락처를 한 카드에서 관리합니다.",
  },
  {
    icon: Ticket,
    title: "이용권 · 결제 관리",
    body: "횟수권 잔여 횟수를 자동 차감하고 미결제 건과 결제 합계를 바로 확인합니다.",
  },
];

function Landing() {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [rememberMe, setRememberMeState] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [mobileError, setMobileError] = useState<string | null>(null);
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
    setMobileError(null);
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
      setMobileError("이메일 또는 비밀번호가 올바르지 않습니다.");
      toast.error("로그인에 실패했습니다", {
        description: "아이디 또는 비밀번호를 확인해 주세요.",
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="paw-grid min-h-screen">
      {/* 모바일: 피그마 로그인 화면 시안 반영 */}
      <div className="flex min-h-dvh flex-col bg-[#F2F5F7] px-7 py-6 sm:hidden">
        <div className="flex flex-1 flex-col items-center justify-center">
          <div className="w-full max-w-md">
            <div className="flex flex-col items-center gap-2 pb-6 pt-6 text-center">
              <div className="flex items-center gap-0.5">
                <span className="text-[28px] font-semibold leading-[34px] text-[#037FED]">
                  허그앤멍
                </span>
                <span className="text-2xl font-semibold leading-7 text-black">예약관리시스템</span>
              </div>
              <p className="text-base font-medium leading-6 text-[#9EA2AE]">
                원장 및 직원 전용 관리시스템입니다.
              </p>
            </div>

            <form
              className="flex flex-col rounded-xl border border-[#DDDDDD] bg-white px-5 py-7"
              onSubmit={signIn}
            >
              <div className="flex flex-col gap-3">
                <div
                  className={`flex items-center gap-3 rounded-xl border bg-white px-3 py-3 transition-colors focus-within:border-[#037FED] focus-within:ring-[3px] focus-within:ring-[#037FED]/15 ${
                    mobileError ? "border-[#E0392C]" : "border-[#CCCCCC]"
                  }`}
                >
                  <input
                    id="username-m"
                    autoComplete="username"
                    required
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="이메일"
                    className="w-full min-w-0 flex-1 border-none bg-transparent text-base leading-6 text-black outline-none placeholder:text-[#9EA2AE]"
                  />
                </div>

                <div
                  className={`flex items-center gap-3 rounded-xl border bg-white px-3 py-3 transition-colors focus-within:border-[#037FED] focus-within:ring-[3px] focus-within:ring-[#037FED]/15 ${
                    mobileError ? "border-[#E0392C]" : "border-[#CCCCCC]"
                  }`}
                >
                  <input
                    id="password-m"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="비밀번호"
                    className="w-full min-w-0 flex-1 border-none bg-transparent text-base leading-6 text-black outline-none placeholder:text-[#9EA2AE]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="grid place-items-center text-[#9EA2AE]"
                    aria-label={showPassword ? "비밀번호 숨기기" : "비밀번호 표시"}
                  >
                    {showPassword ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
                  </button>
                </div>
              </div>

              {mobileError ? (
                <span className="px-1 pt-1 text-xs leading-[1.4em] text-[#E0392C]">
                  {mobileError}
                </span>
              ) : null}

              <label className="flex cursor-pointer select-none items-center gap-2 py-3">
                <Checkbox
                  checked={rememberMe}
                  onCheckedChange={(v) => setRememberMeState(v === true)}
                  className="size-6 rounded-lg border-2 border-[#037FED] shadow-none data-[state=checked]:border-[#037FED] data-[state=checked]:bg-[#037FED] data-[state=checked]:text-white"
                />
                <span className="text-sm font-medium leading-5 text-[#4D5461]">자동로그인</span>
              </label>

              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-xl bg-[#037FED] py-4 text-lg font-semibold leading-6 text-white transition-colors hover:bg-[#0270CE] active:opacity-90 disabled:opacity-60"
              >
                {loading ? "로그인 중…" : "로그인"}
              </button>
            </form>
          </div>
        </div>

        <div className="flex items-center justify-center py-4">
          <span className="text-sm font-medium leading-5 text-[#6D717F]">Ver.1.0.0</span>
        </div>
      </div>

      {/* 데스크톱: 헤더 + 히어로 + 로그인 폼 + 기능 소개 카드 */}
      <header className="mx-auto hidden h-16 max-w-6xl items-center px-4 sm:flex">
        <span className="font-display text-lg font-extrabold tracking-tight">
          허그앤멍 예약관리시스템
        </span>
      </header>

      <section className="mx-auto hidden max-w-6xl items-center gap-10 px-4 py-16 sm:grid lg:grid-cols-[1.1fr_0.9fr]">
        <div>
          <span className="inline-block rounded-full bg-accent/25 px-3 py-1 text-xs font-semibold text-accent-foreground">
            원장·직원 전용 관리 시스템
          </span>
          <h1 className="mt-5 text-4xl font-extrabold leading-tight sm:text-5xl">
            반려견 유치원의 하루를
            <br />한 화면에서 관리하세요
          </h1>
          <p className="mt-5 max-w-xl text-muted-foreground">
            예약 등록부터 등하원 체크인, 원생 프로필, 이용권 잔여 횟수와 결제까지 — 수첩과 단체
            채팅방 대신 하나의 시스템으로 정리합니다.
          </p>
        </div>

        <div className="surface-card w-full p-6">
          <h2 className="text-lg font-bold">직원 로그인</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            등록된 직원 계정으로 로그인해 주세요.
          </p>

          <form className="mt-5 space-y-4" onSubmit={signIn}>
            {renderLoginFields("d")}
          </form>
        </div>
      </section>

      <section className="mx-auto hidden max-w-6xl gap-4 px-4 pb-24 sm:grid md:grid-cols-3">
        {FEATURES.map((f) => (
          <article key={f.title} className="surface-card p-6">
            <div className="mb-4 flex size-11 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <f.icon className="size-5" />
            </div>
            <h2 className="text-lg font-bold">{f.title}</h2>
            <p className="mt-2 text-sm text-muted-foreground">{f.body}</p>
          </article>
        ))}
      </section>
    </div>
  );

  function renderLoginFields(idPrefix: string) {
    return (
      <>
        <div className="space-y-2">
          <Label htmlFor={`username-${idPrefix}`}>아이디</Label>
          <Input
            id={`username-${idPrefix}`}
            autoComplete="username"
            required
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="아이디를 입력하세요"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor={`password-${idPrefix}`}>비밀번호</Label>
          <Input
            id={`password-${idPrefix}`}
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        <div className="flex items-center gap-2">
          <Checkbox
            id={`remember-me-${idPrefix}`}
            checked={rememberMe}
            onCheckedChange={(v) => setRememberMeState(v === true)}
          />
          <Label
            htmlFor={`remember-me-${idPrefix}`}
            className="cursor-pointer text-sm font-normal text-muted-foreground"
          >
            자동 로그인
          </Label>
        </div>

        <Button type="submit" className="w-full" disabled={loading}>
          로그인
        </Button>
      </>
    );
  }
}
