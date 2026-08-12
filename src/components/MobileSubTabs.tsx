import { Link } from "@tanstack/react-router";

const TAB_CLASS = (active: boolean) =>
  `relative shrink-0 whitespace-nowrap px-1 py-2.5 transition-colors ${
    active ? "text-base font-semibold text-white" : "text-sm font-normal text-white/80"
  }`;

function ActiveUnderline() {
  return (
    <span className="absolute -bottom-px left-1/2 h-[6px] w-[10px] -translate-x-1/2 rounded-t-[99px] bg-white" />
  );
}

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
    <button type="button" onClick={onClick} className={TAB_CLASS(active)}>
      {children}
      {active ? <ActiveUnderline /> : null}
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
    <Link to={to} className={TAB_CLASS(active)}>
      {children}
      {active ? <ActiveUnderline /> : null}
    </Link>
  );
}
