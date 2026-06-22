"use client";

import * as React from "react";
import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { Settings2, Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { ListWithCount } from "@/core/distributors/list.repository";
import type { TagWithCount } from "@/core/tags/tag.repository";
import type { CustomFieldRow } from "@/core/custom-fields/custom-field.repository";
import {
  createListAction,
  deleteListAction,
  createTagAction,
  updateTagAction,
  deleteTagAction,
  createCustomFieldAction,
  deleteCustomFieldAction,
  type FormState,
} from "../actions";

const initial: FormState = { status: "idle" };
const TABS = ["Lists", "Tags", "Fields"] as const;
type Tab = (typeof TABS)[number];

export function ManageButton({
  projectId,
  lists,
  tags,
  fieldDefs,
}: {
  projectId: string;
  lists: ListWithCount[];
  tags: TagWithCount[];
  fieldDefs: CustomFieldRow[];
}) {
  const [open, setOpen] = React.useState(false);
  const [tab, setTab] = React.useState<Tab>("Lists");

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Settings2 className="size-4" />
        Manage
      </Button>
      <Dialog open={open} onOpenChange={setOpen} labelledBy="manage-title">
        <DialogHeader>
          <DialogTitle id="manage-title">Manage</DialogTitle>
        </DialogHeader>

        <div className="mb-4 flex gap-1">
          {TABS.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={cn(
                "h-8 rounded-md px-3 text-sm transition-colors",
                tab === t
                  ? "bg-secondary font-medium text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t}
            </button>
          ))}
        </div>

        {tab === "Lists" && <ListsTab projectId={projectId} lists={lists} />}
        {tab === "Tags" && <TagsTab projectId={projectId} tags={tags} />}
        {tab === "Fields" && <FieldsTab projectId={projectId} fieldDefs={fieldDefs} />}
      </Dialog>
    </>
  );
}

function useRefreshOnSuccess(state: FormState, reset?: () => void) {
  const router = useRouter();
  React.useEffect(() => {
    if (state.status === "success") {
      router.refresh();
      reset?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);
}

function DeleteButton({ onDelete }: { onDelete: () => Promise<void> }) {
  const [busy, setBusy] = React.useState(false);
  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        await onDelete();
        setBusy(false);
      }}
      className="text-muted-foreground transition-colors hover:text-destructive disabled:opacity-50"
      aria-label="Delete"
    >
      <Trash2 className="size-4" />
    </button>
  );
}

/* ---- Lists ------------------------------------------------------------ */

function ListsTab({ projectId, lists }: { projectId: string; lists: ListWithCount[] }) {
  const router = useRouter();
  const [state, action, pending] = useActionState(createListAction.bind(null, projectId), initial);
  const formRef = React.useRef<HTMLFormElement>(null);
  useRefreshOnSuccess(state, () => formRef.current?.reset());

  return (
    <div className="space-y-4">
      <ul className="divide-y divide-border rounded-md border border-border">
        {lists.length === 0 && <li className="px-3 py-2 text-sm text-muted-foreground">No lists yet.</li>}
        {lists.map((l) => (
          <li key={l.id} className="flex items-center justify-between px-3 py-2 text-sm">
            <span>
              {l.name} <span className="text-muted-foreground">· {l.count}</span>
            </span>
            <DeleteButton
              onDelete={async () => {
                await deleteListAction(projectId, l.id);
                router.refresh();
              }}
            />
          </li>
        ))}
      </ul>

      <form ref={formRef} action={action} className="space-y-2 border-t border-border pt-3">
        <Label htmlFor="list-name">New list</Label>
        <Input id="list-name" name="name" placeholder="Q1 Newsletter" required maxLength={120} />
        <Input name="description" placeholder="Optional description" maxLength={500} />
        {state.status === "error" && state.message && (
          <p className="text-sm text-destructive">{state.message}</p>
        )}
        <Button type="submit" size="sm" disabled={pending}>
          {pending && <Loader2 className="size-4 animate-spin" />}
          Create list
        </Button>
      </form>
    </div>
  );
}

/* ---- Tags ------------------------------------------------------------- */

function TagsTab({ projectId, tags }: { projectId: string; tags: TagWithCount[] }) {
  const router = useRouter();
  const [state, action, pending] = useActionState(createTagAction.bind(null, projectId), initial);
  const formRef = React.useRef<HTMLFormElement>(null);
  useRefreshOnSuccess(state, () => formRef.current?.reset());

  return (
    <div className="space-y-4">
      <ul className="divide-y divide-border rounded-md border border-border">
        {tags.length === 0 && <li className="px-3 py-2 text-sm text-muted-foreground">No tags yet.</li>}
        {tags.map((t) => (
          <TagRowEditor key={t.id} projectId={projectId} tag={t} onChanged={() => router.refresh()} />
        ))}
      </ul>

      <form ref={formRef} action={action} className="space-y-2 border-t border-border pt-3">
        <Label htmlFor="tag-name">New tag</Label>
        <div className="flex gap-2">
          <Input id="tag-name" name="name" placeholder="VIP" required maxLength={40} />
          <Input name="color" placeholder="#2563eb" className="w-28" />
        </div>
        {state.status === "error" && state.message && (
          <p className="text-sm text-destructive">{state.message}</p>
        )}
        <Button type="submit" size="sm" disabled={pending}>
          {pending && <Loader2 className="size-4 animate-spin" />}
          Create tag
        </Button>
      </form>
    </div>
  );
}

function TagRowEditor({
  projectId,
  tag,
  onChanged,
}: {
  projectId: string;
  tag: TagWithCount;
  onChanged: () => void;
}) {
  const [editing, setEditing] = React.useState(false);
  const [state, action, pending] = useActionState(updateTagAction.bind(null, projectId), initial);
  React.useEffect(() => {
    if (state.status === "success") {
      setEditing(false);
      onChanged();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  if (editing) {
    return (
      <li className="px-3 py-2">
        <form action={action} className="flex items-center gap-2">
          <input type="hidden" name="id" value={tag.id} />
          <Input name="name" defaultValue={tag.name} className="h-8" required maxLength={40} />
          <Input name="color" defaultValue={tag.color ?? ""} placeholder="#hex" className="h-8 w-24" />
          <Button type="submit" size="sm" disabled={pending}>
            Save
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)}>
            Cancel
          </Button>
        </form>
        {state.status === "error" && state.message && (
          <p className="mt-1 text-xs text-destructive">{state.message}</p>
        )}
      </li>
    );
  }

  return (
    <li className="flex items-center justify-between px-3 py-2 text-sm">
      <span className="flex items-center gap-2">
        {tag.color && (
          <span className="size-3 rounded-full" style={{ backgroundColor: tag.color }} aria-hidden />
        )}
        {tag.name} <span className="text-muted-foreground">· {tag.count}</span>
      </span>
      <span className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          Edit
        </button>
        <DeleteButton
          onDelete={async () => {
            await deleteTagAction(projectId, tag.id);
            onChanged();
          }}
        />
      </span>
    </li>
  );
}

/* ---- Custom fields ---------------------------------------------------- */

function FieldsTab({ projectId, fieldDefs }: { projectId: string; fieldDefs: CustomFieldRow[] }) {
  const router = useRouter();
  const [state, action, pending] = useActionState(
    createCustomFieldAction.bind(null, projectId),
    initial,
  );
  const [type, setType] = React.useState("text");
  const formRef = React.useRef<HTMLFormElement>(null);
  useRefreshOnSuccess(state, () => formRef.current?.reset());

  return (
    <div className="space-y-4">
      <ul className="divide-y divide-border rounded-md border border-border">
        {fieldDefs.length === 0 && (
          <li className="px-3 py-2 text-sm text-muted-foreground">No custom fields yet.</li>
        )}
        {fieldDefs.map((f) => (
          <li key={f.id} className="flex items-center justify-between px-3 py-2 text-sm">
            <span>
              {f.label} <span className="text-muted-foreground">· {f.key} · {f.type}</span>
            </span>
            <DeleteButton
              onDelete={async () => {
                await deleteCustomFieldAction(projectId, f.id);
                router.refresh();
              }}
            />
          </li>
        ))}
      </ul>

      <form ref={formRef} action={action} className="space-y-2 border-t border-border pt-3">
        <Label htmlFor="field-label">New field</Label>
        <div className="flex gap-2">
          <Input id="field-label" name="label" placeholder="Region" required maxLength={60} />
          <Input name="key" placeholder="region" required maxLength={40} />
          <Select name="type" value={type} onChange={(e) => setType(e.target.value)} className="w-32">
            <option value="text">Text</option>
            <option value="number">Number</option>
            <option value="date">Date</option>
            <option value="select">Select</option>
            <option value="boolean">Boolean</option>
          </Select>
        </div>
        {type === "select" && (
          <Textarea name="options" placeholder="One option per line" rows={3} />
        )}
        {state.status === "error" && state.message && (
          <p className="text-sm text-destructive">{state.message}</p>
        )}
        <Button type="submit" size="sm" disabled={pending}>
          {pending && <Loader2 className="size-4 animate-spin" />}
          Create field
        </Button>
      </form>
    </div>
  );
}
