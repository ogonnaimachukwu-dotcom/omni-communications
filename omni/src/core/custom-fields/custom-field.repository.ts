import { eq, and } from "drizzle-orm";
import { db as defaultDb, type DB } from "@/db";
import { customFieldDefinitions } from "@/db/schema";

export type CustomFieldRow = typeof customFieldDefinitions.$inferSelect;

export async function findAll(
  projectId: string,
  conn: DB = defaultDb,
): Promise<CustomFieldRow[]> {
  return conn
    .select()
    .from(customFieldDefinitions)
    .where(eq(customFieldDefinitions.projectId, projectId))
    .orderBy(customFieldDefinitions.position, customFieldDefinitions.key);
}

export async function findById(
  projectId: string,
  id: string,
  conn: DB = defaultDb,
): Promise<CustomFieldRow | null> {
  const [row] = await conn
    .select()
    .from(customFieldDefinitions)
    .where(
      and(
        eq(customFieldDefinitions.id, id),
        eq(customFieldDefinitions.projectId, projectId),
      ),
    );
  return row ?? null;
}

export async function create(
  input: typeof customFieldDefinitions.$inferInsert,
  conn: DB = defaultDb,
) {
  const [row] = await conn.insert(customFieldDefinitions).values(input).returning();
  return row;
}

export async function update(
  projectId: string,
  id: string,
  data: Partial<Pick<typeof customFieldDefinitions.$inferInsert, "label" | "type" | "options">>,
  conn: DB = defaultDb,
) {
  const [row] = await conn
    .update(customFieldDefinitions)
    .set(data)
    .where(
      and(
        eq(customFieldDefinitions.id, id),
        eq(customFieldDefinitions.projectId, projectId),
      ),
    )
    .returning();
  return row ?? null;
}

export async function remove(projectId: string, id: string, conn: DB = defaultDb) {
  const [row] = await conn
    .delete(customFieldDefinitions)
    .where(
      and(
        eq(customFieldDefinitions.id, id),
        eq(customFieldDefinitions.projectId, projectId),
      ),
    )
    .returning();
  return row ?? null;
}
