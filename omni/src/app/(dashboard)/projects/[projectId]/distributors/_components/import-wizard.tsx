"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, Upload, CheckCircle2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import type { ListRow } from "@/core/distributors/list.repository";
import type { CustomFieldRow } from "@/core/custom-fields/custom-field.repository";
import type { ImportMapping, ClassifiedRow, ImportSummary } from "@/core/distributors/import";
import { previewImportAction, commitImportAction } from "../actions";

const MAX_BYTES = 5 * 1024 * 1024;
const PREVIEW_LIMIT = 50;

interface Preview {
  headers: string[];
  mapping: ImportMapping;
  rows: ClassifiedRow[];
  summary: ImportSummary;
}

interface Result {
  inserted: number;
  updated: number;
  duplicate: number;
  invalid: number;
  total: number;
  status: string;
}

export function ImportWizard({
  projectId,
  lists,
  fieldDefs,
}: {
  projectId: string;
  lists: ListRow[];
  fieldDefs: CustomFieldRow[];
}) {
  const router = useRouter();
  const [step, setStep] = React.useState<"upload" | "map" | "done">("upload");
  const [listId, setListId] = React.useState(lists[0]?.id ?? "");
  const [fileText, setFileText] = React.useState("");
  const [filename, setFilename] = React.useState("import.csv");
  const [preview, setPreview] = React.useState<Preview | null>(null);
  const [excluded, setExcluded] = React.useState<Set<number>>(new Set());
  const [policy, setPolicy] = React.useState<"skip" | "update">("skip");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<Result | null>(null);

  async function runPreview(text: string, mapping?: ImportMapping) {
    setBusy(true);
    setError(null);
    const res = await previewImportAction(projectId, listId, text, mapping);
    setBusy(false);
    if (!res.ok) {
      setError(res.message);
      return;
    }
    setPreview(res.preview);
    setExcluded(new Set());
    setStep("map");
  }

  async function onFile(file: File) {
    if (file.size > MAX_BYTES) {
      setError("File is larger than 5 MB. Split it into smaller files and import each.");
      return;
    }
    const text = await file.text();
    setFileText(text);
    setFilename(file.name || "import.csv");
    if (!listId) {
      setError("Choose a list first.");
      return;
    }
    await runPreview(text);
  }

  function changeMapping(patch: Partial<ImportMapping>) {
    if (!preview) return;
    const mapping = { ...preview.mapping, ...patch };
    runPreview(fileText, mapping);
  }

  function changeFieldMapping(key: string, header: string) {
    if (!preview) return;
    const fields = { ...preview.mapping.fields };
    if (header) fields[key] = header;
    else delete fields[key];
    runPreview(fileText, { ...preview.mapping, fields });
  }

  async function commit() {
    if (!preview) return;
    setBusy(true);
    setError(null);
    const res = await commitImportAction(
      projectId,
      {
        listId,
        filename,
        mapping: preview.mapping,
        duplicatePolicy: policy,
        excludedRows: [...excluded],
      },
      fileText,
    );
    setBusy(false);
    if (!res.ok) {
      setError(res.message);
      return;
    }
    setResult(res.result);
    setStep("done");
    router.refresh();
  }

  /* ---- Result screen ---- */
  if (step === "done" && result) {
    return (
      <div className="space-y-4 rounded-lg border border-border bg-card p-6">
        <div className="flex items-center gap-2 text-foreground">
          <CheckCircle2 className="size-5 text-primary" />
          <h2 className="text-lg font-semibold">Import {result.status}</h2>
        </div>
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Added" value={result.inserted} />
          <Stat label="Updated" value={result.updated} />
          <Stat label="Duplicates" value={result.duplicate} />
          <Stat label="Skipped (invalid)" value={result.invalid} />
        </dl>
        <div className="flex gap-2 pt-2">
          <Link
            href={`/projects/${projectId}/distributors?listId=${listId}`}
            className="inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground"
          >
            View distributors
          </Link>
          <Button
            variant="outline"
            onClick={() => {
              setStep("upload");
              setPreview(null);
              setResult(null);
              setFileText("");
            }}
          >
            Import another
          </Button>
        </div>
      </div>
    );
  }

  /* ---- Upload screen ---- */
  if (step === "upload") {
    return (
      <div className="space-y-4 rounded-lg border border-border bg-card p-6">
        <div className="max-w-sm space-y-1.5">
          <Label htmlFor="import-list">Import into list</Label>
          <Select id="import-list" value={listId} onChange={(e) => setListId(e.target.value)}>
            {lists.length === 0 && <option value="">No lists — create one first</option>}
            {lists.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </Select>
        </div>

        <label
          className={cn(
            "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-background px-6 py-12 text-center transition-colors hover:border-primary/50",
            !listId && "pointer-events-none opacity-50",
          )}
        >
          <Upload className="size-6 text-muted-foreground" />
          <span className="text-sm font-medium">Choose a CSV file</span>
          <span className="text-xs text-muted-foreground">Up to 5 MB · required column: email</span>
          <input
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onFile(file);
            }}
          />
        </label>

        {busy && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Reading file…
          </p>
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
    );
  }

  /* ---- Map + preview screen ---- */
  const rows = preview?.rows ?? [];
  const shown = rows.slice(0, PREVIEW_LIMIT);

  return (
    <div className="space-y-5">
      <div className="rounded-lg border border-border bg-card p-5">
        <h2 className="mb-3 text-sm font-semibold">Map columns</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <MapSelect
            label="Email *"
            value={preview?.mapping.email ?? ""}
            headers={preview?.headers ?? []}
            onChange={(v) => changeMapping({ email: v })}
          />
          <MapSelect
            label="Name"
            value={preview?.mapping.name ?? ""}
            headers={preview?.headers ?? []}
            onChange={(v) => changeMapping({ name: v || undefined })}
            allowNone
          />
          <MapSelect
            label="First name"
            value={preview?.mapping.firstName ?? ""}
            headers={preview?.headers ?? []}
            onChange={(v) => changeMapping({ firstName: v || undefined })}
            allowNone
          />
          <MapSelect
            label="Last name"
            value={preview?.mapping.lastName ?? ""}
            headers={preview?.headers ?? []}
            onChange={(v) => changeMapping({ lastName: v || undefined })}
            allowNone
          />
          {fieldDefs.map((f) => (
            <MapSelect
              key={f.id}
              label={f.label}
              value={preview?.mapping.fields[f.key] ?? ""}
              headers={preview?.headers ?? []}
              onChange={(v) => changeFieldMapping(f.key, v)}
              allowNone
            />
          ))}
        </div>
      </div>

      {preview && (
        <div className="flex flex-wrap items-center gap-4 rounded-lg border border-border bg-card px-5 py-3 text-sm">
          <Count label="Valid" value={preview.summary.valid} tone="ok" />
          <Count label="Duplicates" value={preview.summary.duplicate} tone="warn" />
          <Count label="Invalid" value={preview.summary.invalid} tone="bad" />
          <Count label="Total" value={preview.summary.total} />
          <div className="ml-auto flex items-center gap-2">
            <Label htmlFor="dup-policy" className="text-xs">
              Duplicates:
            </Label>
            <Select
              id="dup-policy"
              value={policy}
              onChange={(e) => setPolicy(e.target.value as "skip" | "update")}
              className="h-8 w-40"
            >
              <option value="skip">Skip existing</option>
              <option value="update">Update existing</option>
            </Select>
          </div>
        </div>
      )}

      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="w-10 px-4 py-2.5">Skip</th>
              <th className="px-4 py-2.5 font-medium">Status</th>
              <th className="px-4 py-2.5 font-medium">Email</th>
              <th className="px-4 py-2.5 font-medium">Name</th>
              <th className="px-4 py-2.5 font-medium">Notes</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => {
              const importable = r.status !== "invalid";
              return (
                <tr key={r.rowIndex} className="border-b border-border last:border-0">
                  <td className="px-4 py-2">
                    <Checkbox
                      checked={excluded.has(r.rowIndex)}
                      disabled={!importable}
                      onChange={() =>
                        setExcluded((prev) => {
                          const next = new Set(prev);
                          next.has(r.rowIndex) ? next.delete(r.rowIndex) : next.add(r.rowIndex);
                          return next;
                        })
                      }
                      aria-label={`Exclude row ${r.rowIndex + 1}`}
                    />
                  </td>
                  <td className="px-4 py-2">
                    <StatusBadge status={r.status} scope={r.duplicateScope} />
                  </td>
                  <td className="px-4 py-2 text-muted-foreground">{r.email || "—"}</td>
                  <td className="px-4 py-2">{r.data?.name ?? "—"}</td>
                  <td className="px-4 py-2 text-xs text-muted-foreground">
                    {[...r.errors, ...r.warnings].join("; ")}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {rows.length > PREVIEW_LIMIT && (
          <p className="border-t border-border px-4 py-2 text-xs text-muted-foreground">
            Showing first {PREVIEW_LIMIT} of {rows.length} rows. All rows are imported on confirm.
          </p>
        )}
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => setStep("upload")}>
          Back
        </Button>
        <Button onClick={commit} disabled={busy || !preview || preview.summary.valid + preview.summary.duplicate === 0}>
          {busy && <Loader2 className="size-4 animate-spin" />}
          Import
        </Button>
      </div>
    </div>
  );
}

function MapSelect({
  label,
  value,
  headers,
  onChange,
  allowNone,
}: {
  label: string;
  value: string;
  headers: string[];
  onChange: (value: string) => void;
  allowNone?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      <Select value={value} onChange={(e) => onChange(e.target.value)} className="h-8">
        {allowNone && <option value="">— none —</option>}
        {!allowNone && <option value="">— choose —</option>}
        {headers.map((h) => (
          <option key={h} value={h}>
            {h}
          </option>
        ))}
      </Select>
    </div>
  );
}

function StatusBadge({ status, scope }: { status: string; scope?: "file" | "list" }) {
  const map: Record<string, string> = {
    valid: "bg-primary/10 text-primary",
    duplicate: "bg-amber-500/10 text-amber-600",
    invalid: "bg-destructive/10 text-destructive",
  };
  const label = status === "duplicate" && scope ? `duplicate (${scope})` : status;
  return (
    <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium capitalize", map[status])}>
      {label}
    </span>
  );
}

function Count({ label, value, tone }: { label: string; value: number; tone?: "ok" | "warn" | "bad" }) {
  const color =
    tone === "ok" ? "text-primary" : tone === "warn" ? "text-amber-600" : tone === "bad" ? "text-destructive" : "text-foreground";
  return (
    <span className="flex items-center gap-1.5">
      <span className={cn("text-base font-semibold", color)}>{value}</span>
      <span className="text-xs text-muted-foreground">{label}</span>
    </span>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-border p-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-xl font-semibold">{value}</dd>
    </div>
  );
}
