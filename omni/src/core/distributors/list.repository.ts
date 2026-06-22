import { eq, and, isNull, sql } from "drizzle-orm";
import { db as defaultDb, type DB } from "@/db";
import { distributorLists, distributors } from "@/db/schema";

export type ListRow = typeof distributorLists.$inferSelect;

export interface ListWithCount extends ListRow {
  count: number;
}

export async function findAll(
  projectId: string,
  conn: DB = defaultDb,
): Promise<ListRow[]> {
  return conn
    .select()
    .from(distributorLists)
    .where(and(eq(distributorLists.projectId, projectId), isNull(distributorLists.deletedAt)))
    .orderBy(distributorLists.name);
}

export async function findAllWithCounts(
  projectId: string,
  conn: DB = defaultDb,
): Promise<ListWithCount[]> {
  const lists = await findAll(projectId, conn);
  const counts = await conn
    .select({
      listId: distributors.listId,
      count: sql<number>`count(*)::int`,
    })
    .from(distributors)
    .where(and(eq(distributors.projectId, projectId), isNull(distributors.deletedAt)))
    .groupBy(distributors.listId);

  const countMap = new Map(counts.map((c) => [c.listId, c.count]));
  return lists.map((l) => ({ ...l, count: countMap.get(l.id) ?? 0 }));
}

export async function findById(
  projectId: string,
  id: string,
  conn: DB = defaultDb,
): Promise<ListRow | null> {
  const [row] = await conn
    .select()
    .from(distributorLists)
    .where(
      and(
        eq(distributorLists.id, id),
        eq(distributorLists.projectId, projectId),
        isNull(distributorLists.deletedAt),
      ),
    );
  return row ?? null;
}

export async function create(
  input: typeof distributorLists.$inferInsert,
  conn: DB = defaultDb,
) {
  const [row] = await conn.insert(distributorLists).values(input).returning();
  return row;
}

export async function update(
  projectId: string,
  id: string,
  data: Partial<Pick<typeof distributorLists.$inferInsert, "name" | "description">>,
  conn: DB = defaultDb,
) {
  const [row] = await conn
    .update(distributorLists)
    .set(data)
    .where(and(eq(distributorLists.id, id), eq(distributorLists.projectId, projectId)))
    .returning();
  return row ?? null;
}

export async function softDelete(projectId: string, id: string, conn: DB = defaultDb) {
  const [row] = await conn
    .update(distributorLists)
    .set({ deletedAt: new Date() })
    .where(
      and(
        eq(distributorLists.id, id),
        eq(distributorLists.projectId, projectId),
        isNull(distributorLists.deletedAt),
      ),
    )
    .returning();
  return row ?? null;
}
