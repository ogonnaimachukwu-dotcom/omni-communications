import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { ProjectForm } from "../_components/project-form";

export default function NewProjectPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Link
        href="/projects"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Projects
      </Link>

      <div>
        <h1 className="text-2xl font-semibold tracking-tight">New project</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Add a company and CEO you&apos;ll be sending on behalf of.
        </p>
      </div>

      <Card>
        <CardContent className="pt-6">
          <ProjectForm mode="create" />
        </CardContent>
      </Card>
    </div>
  );
}
