import Papa from "papaparse";
import { AppError } from "@/lib/errors";
import { db } from "@/db";
import { writeAudit } from "@/lib/audit";
import * as repo from "./distributor.repository";
import type { DistributorWithTags, PagedDistributors, InsertDistributor } from "./distributor.repository";
import * as listRepo from "./list.repository";
import * as importRepo from "./import.repository";
import * as customFields from "@/core/custom-fields/custom-field.service";
import { validateCustomValue, type FieldDef } from "@/core/custom-fields/custom-field.schema";
import {
  parseCsv,
  suggestMapping,
  classifyRows,
  selectForCommit,
  type ImportMapping,
  type ClassifiedRow,
  type ImportSummary,
} from "./import";
import type {
  CreateDistributorInput,
  UpdateDistributorInput,
  ListDistributorsQuery,
  BulkActionInput,
} from "./distributor.schema";
import type { CommitImportInput } from "./import.schema";
import { getAccessibleProject } from "@/core/projects/project.service";


/**
 * Distributor domain service — the single home for distributor business rules.
 * Server Actions call through here; every mutation leaves an audit trail.
 * Mirrors the project module: thin reads, validated writes, sequential audit.
 */

export type DistributorErrorCode = "not_found" | "conflict" | "validation";

export class DistributorError extends AppError {
  constructor(
    message: string,
    code: DistributorErrorCode = "conflict",
    statusCode: number = 400,
  ) {
    super(message, code, statusCode);
    this.name = "DistributorError";
  }
}

export interface Actor {
  userId: string;
  ipAddress?: string | null;
}

/* ---- Helpers ---------------------------------------------------------- */

const PG_UNIQUE_VIOLATION = "23505";

function isUniqueViolation(e: unknown): boolean {
  return (
    typeof e === "object" &&
    e !== null &&
    "code" in e &&
    (e as { code?: string }).code === PG_UNIQUE_VIOLATION
  );
}

/**
 * Validate + canonicalize submitted field values. Keys with a typed definition
 * are validated against it; unknown keys (built-in attributes like company,
 * phone) pass through as trimmed text. Throws on a typed-value mismatch.
 */
function prepareFields(defs: FieldDef[], raw: Record<string, string>): Record<string, string> {
  const byKey = new Map(defs.map((d) => [d.key, d]));
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    const def = byKey.get(key);
    if (def) {
      const res = validateCustomValue(def, value);
      if (!res.ok) throw new DistributorError(res.error, "validation");
      if (res.value !== "") out[key] = res.value;
    } else {
      const trimmed = (value ?? "").trim();
      if (trimmed !== "") out[key] = trimmed.slice(0, 1000);
    }
  }
  return out;
}

async function assertListInProject(projectId: string, listId: string) {
  const list = await listRepo.findById(projectId, listId);
  if (!list) throw new DistributorError("List not found", "not_found");
}

/* ---- Reads ------------------------------------------------------------ */

export async function listDistributors(
  projectId: string,
  query: ListDistributorsQuery,
  userId: string,
): Promise<PagedDistributors> {
  const accessible = await getAccessibleProject(projectId, userId);
  if (!accessible) throw new DistributorError("Project not found", "not_found");
  return repo.list(projectId, query);
}

export async function getDistributor(
  projectId: string,
  id: string,
  userId: string,
): Promise<DistributorWithTags | null> {
  const accessible = await getAccessibleProject(projectId, userId);
  if (!accessible) return null;
  return repo.findById(projectId, id);
}


/* ---- Mutations -------------------------------------------------------- */

export async function createDistributor(
  projectId: string,
  input: CreateDistributorInput,
  actor: Actor,
): Promise<DistributorWithTags> {
  const accessible = await getAccessibleProject(projectId, actor.userId);
  if (!accessible) throw new DistributorError("Project not found", "not_found");
  await assertListInProject(projectId, input.listId);


  const defs = await customFields.fieldDefs(projectId, actor.userId);
  const fields = prepareFields(defs, input.fields);

  const suppressed = new Set(await repo.suppressedEmails(projectId));
  const status = suppressed.has(input.email) ? "unsubscribed" : "subscribed";

  let created;
  try {
    created = await repo.create({
      projectId,
      listId: input.listId,
      email: input.email,
      name: input.name,
      firstName: input.firstName ?? null,
      lastName: input.lastName ?? null,
      fields,
      status,
    });
  } catch (e) {
    if (isUniqueViolation(e)) {
      throw new DistributorError("That email is already in this list", "conflict");
    }
    throw e;
  }

  if (input.tagIds.length > 0) await repo.setTags(created.id, input.tagIds);

  await writeAudit({
    actorUserId: actor.userId,
    projectId,
    action: "distributor.created",
    entityType: "distributor",
    entityId: created.id,
    metadata: { email: created.email, listId: input.listId },
    ipAddress: actor.ipAddress,
  });

  const full = await repo.findById(projectId, created.id);
  if (!full) throw new DistributorError("Distributor not found", "not_found");
  return full;
}

export async function updateDistributor(
  projectId: string,
  id: string,
  input: UpdateDistributorInput,
  actor: Actor,
): Promise<DistributorWithTags> {
  const accessible = await getAccessibleProject(projectId, actor.userId);
  if (!accessible) throw new DistributorError("Project not found", "not_found");
  const existing = await repo.findById(projectId, id);

  if (!existing) throw new DistributorError("Distributor not found", "not_found");

  const defs = await customFields.fieldDefs(projectId, actor.userId);
  const fields = prepareFields(defs, input.fields);

  try {
    const updated = await repo.update(projectId, id, {
      email: input.email,
      name: input.name,
      firstName: input.firstName ?? null,
      lastName: input.lastName ?? null,
      fields,
    });
    if (!updated) throw new DistributorError("Distributor not found", "not_found");
  } catch (e) {
    if (isUniqueViolation(e)) {
      throw new DistributorError("That email is already in this list", "conflict");
    }
    throw e;
  }

  await repo.setTags(id, input.tagIds);

  await writeAudit({
    actorUserId: actor.userId,
    projectId,
    action: "distributor.updated",
    entityType: "distributor",
    entityId: id,
    metadata: { email: input.email },
    ipAddress: actor.ipAddress,
  });

  const full = await repo.findById(projectId, id);
  if (!full) throw new DistributorError("Distributor not found", "not_found");
  return full;
}

/* ---- Bulk actions ----------------------------------------------------- */

export async function bulkAction(
  projectId: string,
  input: BulkActionInput,
  actor: Actor,
): Promise<number> {
  const accessible = await getAccessibleProject(projectId, actor.userId);
  if (!accessible) throw new DistributorError("Project not found", "not_found");
  let affected = 0;


  switch (input.action) {
    case "archive":
      affected = await repo.setArchived(projectId, input.ids, true);
      break;
    case "unarchive":
      affected = await repo.setArchived(projectId, input.ids, false);
      break;
    case "delete":
      affected = await repo.softDelete(projectId, input.ids);
      break;
    case "restore":
      affected = await repo.restore(projectId, input.ids);
      break;
    case "tag":
      if (!input.tagId) throw new DistributorError("Choose a tag", "validation");
      affected = await repo.addTagToMany(projectId, input.ids, input.tagId);
      break;
    case "untag":
      if (!input.tagId) throw new DistributorError("Choose a tag", "validation");
      affected = await repo.removeTagFromMany(projectId, input.ids, input.tagId);
      break;
  }

  await writeAudit({
    actorUserId: actor.userId,
    projectId,
    action: `distributor.bulk_${input.action}`,
    entityType: "distributor",
    metadata: { count: affected, tagId: input.tagId ?? null },
    ipAddress: actor.ipAddress,
  });

  return affected;
}

/* ---- Export ----------------------------------------------------------- */

export async function exportCsv(
  projectId: string,
  query: ListDistributorsQuery,
  userId: string,
): Promise<{ filename: string; csv: string }> {
  const accessible = await getAccessibleProject(projectId, userId);
  if (!accessible) throw new DistributorError("Project not found", "not_found");
  const [rows, defs] = await Promise.all([

    repo.listForExport(projectId, query),
    customFields.fieldDefs(projectId, userId),
  ]);

  const records = rows.map((r) => {
    const base: Record<string, string> = {
      email: r.email,
      name: r.name,
      first_name: r.firstName ?? "",
      last_name: r.lastName ?? "",
      status: r.status,
      tags: r.tags.map((t) => t.name).join(", "),
    };
    for (const def of defs) base[def.key] = r.fields[def.key] ?? "";
    return base;
  });

  const columns = [
    "email",
    "name",
    "first_name",
    "last_name",
    "status",
    "tags",
    ...defs.map((d) => d.key),
  ];
  const csv = Papa.unparse({ fields: columns, data: records });
  return { filename: `distributors-${query.view}.csv`, csv };
}

/* ---- Import ----------------------------------------------------------- */

export interface ImportPreview {
  headers: string[];
  mapping: ImportMapping;
  rows: ClassifiedRow[];
  summary: ImportSummary;
  fieldDefs: FieldDef[];
}

export async function previewImport(
  projectId: string,
  listId: string,
  fileText: string,
  userId: string,
  mapping?: ImportMapping,
): Promise<ImportPreview> {
  const accessible = await getAccessibleProject(projectId, userId);
  if (!accessible) throw new DistributorError("Project not found", "not_found");
  await assertListInProject(projectId, listId);


  const parsed = parseCsv(fileText);
  const defs = await customFields.fieldDefs(projectId, userId);
  const resolved = mapping ?? suggestMapping(parsed.headers, defs);

  const [existing, other] = await Promise.all([
    repo.emailsInList(listId),
    repo.emailsInOtherLists(projectId, listId),
  ]);

  const { rows, summary } = classifyRows(
    parsed,
    resolved,
    defs,
    new Set(existing.map((e) => e.toLowerCase())),
    new Set(other.map((e) => e.toLowerCase())),
  );

  return { headers: parsed.headers, mapping: resolved, rows, summary, fieldDefs: defs };
}

export interface ImportResult {
  inserted: number;
  updated: number;
  duplicate: number;
  invalid: number;
  total: number;
  status: "completed" | "partial" | "failed";
}

export async function commitImport(
  projectId: string,
  input: CommitImportInput,
  fileText: string,
  actor: Actor,
): Promise<ImportResult> {
  const accessible = await getAccessibleProject(projectId, actor.userId);
  if (!accessible) throw new DistributorError("Project not found", "not_found");
  await assertListInProject(projectId, input.listId);


  const parsed = parseCsv(fileText);
  const defs = await customFields.fieldDefs(projectId, actor.userId);

  const [existing, other, suppressedList] = await Promise.all([
    repo.emailsInList(input.listId),
    repo.emailsInOtherLists(projectId, input.listId),
    repo.suppressedEmails(projectId),
  ]);

  const { rows: classified, summary } = classifyRows(
    parsed,
    input.mapping,
    defs,
    new Set(existing.map((e) => e.toLowerCase())),
    new Set(other.map((e) => e.toLowerCase())),
  );

  const { inserts, updates } = selectForCommit(
    classified,
    new Set(input.excludedRows),
    input.duplicatePolicy,
  );

  const suppressed = new Set(suppressedList);
  const insertRows: InsertDistributor[] = inserts.map((r) => ({
    projectId,
    listId: input.listId,
    email: r.email,
    name: r.name,
    firstName: r.firstName,
    lastName: r.lastName,
    fields: r.fields,
    // A brand-new contact already on the project suppression list is never
    // created as subscribed; the send pipeline re-checks suppressions too.
    status: suppressed.has(r.email) ? "unsubscribed" : "subscribed",
  }));

  let inserted = 0;
  let updated = 0;
  await db.transaction(async (tx) => {
    inserted = await repo.insertMany(insertRows, tx);
    updated = await repo.updateManyByEmail(input.listId, updates, tx);
  });

  const success = inserted + updated;
  const status: ImportResult["status"] =
    success === 0 && summary.total > 0 ? "failed" : summary.invalid > 0 ? "partial" : "completed";

  await importRepo.recordImport({
    projectId,
    listId: input.listId,
    filename: input.filename,
    status,
    totalRows: summary.total,
    successCount: success,
    failureCount: summary.invalid,
    duplicateCount: summary.duplicate,
    createdBy: actor.userId,
  });

  await writeAudit({
    actorUserId: actor.userId,
    projectId,
    action: "distributor.imported",
    entityType: "distributor_list",
    entityId: input.listId,
    metadata: { filename: input.filename, inserted, updated, duplicate: summary.duplicate, invalid: summary.invalid },
    ipAddress: actor.ipAddress,
  });

  return { inserted, updated, duplicate: summary.duplicate, invalid: summary.invalid, total: summary.total, status };
}
