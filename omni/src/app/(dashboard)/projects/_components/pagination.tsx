"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";

export function Pagination({
  page,
  pageCount,
  total,
}: {
  page: number;
  pageCount: number;
  total: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const go = (target: number) => {
    const next = new URLSearchParams(params.toString());
    next.set("page", String(target));
    router.replace(`${pathname}?${next.toString()}`);
  };

  return (
    <div className="flex items-center justify-between">
      <p className="text-xs text-muted-foreground">
        {total} project{total === 1 ? "" : "s"} · page {page} of {pageCount}
      </p>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => go(page - 1)}>
          Previous
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={page >= pageCount}
          onClick={() => go(page + 1)}
        >
          Next
        </Button>
      </div>
    </div>
  );
}
