import { Badge } from "@/components/ui/badge";
import type { ProjectStatus } from "@/core/projects/project.schema";

export function StatusBadge({ status }: { status: ProjectStatus }) {
  return status === "active" ? (
    <Badge variant="success">Active</Badge>
  ) : (
    <Badge variant="muted">Archived</Badge>
  );
}
