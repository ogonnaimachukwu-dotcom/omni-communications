"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutGrid,
  Users,
  Send,
  Inbox,
  BarChart3,
  LogOut,
  PenSquare,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { signOut } from "@/lib/auth/client";

const nav = [
  { label: "Projects", href: "/projects", icon: LayoutGrid, live: true },
  { label: "Distributors", href: "/distributors", icon: Users, live: true },
  { label: "Campaigns", href: "/campaigns", icon: Send, live: true },
  { label: "Inbox", href: "/inbox", icon: Inbox, live: false },
  { label: "Analytics", href: "/analytics", icon: BarChart3, live: true },
];

export function DashboardSidebar({
  userName,
  userEmail,
}: {
  userName: string | null;
  userEmail: string;
}) {
  const pathname = usePathname();
  const router = useRouter();

  async function handleSignOut() {
    await signOut();
    router.push("/login");
  }

  const initial = (userName ?? userEmail).trim().slice(0, 1).toUpperCase();

  return (
    <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-border bg-card px-3 py-5 md:flex">
      <div className="flex items-center gap-2 px-3 pb-6">
        <div className="flex size-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
          <PenSquare className="size-4" />
        </div>
        <span className="text-sm font-semibold tracking-tight">OMNI</span>
      </div>

      <nav className="flex flex-1 flex-col gap-0.5">
        {nav.map((item) => {
          const active =
            item.live &&
            (pathname === item.href || pathname.startsWith(`${item.href}/`));
          const Icon = item.icon;
          const inner = (
            <span
              className={cn(
                "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors",
                active
                  ? "bg-secondary font-medium text-foreground"
                  : item.live
                    ? "text-muted-foreground hover:bg-secondary hover:text-foreground"
                    : "cursor-default text-muted-foreground/50",
              )}
            >
              <Icon className="size-4" />
              {item.label}
              {!item.live && (
                <span className="ml-auto text-[10px] uppercase tracking-wide text-muted-foreground/50">
                  Soon
                </span>
              )}
            </span>
          );

          return item.live ? (
            <Link key={item.href} href={item.href}>
              {inner}
            </Link>
          ) : (
            <div key={item.href} aria-disabled="true">
              {inner}
            </div>
          );
        })}
      </nav>

      <div className="mt-auto border-t border-border pt-3">
        <div className="flex items-center gap-2 px-3 py-2">
          <div className="flex size-7 items-center justify-center rounded-full bg-secondary text-xs font-medium text-muted-foreground">
            {initial}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-medium text-foreground">
              {userName ?? "Operator"}
            </p>
            <p className="truncate text-[11px] text-muted-foreground">{userEmail}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={handleSignOut}
          className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        >
          <LogOut className="size-4" />
          Sign out
        </button>
      </div>
    </aside>
  );
}
