import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function ProjectNotFound() {
  return (
    <div className="mx-auto max-w-md py-20 text-center">
      <p className="text-sm font-medium text-foreground">Project not found</p>
      <p className="mt-1 text-sm text-muted-foreground">
        It may have been permanently removed, or the link is wrong.
      </p>
      <Link
        href="/projects"
        className={cn(buttonVariants({ variant: "outline" }), "mt-4")}
      >
        Back to projects
      </Link>
    </div>
  );
}
