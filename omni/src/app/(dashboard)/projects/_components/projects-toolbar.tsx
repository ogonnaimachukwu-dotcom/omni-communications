"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/utils";

export function ProjectsToolbar() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const [q, setQ] = React.useState(params.get("q") ?? "");

  const apply = React.useCallback(
    (mutate: (next: URLSearchParams) => void) => {
      const next = new URLSearchParams(params.toString());
      mutate(next);
      next.delete("page"); // any filter change returns to the first page
      router.replace(`${pathname}?${next.toString()}`);
    },
    [params, pathname, router],
  );

  // Debounced search: push to the URL 300ms after typing settles.
  React.useEffect(() => {
    const current = params.get("q") ?? "";
    if (q === current) return;
    const timer = setTimeout(() => {
      apply((next) => {
        if (q) next.set("q", q);
        else next.delete("q");
      });
    }, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const trash = params.get("trash") === "1";
  const status = params.get("status") ?? "";

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="relative min-w-[200px] flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search projects, companies, CEOs"
          className="pl-9"
          aria-label="Search projects"
        />
      </div>

      <Select
        value={status}
        onChange={(e) =>
          apply((next) => {
            const value = e.target.value;
            if (value) next.set("status", value);
            else next.delete("status");
          })
        }
        className="w-40"
        aria-label="Filter by status"
      >
        <option value="">All statuses</option>
        <option value="active">Active</option>
        <option value="archived">Archived</option>
      </Select>

      <button
        type="button"
        onClick={() =>
          apply((next) => {
            if (trash) next.delete("trash");
            else next.set("trash", "1");
          })
        }
        className={cn(
          "h-9 rounded-md border px-3 text-sm transition-colors",
          trash
            ? "border-primary bg-primary/10 text-primary"
            : "border-input bg-card text-muted-foreground hover:text-foreground",
        )}
        aria-pressed={trash}
      >
        {trash ? "Viewing trash" : "Trash"}
      </button>
    </div>
  );
}
