import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CalendarCheck, CalendarDays, Dog, LogOut, MapPin, Ticket, Users } from "lucide-react";

import { NewReservationDialog } from "@/components/NewReservationDialog";
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
      { to: "/staff", label: "직원 관리", icon: Users },
    ],
  },
  {
    label: "이용권 · 정산",
    items: [{ to: "/passes", label: "이용권 · 결제", icon: Ticket }],
  },
] as const;

const MOBILE_NAV = [
  { to: "/dashboard", label: "오늘 현황", icon: CalendarDays },
  { to: "/dogs", label: "반려견 리스트", icon: Dog },
  { to: "/reservations", label: "예약 정보", icon: CalendarCheck },
  { to: "/staff", label: "직원 관리", icon: Users },
  { to: "/passes", label: "이용권 · 결제", icon: Ticket },
] as const;


export function AppShell({
  title,
  description,
  action,
  sidebarAction,
  children,
}: {
  title?: string;
  description?: string;
  action?: ReactNode;
  sidebarAction?: ReactNode;
  children: ReactNode;
}) {

  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fetchProfile = useServerFn(getCurrentStaffProfile);
  const profile = useQuery({
    queryKey: ["current-staff-profile"],
    queryFn: () => fetchProfile(),
    staleTime: 5 * 60 * 1000,
  });
  const displayName = profile.data?.name ?? "사용자";
  const initial = displayName.slice(0, 1);


  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/", replace: true });
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 border-b border-primary bg-primary text-white">
        <div className="flex h-[44px] items-center gap-3 px-4 lg:px-6">
          <Link to="/dashboard" className="flex items-center gap-2">
            <span className="font-display text-[13px] font-bold tracking-tight text-white">허그앤멍 예약관리시스템</span>
          </Link>

          <div className="ml-auto flex items-center gap-2">
            <a
              href={BRANCH_MAP_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="hidden items-center gap-1 rounded-md bg-white px-2.5 py-1 text-[11px] font-medium text-primary transition-colors hover:bg-white/90 md:inline-flex"
            >
              <MapPin className="size-3 text-primary" />
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
        <nav className="flex gap-1 overflow-x-auto border-t border-white/20 px-4 py-2 lg:hidden">
          {MOBILE_NAV.map((item) => (
            <Link
              key={item.label}
              to={item.to}
              className="flex items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1.5 text-sm text-white/80 data-[status=active]:bg-white/15 data-[status=active]:font-semibold data-[status=active]:text-white"
            >
              <item.icon className="size-4" />
              {item.label}
            </Link>
          ))}
        </nav>
      </header>

      <div className="flex">
        <aside className="sticky top-[44px] hidden h-[calc(100vh-44px)] w-56 shrink-0 overflow-y-auto border-r border-border bg-sidebar px-3 py-4 lg:block">
          <div className="mb-4 flex items-center gap-2.5 rounded-lg border border-border bg-card px-3 py-2.5">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 font-display text-sm font-extrabold text-primary">
              {initial}
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-bold">{profile.isLoading ? "불러오는 중…" : displayName}</p>
              <p className="truncate text-[11px] text-muted-foreground">
                {profile.data?.email ?? "이메일 없음"}
              </p>
            </div>
          </div>

          <div className="mb-4 [&_button]:w-full">
            {sidebarAction ?? <NewReservationDialog defaultDate={toDateKey(new Date())} />}
          </div>

          {NAV_GROUPS.map((group) => (
            <div key={group.label} className="mb-5">
              <p className="px-3 pb-1.5 text-[11px] font-bold tracking-wide text-muted-foreground">{group.label}</p>
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

        <main className="min-w-0 flex-1 px-4 py-4 lg:px-6">
          {title || action ? (
            <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
              <div>
                {title ? <h1 className="text-xl font-bold sm:text-2xl">{title}</h1> : null}
                {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
              </div>
              {action}
            </div>
          ) : null}
          {children}
        </main>

      </div>
    </div>
  );
}
