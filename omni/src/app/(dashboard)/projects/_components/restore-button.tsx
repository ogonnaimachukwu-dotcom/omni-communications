"use client";

import * as React from "react";
import { RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { restoreProjectAction } from "../actions";

export function RestoreButton({ projectId }: { projectId: string }) {
  const [pending, startTransition] = React.useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await restoreProjectAction(projectId);
        })
      }
      className={cn(
        "inline-flex items-center gap-1.5 text-xs font-medium text-primary transition-colors hover:underline disabled:opacity-50",
      )}
    >
      <RotateCcw className="size-3.5" />
      {pending ? "Restoring…" : "Restore"}
    </button>
  );
}
