"use client";

import * as React from "react";
import { useActionState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Loader2, Plus, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { DistributorWithTags } from "@/core/distributors/distributor.repository";
import type { DistributorView } from "@/core/distributors/distributor.schema";
import type { ListRow } from "@/core/distributors/list.repository";
import type { TagRow } from "@/core/tags/tag.repository";
import type { CustomFieldRow } from "@/core/custom-fields/custom-field.repository";
import {
  createDistributorAction,
  updateDistributorAction,
  bulkDistributorAction,
  exportDistributorsAction,
  type FormState,
} from "../actions";

const STANDARD_FIELDS = [
  "company",
  "position",
  "phone",
  "country",
  "state",
  "city",
  "notes",
] as const;

const initial: FormState = { status: "idle" };

export function DistributorsClient({
  projectId,
  items,
  view,
  page,
  pageCount,
  total,
  lists,
  tags,
  fieldDefs,
}: {
  projectId: string;
  items: DistributorWithTags[];
  view: DistributorView;
  page: number;
  pageCount: number;
  total: number;
  lists: ListRow[];
  tags: TagRow[];
  fieldDefs: CustomFieldRow[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [editing, setEditing] = React.useState<DistributorWithTags | null>(null);
  const [creating, setCreating] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState<string | null>(null);

  React.useEffect(() => setSelected(new Set()), [items]);

  const allChecked = items.length > 0 && selected.size === items.length;
  const toggleAll = () =>
    setSelected(allChecked ? new Set() : new Set(items.map((i) => i.id)));
  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  async function runBulk(action: string, tagId?: string) {
    setBusy(true);
    setMessage(null);
    const res = await bulkDistributorAction(projectId, { action, ids: [...selected], tagId });
    setBusy(false);
    if (res.status === "success") {
      setMessage(res.message ?? "Done.");
      setSelected(new Set());
      router.refresh();
    } else {
      setMessage(res.status === "error" && res.message ? res.message : "Action failed.");
    }
  }

  async function exportView() {
    setBusy(true);
    const raw: Record<string, string> = {};
    params.forEach((v, k) => (raw[k] = v));
    const { filename, csv } = await exportDistributorsAction(projectId, raw);
    setBusy(false);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {total} distributor{total === 1 ? "" : "s"}
        </p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={exportView} disabled={busy || total === 0}>
            <Download className="size-4" />
            Export
          </Button>
          <Button size="sm" onClick={() => setCreating(true)} disabled={lists.length === 0}>
            <Plus className="size-4" />
            Add distributor
          </Button>
        </div>
      </div>

      {lists.length === 0 && (
        <p className="rounded-md border border-border bg-card p-4 text-sm text-muted-foreground">
          Create a list first (Manage → Lists) — distributors belong to a list.
        </p>
      )}

      {message && <p className="text-sm text-muted-foreground">{message}</p>}

      {selected.size > 0 && (
        <BulkBar
          view={view}
          count={selected.size}
          tags={tags}
          busy={busy}
          onAction={runBulk}
        />
      )}

      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="w-10 px-4 py-3">
                <Checkbox
                  checked={allChecked}
                  indeterminate={selected.size > 0 && !allChecked}
                  onChange={toggleAll}
                  aria-label="Select all"
                />
              </th>
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Email</th>
              <th className="px-4 py-3 font-medium">Tags</th>
              <th className="px-4 py-3 font-medium">Subscription</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-sm text-muted-foreground">
                  No distributors here yet.
                </td>
              </tr>
            ) : (
              items.map((d) => (
                <tr
                  key={d.id}
                  className="border-b border-border transition-colors last:border-0 hover:bg-secondary/50"
                >
                  <td className="px-4 py-3">
                    <Checkbox
                      checked={selected.has(d.id)}
                      onChange={() => toggle(d.id)}
                      aria-label={`Select ${d.email}`}
                    />
                  </td>
                  <td className="px-4 py-3">
                    {view === "trash" ? (
                      <span className="font-medium text-foreground">{d.name}</span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setEditing(d)}
                        className="font-medium text-foreground hover:text-primary"
                      >
                        {d.name}
                      </button>
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{d.email}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {d.tags.map((t) => (
                        <span
                          key={t.id}
                          className="rounded-full bg-secondary px-2 py-0.5 text-xs text-secondary-foreground"
                          style={t.color ? { backgroundColor: `${t.color}22`, color: t.color } : undefined}
                        >
                          {t.name}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{d.status}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {pageCount > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            Page {page} of {pageCount}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => goToPage(router, pathname, params.toString(), page - 1)}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= pageCount}
              onClick={() => goToPage(router, pathname, params.toString(), page + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}

      {(creating || editing) && (
        <DistributorDialog
          projectId={projectId}
          lists={lists}
          tags={tags}
          fieldDefs={fieldDefs}
          editing={editing}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

function goToPage(
  router: ReturnType<typeof useRouter>,
  pathname: string,
  paramsStr: string,
  target: number,
) {
  const next = new URLSearchParams(paramsStr);
  next.set("page", String(target));
  router.replace(`${pathname}?${next.toString()}`);
}

function BulkBar({
  view,
  count,
  tags,
  busy,
  onAction,
}: {
  view: DistributorView;
  count: number;
  tags: TagRow[];
  busy: boolean;
  onAction: (action: string, tagId?: string) => void;
  }) {
  const [tagId, setTagId] = React.useState("");

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-4 py-2.5">
      <span className="text-sm font-medium">{count} selected</span>
      <div className="mx-1 h-5 w-px bg-border" />

      {view === "trash" ? (
        <Button variant="outline" size="sm" disabled={busy} onClick={() => onAction("restore")}>
          Restore
        </Button>
      ) : (
        <>
          <Select
            value={tagId}
            onChange={(e) => setTagId(e.target.value)}
            className="h-8 w-36"
            aria-label="Tag to apply"
          >
            <option value="">Choose tag…</option>
            {tags.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </Select>
          <Button variant="outline" size="sm" disabled={busy || !tagId} onClick={() => onAction("tag", tagId)}>
            Tag
          </Button>
          <Button variant="outline" size="sm" disabled={busy || !tagId} onClick={() => onAction("untag", tagId)}>
            Untag
          </Button>
          <div className="mx-1 h-5 w-px bg-border" />
          {view === "archived" ? (
            <Button variant="outline" size="sm" disabled={busy} onClick={() => onAction("unarchive")}>
              Unarchive
            </Button>
          ) : (
            <Button variant="outline" size="sm" disabled={busy} onClick={() => onAction("archive")}>
              Archive
            </Button>
          )}
          <Button variant="outline" size="sm" disabled={busy} onClick={() => onAction("delete")}>
            Delete
          </Button>
        </>
      )}
    </div>
  );
}

function DistributorDialog({
  projectId,
  lists,
  tags,
  fieldDefs,
  editing,
  onClose,
}: {
  projectId: string;
  lists: ListRow[];
  tags: TagRow[];
  fieldDefs: CustomFieldRow[];
  editing: DistributorWithTags | null;
  onClose: () => void;
}) {
  const action = editing
    ? updateDistributorAction.bind(null, projectId)
    : createDistributorAction.bind(null, projectId);
  const [state, formAction, pending] = useActionState(action, initial);

  React.useEffect(() => {
    if (state.status === "success") onClose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.status]);

  const f = editing?.fields ?? {};
  const selectedTagIds = new Set(editing?.tags.map((t) => t.id) ?? []);
  const fieldErrors = state.status === "error" ? state.fieldErrors : undefined;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} labelledBy="distributor-dialog-title">
      <DialogHeader>
        <DialogTitle id="distributor-dialog-title">
          {editing ? "Edit distributor" : "Add distributor"}
        </DialogTitle>
      </DialogHeader>
      <form action={formAction} className="space-y-4">
        {editing && <input type="hidden" name="id" value={editing.id} />}

        {!editing && (
          <div className="space-y-1.5">
            <Label htmlFor="listId">List</Label>
            <Select id="listId" name="listId" required defaultValue={lists[0]?.id}>
              {lists.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </Select>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Field label="Name" htmlFor="name" error={fieldErrors?.name} required>
            <Input id="name" name="name" defaultValue={editing?.name ?? ""} required maxLength={200} />
          </Field>
          <Field label="Email" htmlFor="email" error={fieldErrors?.email} required>
            <Input id="email" name="email" type="email" defaultValue={editing?.email ?? ""} required />
          </Field>
          <Field label="First name" htmlFor="firstName" error={fieldErrors?.firstName}>
            <Input id="firstName" name="firstName" defaultValue={editing?.firstName ?? ""} />
          </Field>
          <Field label="Last name" htmlFor="lastName" error={fieldErrors?.lastName}>
            <Input id="lastName" name="lastName" defaultValue={editing?.lastName ?? ""} />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {STANDARD_FIELDS.map((key) => (
            <Field key={key} label={titleCase(key)} htmlFor={`field.${key}`}>
              <Input id={`field.${key}`} name={`field.${key}`} defaultValue={f[key] ?? ""} />
            </Field>
          ))}
        </div>

        {fieldDefs.length > 0 && (
          <div className="grid grid-cols-2 gap-3 border-t border-border pt-3">
            {fieldDefs.map((def) => (
              <Field key={def.id} label={def.label} htmlFor={`field.${def.key}`}>
                <CustomFieldInput def={def} value={f[def.key] ?? ""} />
              </Field>
            ))}
          </div>
        )}

        <div className="space-y-1.5 border-t border-border pt-3">
          <Label>Tags</Label>
          <div className="flex flex-wrap gap-3">
            {tags.length === 0 && <span className="text-xs text-muted-foreground">No tags yet.</span>}
            {tags.map((t) => (
              <label key={t.id} className="flex items-center gap-1.5 text-sm">
                <Checkbox name="tagIds" value={t.id} defaultChecked={selectedTagIds.has(t.id)} />
                {t.name}
              </label>
            ))}
          </div>
        </div>

        {state.status === "error" && state.message && (
          <p className="text-sm text-destructive">{state.message}</p>
        )}

        <div className="flex justify-end gap-2 border-t border-border pt-4">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={pending}>
            {pending && <Loader2 className="size-4 animate-spin" />}
            {editing ? "Save" : "Add"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function CustomFieldInput({ def, value }: { def: CustomFieldRow; value: string }) {
  const name = `field.${def.key}`;
  if (def.type === "select") {
    return (
      <Select id={name} name={name} defaultValue={value}>
        <option value="">—</option>
        {(def.options ?? []).map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </Select>
    );
  }
  if (def.type === "boolean") {
    return (
      <Select id={name} name={name} defaultValue={value}>
        <option value="">—</option>
        <option value="true">Yes</option>
        <option value="false">No</option>
      </Select>
    );
  }
  const inputType = def.type === "number" ? "number" : def.type === "date" ? "date" : "text";
  return <Input id={name} name={name} type={inputType} defaultValue={value} />;
}

function Field({
  label,
  htmlFor,
  error,
  required,
  children,
}: {
  label: string;
  htmlFor: string;
  error?: string[];
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor}>
        {label}
        {required && <span className="text-destructive"> *</span>}
      </Label>
      {children}
      {error?.length ? <p className="text-xs text-destructive">{error[0]}</p> : null}
    </div>
  );
}

function titleCase(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
