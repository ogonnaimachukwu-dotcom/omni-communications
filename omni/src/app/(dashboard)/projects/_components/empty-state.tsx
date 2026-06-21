import Link from "next/link";
import { FolderPlus } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function EmptyState({ trash }: { trash: boolean }) {
  if (trash) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-card py-16 text-center">
        <p className="text-sm font-medium text-foreground">Trash is empty</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Deleted projects show up here and can be restored.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-dashed border-border bg-card py-16 text-center">
      <div className="mx-auto mb-3 flex size-10 items-center justify-center rounded-full bg-secondary text-muted-foreground">
        <FolderPlus className="size-5" />
      </div>
      <p className="text-sm font-medium text-foreground">No projects yet</p>
      <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
        Create your first project to start managing a CEO&apos;s distributor communications.
      </p>
      <Link href="/projects/new" className={cn(buttonVariants(), "mt-4")}>
        Create project
      </Link>
    </div>
  );
}
