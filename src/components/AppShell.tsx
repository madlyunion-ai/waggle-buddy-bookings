import { Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { CalendarCheck, CalendarDays, Dog, LogOut, Ticket } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

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
      { to: "/reservations", label: "예약 정보", icon: CalendarCheck },
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
  { to: "/passes", label: "이용권 · 결제", icon: Ticket },
] as const;


export function AppShell({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/", replace: true });
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 border-b border-border bg-card">
        <div className="flex h-14 items-center gap-3 px-4 lg:px-6">
          <Link to="/dashboard" className="flex items-center gap-2">
            <span className="font-display text-[17px] font-extrabold tracking-tight">허그앤멍 예약관리시스템</span>
          </Link>

          <div className="ml-auto flex items-center gap-2">
            <span className="hidden rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground md:inline">
              허그앤멍 본원
            </span>
            <Button variant="ghost" size="sm" onClick={signOut}>
              <LogOut className="size-4" />
              로그아웃
            </Button>
          </div>
        </div>
        <nav className="flex gap-1 overflow-x-auto border-t border-border px-4 py-2 lg:hidden">
          {MOBILE_NAV.map((item) => (
            <Link
              key={item.label}
              to={item.to}
              className="flex items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1.5 text-sm text-muted-foreground data-[status=active]:bg-sidebar-accent data-[status=active]:font-semibold data-[status=active]:text-sidebar-accent-foreground"
            >
              <item.icon className="size-4" />
              {item.label}
            </Link>
          ))}
        </nav>
      </header>

      <div className="flex">
        <aside className="sticky top-14 hidden h-[calc(100vh-3.5rem)] w-56 shrink-0 overflow-y-auto border-r border-border bg-sidebar px-3 py-4 lg:block">
          {NAV_GROUPS.map((group) => (
            <div key={group.label} className="mb-5">
              <p className="px-3 pb-1.5 text-[11px] font-bold tracking-wide text-muted-foreground">{group.label}</p>
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
          ))}
        </aside>

        <main className="min-w-0 flex-1 px-4 py-6 lg:px-8">
          <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="text-xl font-extrabold sm:text-2xl">{title}</h1>
              {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
            </div>
            {action}
          </div>
          {children}
        </main>
      </div>
    </div>
  );
}
