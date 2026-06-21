"use client";

import * as React from "react";
import { Archive, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { setProjectStatusAction } from "../actions";
import type { ProjectStatus } from "@/core/projects/project.schema";

export function StatusToggle({
  projectId,
  status,
}: {
  projectId: string;
  status: ProjectStatus;
}) {
  const [pending, startTransition] = React.useTransition();
  const next: ProjectStatus = status === "active" ? "archived" : "active";

  return (
    <Button
      variant="outline"
      size="sm"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await setProjectStatusAction(projectId, next);
        })
      }
    >
      {status === "active" ? (
        <>
          <Archive className="size-4" />
          Archive
        </>
      ) : (
        <>
          <CheckCircle2 className="size-4" />
          Activate
        </>
      )}
    </Button>
  );
}
