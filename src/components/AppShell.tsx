import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  CalendarCheck,
  CalendarDays,
  Dog,
  Home,
  LogOut,
  MapPin,
  Settings,
  SlidersHorizontal,
  Ticket,
  Users,
} from "lucide-react";
import { useState } from "react";

import { HeaderDogSearch } from "@/components/HeaderDogSearch";
import { NewReservationDialog } from "@/components/NewReservationDialog";
import { StaffEditDialog, type EditableStaffRow } from "@/components/StaffEditDialog";
import { toDateKey } from "@/lib/kindergarten";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { getCurrentStaffProfile } from "@/lib/staff.functions";

const BRANCH_MAP_URL = "https://naver.me/Fz8h7uu5";

const NAV_GROUPS = [
  {
    label: "운영 현황",
    items: [{ to: "/dashboard", label: "오늘 현황", icon: CalendarDays }],
  },

  {
    label: "원생 관리",
    items: [
      { to: "/dogs", label: "반려견 리스트", icon: Dog },
      { to: "/reservations", label: "예약 정보", icon: CalendarCheck },
    ],
  },
  {
    label: "이용권 · 정산",
    items: [
      { to: "/passes-usage", label: "이용권 사용현황", icon: Ticket },
      { to: "/passes", label: "이용권 설정", icon: Ticket },
    ],
  },
  {
    label: "운영 관리",
    items: [
      { to: "/staff", label: "직원 관리", icon: Users },
      { to: "/reservation-settings", label: "예약 설정", icon: SlidersHorizontal },
    ],
  },
] as const;

/** 모바일 하단 탭바(홈 바) 메뉴 - 가운데 항목이 캘린더(Home) 강조 버튼 */
const BOTTOM_NAV = [
  { to: "/dogs", label: "반려견", icon: Dog, match: (p: string) => p === "/dogs" },
  {
    to: "/dashboard",
    label: "Home",
    icon: Home,
    match: (p: string) => p === "/dashboard",
    center: true,
  },
  {
    to: "/passes-usage",
    label: "이용권",
    icon: Ticket,
    match: (p: string) => p === "/passes-usage" || p === "/passes",
  },
] as const;

export function AppShell({
  title,
  description,
  action,
  sidebarAction,
  hideTitleOnMobile,
  mobileSubTabs,
  children,
}: {
  title?: string;
  description?: ReactNode;
  action?: ReactNode;
  sidebarAction?: ReactNode;
  /** 모바일 해상도에서 페이지 타이틀(h1)을 숨김 */
  hideTitleOnMobile?: boolean;
  /** 모바일 상단에 표시할 서브 메뉴(탭) 영역. 페이지별로 구성해 전달 */
  mobileSubTabs?: ReactNode;
  children: ReactNode;
}) {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const queryClient = useQueryClient();
  const fetchProfile = useServerFn(getCurrentStaffProfile);
  const profile = useQuery({
    queryKey: ["current-staff-profile"],
    queryFn: () => fetchProfile(),
    staleTime: 5 * 60 * 1000,
  });
  const displayName = profile.data?.name ?? "사용자";
  const initial = displayName.slice(0, 1);
  const [editingSelf, setEditingSelf] = useState(false);

  const selfRow: EditableStaffRow | null = profile.data
    ? {
        id: `local-${profile.data.id}`,
        rawId: profile.data.id,
        name: profile.data.name,
        username: profile.data.username,
        email: profile.data.email,
        phone: profile.data.phone,
        role: profile.data.role,
        status: profile.data.status,
      }
    : null;

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/", replace: true });
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 border-b border-[#cccccc] bg-[#17214c] text-white">
        <div className="hidden h-[52px] items-center gap-3 px-4 lg:flex lg:px-6">
          <Link to="/dashboard" className="flex shrink-0 items-baseline gap-2">
            <span className="font-display text-[17px] font-semibold tracking-tight text-white">
              허그앤멍 예약관리시스템
            </span>
            <span className="hidden text-[11px] font-normal text-white/70 sm:inline">
              허그앤멍 프리미엄 토탈 애견 유치원 서비스
            </span>
          </Link>

          <div className="ml-6 hidden sm:block">
            <HeaderDogSearch />
          </div>

          <div className="ml-auto flex shrink-0 items-center gap-2">
            <a
              href={BRANCH_MAP_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="hidden items-center gap-1 rounded-md bg-white px-2.5 py-1 text-[11px] font-medium text-[#17214c] transition-colors hover:bg-white/90 md:inline-flex"
            >
              <MapPin className="size-3 text-[#17214c]" />
              허그앤멍 왕십리지점
            </a>
            <Button
              variant="ghost"
              size="sm"
              onClick={signOut}
              className="h-6 px-2 text-xs text-white hover:bg-white/10 hover:text-white"
            >
              <LogOut className="size-3.5" />
              로그아웃
            </Button>
          </div>
        </div>
        {mobileSubTabs ? (
          <nav className="flex items-center gap-1 overflow-x-auto bg-white px-4 py-1.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden lg:hidden">
            {mobileSubTabs}
          </nav>
        ) : null}
      </header>

      <div className="flex">
        <aside className="sticky top-[52px] hidden h-[calc(100vh-52px)] w-56 shrink-0 overflow-y-auto border-r border-border bg-sidebar px-3 py-4 lg:block">
          <div className="relative mb-4 flex items-center gap-2.5 rounded-lg border border-border bg-card px-3 py-2.5">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 font-display text-sm font-extrabold text-primary">
              {initial}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold">
                {profile.isLoading ? "불러오는 중…" : displayName}
              </p>
              <p className="truncate text-[11px] text-muted-foreground">
                {profile.data?.email ?? "이메일 없음"}
              </p>
            </div>
            {selfRow ? (
              <button
                type="button"
                onClick={() => setEditingSelf(true)}
                aria-label="내 정보 수정"
                className="absolute right-2 top-2 flex size-6 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              >
                <Settings className="size-3.5" />
              </button>
            ) : null}
          </div>

          <div className="mb-4 [&_button]:w-full">
            {sidebarAction ?? <NewReservationDialog defaultDate={toDateKey(new Date())} />}
          </div>

          {NAV_GROUPS.map((group) => (
            <div key={group.label} className="mb-5">
              <p className="px-3 pb-1.5 text-[11px] font-bold tracking-wide text-muted-foreground">
                {group.label}
              </p>
              <div className="flex flex-col gap-1">
                {group.items.map((item) => (
                  <Link
                    key={item.label}
                    to={item.to}
                    className="flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium text-sidebar-foreground transition-colors hover:bg-sidebar-accent data-[status=active]:bg-sidebar-accent data-[status=active]:font-semibold data-[status=active]:text-sidebar-accent-foreground"
                  >
                    <item.icon className="size-4 opacity-70" />
                    {item.label}
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </aside>

        <main className="min-w-0 flex-1 px-4 pb-24 pt-4 lg:px-6 lg:pb-4">
          {title || action ? (
            <div className="mb-2.5 flex flex-wrap items-end justify-between gap-3 sm:mb-5">
              <div>
                {title ? (
                  <h1
                    className={`text-[16px] font-bold sm:text-2xl ${
                      hideTitleOnMobile ? "hidden sm:block" : ""
                    }`}
                  >
                    {title}
                  </h1>
                ) : null}
                {description ? (
                  <p className="mt-1 text-sm text-muted-foreground">{description}</p>
                ) : null}
              </div>
              {action}
            </div>
          ) : null}
          {children}
        </main>
      </div>

      <StaffEditDialog row={editingSelf ? selfRow : null} onOpenChange={(v) => setEditingSelf(v)} />

      {/* 모바일 하단 탭바(홈 바): 가운데 캘린더(Home) 탭을 원형으로 강조 */}
      <nav className="fixed inset-x-0 bottom-0 z-30 flex items-end justify-around border-t border-border bg-white pb-[max(10px,env(safe-area-inset-bottom))] pt-2 lg:hidden">
        {BOTTOM_NAV.map((item) => {
          const active = item.match(pathname);
          if ("center" in item && item.center) {
            return (
              <Link
                key={item.label}
                to={item.to}
                className="relative -mt-7 flex flex-col items-center gap-1"
              >
                <span className="flex size-14 items-center justify-center rounded-full bg-[#2f6fed] text-white shadow-lg ring-4 ring-white">
                  <item.icon className="size-6" />
                </span>
                <span className="text-[11px] font-bold text-[#2f6fed]">{item.label}</span>
              </Link>
            );
          }
          return (
            <Link
              key={item.label}
              to={item.to}
              className={`flex flex-col items-center gap-1 py-1 text-[11px] font-semibold ${
                active ? "text-[#2f6fed]" : "text-muted-foreground"
              }`}
            >
              <item.icon className="size-5" />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
