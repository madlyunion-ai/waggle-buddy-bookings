import { Link } from "@tanstack/react-router";

/** AppShell의 모바일 상단 서브 메뉴에 쓰는 탭 버튼 (같은 페이지 내부 상태 전환용) */
export function MobileSubTabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-bold transition-colors ${
        active ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-secondary"
      }`}
    >
      {children}
    </button>
  );
}

/** AppShell의 모바일 상단 서브 메뉴에 쓰는 탭 링크 (다른 라우트로 이동하는 서브 메뉴용) */
export function MobileSubTabLink({
  to,
  active,
  children,
}: {
  to: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      to={to}
      className={`whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-bold transition-colors ${
        active ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-secondary"
      }`}
    >
      {children}
    </Link>
  );
}
