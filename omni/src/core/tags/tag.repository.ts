import { eq, and, sql } from "drizzle-orm";
import { db as defaultDb, type DB } from "@/db";
import { tags, distributorTags } from "@/db/schema";

export type TagRow = typeof tags.$inferSelect;

export interface TagWithCount extends TagRow {
  count: number;
}

export async function findAll(projectId: string, conn: DB = defaultDb): Promise<TagRow[]> {
  return conn
    .select()
    .from(tags)
    .where(eq(tags.projectId, projectId))
    .orderBy(tags.name);
}

export async function findAllWithCounts(
  projectId: string,
  conn: DB = defaultDb,
): Promise<TagWithCount[]> {
  const all = await findAll(projectId, conn);
  const counts = await conn
    .select({
      tagId: distributorTags.tagId,
      count: sql<number>`count(*)::int`,
    })
    .from(distributorTags)
    .innerJoin(tags, eq(distributorTags.tagId, tags.id))
    .where(eq(tags.projectId, projectId))
    .groupBy(distributorTags.tagId);

  const countMap = new Map(counts.map((c) => [c.tagId, c.count]));
  return all.map((t) => ({ ...t, count: countMap.get(t.id) ?? 0 }));
}

export async function findById(projectId: string, id: string, conn: DB = defaultDb) {
  const [row] = await conn
    .select()
    .from(tags)
    .where(and(eq(tags.id, id), eq(tags.projectId, projectId)));
  return row ?? null;
}

export async function create(
  input: typeof tags.$inferInsert,
  conn: DB = defaultDb,
) {
  const [row] = await conn.insert(tags).values(input).returning();
  return row;
}

export async function update(
  projectId: string,
  id: string,
  data: Partial<Pick<typeof tags.$inferInsert, "name" | "color">>,
  conn: DB = defaultDb,
) {
  const [row] = await conn
    .update(tags)
    .set(data)
    .where(and(eq(tags.id, id), eq(tags.projectId, projectId)))
    .returning();
  return row ?? null;
}

export async function remove(projectId: string, id: string, conn: DB = defaultDb) {
  const [row] = await conn
    .delete(tags)
    .where(and(eq(tags.id, id), eq(tags.projectId, projectId)))
    .returning();
  return row ?? null;
}
