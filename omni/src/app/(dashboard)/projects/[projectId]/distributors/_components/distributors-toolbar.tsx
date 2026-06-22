"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { ListRow } from "@/core/distributors/list.repository";
import type { TagRow } from "@/core/tags/tag.repository";

const VIEWS = [
  { value: "active", label: "Active" },
  { value: "archived", label: "Archived" },
  { value: "trash", label: "Trash" },
] as const;

export function DistributorsToolbar({ lists, tags }: { lists: ListRow[]; tags: TagRow[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const [q, setQ] = React.useState(params.get("q") ?? "");

  const apply = React.useCallback(
    (mutate: (next: URLSearchParams) => void) => {
      const next = new URLSearchParams(params.toString());
      mutate(next);
      next.delete("page");
      router.replace(`${pathname}?${next.toString()}`);
    },
    [params, pathname, router],
  );

  React.useEffect(() => {
    const current = params.get("q") ?? "";
    if (q === current) return;
    const timer = setTimeout(() => {
      apply((next) => (q ? next.set("q", q) : next.delete("q")));
    }, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const view = params.get("view") ?? "active";
  const listId = params.get("listId") ?? "";
  const tagId = params.get("tagId") ?? "";
  const subscription = params.get("subscription") ?? "";

  const setParam = (key: string, value: string) =>
    apply((next) => (value ? next.set(key, value) : next.delete(key)));

  return (
    <div className="space-y-3">
      <div className="flex gap-1">
        {VIEWS.map((v) => (
          <button
            key={v.value}
            type="button"
            onClick={() => setParam("view", v.value === "active" ? "" : v.value)}
            className={cn(
              "h-8 rounded-md px-3 text-sm transition-colors",
              view === v.value
                ? "bg-secondary font-medium text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
            aria-pressed={view === v.value}
          >
            {v.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search name or email"
            className="pl-9"
            aria-label="Search distributors"
          />
        </div>

        <Select
          value={listId}
          onChange={(e) => setParam("listId", e.target.value)}
          className="w-44"
          aria-label="Filter by list"
        >
          <option value="">All lists</option>
          {lists.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </Select>

        <Select
          value={tagId}
          onChange={(e) => setParam("tagId", e.target.value)}
          className="w-40"
          aria-label="Filter by tag"
        >
          <option value="">All tags</option>
          {tags.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </Select>

        <Select
          value={subscription}
          onChange={(e) => setParam("subscription", e.target.value)}
          className="w-44"
          aria-label="Filter by subscription"
        >
          <option value="">Any subscription</option>
          <option value="subscribed">Subscribed</option>
          <option value="unsubscribed">Unsubscribed</option>
          <option value="bounced">Bounced</option>
          <option value="complained">Complained</option>
        </Select>
      </div>
    </div>
  );
}
