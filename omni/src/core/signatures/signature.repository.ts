import { and, eq, desc } from "drizzle-orm";
import { db as defaultDb, type DB } from "@/db";
import { signatures } from "@/db/schema";
import type { CreateSignatureInput, UpdateSignatureInput } from "./signature.schema";

export type SignatureRow = typeof signatures.$inferSelect;

export function listByProject(projectId: string, conn: DB = defaultDb): Promise<SignatureRow[]> {
  return conn
    .select()
    .from(signatures)
    .where(eq(signatures.projectId, projectId))
    .orderBy(desc(signatures.isDefault), desc(signatures.createdAt));
}

export async function findById(
  projectId: string,
  id: string,
  conn: DB = defaultDb,
): Promise<SignatureRow | null> {
  const [row] = await conn
    .select()
    .from(signatures)
    .where(and(eq(signatures.projectId, projectId), eq(signatures.id, id)))
    .limit(1);
  return row ?? null;
}

async function clearDefault(projectId: string, conn: DB) {
  await conn
    .update(signatures)
    .set({ isDefault: false })
    .where(eq(signatures.projectId, projectId));
}

export async function create(
  projectId: string,
  input: CreateSignatureInput,
  conn: DB = defaultDb,
): Promise<SignatureRow> {
  if (input.isDefault) await clearDefault(projectId, conn);
  const [row] = await conn
    .insert(signatures)
    .values({ projectId, name: input.name, html: input.html, isDefault: input.isDefault })
    .returning();
  return row;
}

export async function update(
  projectId: string,
  id: string,
  input: UpdateSignatureInput,
  conn: DB = defaultDb,
): Promise<SignatureRow | null> {
  if (input.isDefault) await clearDefault(projectId, conn);
  const [row] = await conn
    .update(signatures)
    .set({ name: input.name, html: input.html, isDefault: input.isDefault })
    .where(and(eq(signatures.projectId, projectId), eq(signatures.id, id)))
    .returning();
  return row ?? null;
}

export async function remove(projectId: string, id: string, conn: DB = defaultDb): Promise<void> {
  await conn.delete(signatures).where(and(eq(signatures.projectId, projectId), eq(signatures.id, id)));
}
