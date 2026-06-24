import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { mailboxes } from "@/db/schema";
import type { CreateMailboxInput } from "./mailbox.schema";

export type MailboxRow = typeof mailboxes.$inferSelect;

export async function findById(id: string): Promise<MailboxRow | null> {
  const [row] = await db
    .select()
    .from(mailboxes)
    .where(eq(mailboxes.id, id))
    .limit(1);
  return row ?? null;
}

export async function findByEmail(projectId: string, email: string): Promise<MailboxRow | null> {
  const [row] = await db
    .select()
    .from(mailboxes)
    .where(and(eq(mailboxes.projectId, projectId), eq(mailboxes.email, email)))
    .limit(1);
  return row ?? null;
}

export async function listByProject(projectId: string): Promise<MailboxRow[]> {
  return db
    .select()
    .from(mailboxes)
    .where(eq(mailboxes.projectId, projectId));
}

export async function listActive(): Promise<MailboxRow[]> {
  return db
    .select()
    .from(mailboxes)
    .where(eq(mailboxes.status, "active"));
}

export async function create(input: CreateMailboxInput): Promise<MailboxRow> {
  const [row] = await db
    .insert(mailboxes)
    .values({
      projectId: input.projectId,
      email: input.email,
      provider: input.provider,
      credentials: input.credentials,
      tokenExpiresAt: input.tokenExpiresAt ?? null,
    })
    .returning();
  return row;
}

export async function update(id: string, patch: Partial<Omit<MailboxRow, "id" | "projectId" | "createdAt">>): Promise<MailboxRow | null> {
  const [row] = await db
    .update(mailboxes)
    .set({
      ...patch,
      updatedAt: new Date(),
    })
    .where(eq(mailboxes.id, id))
    .returning();
  return row ?? null;
}

export async function remove(id: string): Promise<MailboxRow | null> {
  const [row] = await db
    .delete(mailboxes)
    .where(eq(mailboxes.id, id))
    .returning();
  return row ?? null;
}
