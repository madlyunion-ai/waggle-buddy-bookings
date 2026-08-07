import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { CalendarDays, Dog, PawPrint, Ticket } from "lucide-react";

import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "멍멍유치원 예약관리 | 반려견 유치원 운영 시스템" },
      {
        name: "description",
        content: "예약 캘린더, 등하원 체크인, 강아지 프로필, 이용권·결제까지 한 곳에서 관리하는 반려견 유치원 관리 시스템.",
      },
      { property: "og:title", content: "멍멍유치원 예약관리 | 반려견 유치원 운영 시스템" },
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
    body: "월간 캘린더에서 날짜별 예약 수를 확인하고, 오늘 등원·하원 현황을 실시간으로 체크합니다.",
  },
  {
    icon: Dog,
    title: "강아지 · 보호자 프로필",
    body: "견종, 나이, 몸무게, 백신 만료일, 특이사항과 보호자 연락처를 한 카드에서 관리합니다.",
  },
  {
    icon: Ticket,
    title: "이용권 · 결제 관리",
    body: "횟수권 잔여 횟수를 자동 차감하고 미결제 건과 결제 합계를 바로 확인합니다.",
  },
];

function Landing() {
  const navigate = useNavigate();

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/dashboard", replace: true });
    });
  }, [navigate]);

  return (
    <div className="paw-grid min-h-screen">
      <header className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
        <span className="flex items-center gap-2 font-display text-lg font-extrabold">
          <PawPrint className="size-6 text-primary" /> 멍멍유치원
        </span>
        <Button asChild variant="outline" size="sm">
          <Link to="/auth">직원 로그인</Link>
        </Button>
      </header>

      <section className="mx-auto max-w-3xl px-4 py-20 text-center">
        <span className="inline-block rounded-full bg-accent/25 px-3 py-1 text-xs font-semibold text-accent-foreground">
          원장·직원 전용 관리 시스템
        </span>
        <h1 className="mt-5 text-4xl font-extrabold leading-tight sm:text-5xl">
          반려견 유치원의 하루를
          <br />
          한 화면에서 관리하세요
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-muted-foreground">
          예약 등록부터 등하원 체크인, 원생 프로필, 이용권 잔여 횟수와 결제까지 — 수첩과 단체 채팅방 대신 하나의 시스템으로
          정리합니다.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Button asChild size="lg">
            <Link to="/auth">시작하기</Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link to="/auth">직원 계정 만들기</Link>
          </Button>
        </div>
      </section>

      <section className="mx-auto grid max-w-6xl gap-4 px-4 pb-24 md:grid-cols-3">
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
}
