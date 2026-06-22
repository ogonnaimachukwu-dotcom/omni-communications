import { db as defaultDb, type DB } from "@/db";
import { distributorImports } from "@/db/schema";

/**
 * Persistence for committed CSV imports. The parsing/classification engine in
 * import.ts is deliberately DB-free; this is the only place an import touches
 * the database (besides the distributor inserts/updates in distributor.repository).
 */

export type ImportRow = typeof distributorImports.$inferSelect;

export interface RecordImportInput {
  projectId: string;
  listId: string;
  filename: string;
  status: "completed" | "partial" | "failed";
  totalRows: number;
  successCount: number;
  failureCount: number;
  duplicateCount: number;
  createdBy: string | null;
}

export async function recordImport(
  input: RecordImportInput,
  db: DB = defaultDb,
): Promise<ImportRow> {
  const [row] = await db
    .insert(distributorImports)
    .values({ ...input, completedAt: new Date() })
    .returning();
  return row;
}
