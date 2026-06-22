import { eq, and, sql, ilike, or, isNull, isNotNull, inArray, desc, asc } from "drizzle-orm";
import { db as defaultDb, type DB } from "@/db";
import {
  distributors,
  distributorTags,
  tags,
  suppressions,
} from "@/db/schema";
import type { ListDistributorsQuery } from "./distributor.schema";

/* ---- Types ------------------------------------------------------------ */

export type DistributorRow = typeof distributors.$inferSelect;
export type InsertDistributor = typeof distributors.$inferInsert;

export interface DistributorWithTags extends DistributorRow {
  tags: { id: string; name: string; color: string | null }[];
}

export interface PagedDistributors {
  items: DistributorWithTags[];
  total: number;
  page: number;
  pageCount: number;
}

/* ---- Reads ------------------------------------------------------------ */

export async function findById(
  projectId: string,
  id: string,
  conn: DB = defaultDb,
): Promise<DistributorWithTags | null> {
  const rows = await conn
    .select()
    .from(distributors)
    .where(and(eq(distributors.id, id), eq(distributors.projectId, projectId)));
  if (rows.length === 0) return null;
  const row = rows[0];
  const rowTags = await conn
    .select({ id: tags.id, name: tags.name, color: tags.color })
    .from(distributorTags)
    .innerJoin(tags, eq(distributorTags.tagId, tags.id))
    .where(eq(distributorTags.distributorId, id));
  return { ...row, tags: rowTags };
}

export async function list(
  projectId: string,
  query: ListDistributorsQuery,
  conn: DB = defaultDb,
): Promise<PagedDistributors> {
  const conditions = [eq(distributors.projectId, projectId)];

  if (query.view === "trash") {
    conditions.push(isNotNull(distributors.deletedAt));
  } else if (query.view === "archived") {
    conditions.push(isNull(distributors.deletedAt));
    conditions.push(isNotNull(distributors.archivedAt));
  } else {
    conditions.push(isNull(distributors.deletedAt));
    conditions.push(isNull(distributors.archivedAt));
  }

  if (query.listId) conditions.push(eq(distributors.listId, query.listId));
  if (query.subscription) conditions.push(eq(distributors.status, query.subscription));
  if (query.q) {
    const pattern = `%${query.q}%`;
    conditions.push(
      or(ilike(distributors.name, pattern), ilike(distributors.email, pattern))!,
    );
  }

  const where = and(...conditions)!;
  const [countResult] = await conn
    .select({ count: sql<number>`count(*)::int` })
    .from(distributors)
    .where(where);

  const total = countResult?.count ?? 0;
  const pageSize = query.pageSize;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(query.page, pageCount);
  const offset = (page - 1) * pageSize;

  // tag filtering: pre-fetch IDs matching the tag, then filter
  if (query.tagId) {
    const taggedIds = await conn
      .select({ distributorId: distributorTags.distributorId })
      .from(distributorTags)
      .where(eq(distributorTags.tagId, query.tagId));
    const idSet = taggedIds.map((t) => t.distributorId);
    if (idSet.length === 0) {
      return { items: [], total: 0, page: 1, pageCount: 1 };
    }
    conditions.push(inArray(distributors.id, idSet));
    // Recompute count/pagination with tag filter
    const [recount] = await conn
      .select({ count: sql<number>`count(*)::int` })
      .from(distributors)
      .where(and(...conditions)!);
    const filteredTotal = recount?.count ?? 0;
    const filteredPageCount = Math.max(1, Math.ceil(filteredTotal / pageSize));
    const filteredPage = Math.min(query.page, filteredPageCount);
    const filteredOffset = (filteredPage - 1) * pageSize;

    const filteredRows = await conn
      .select()
      .from(distributors)
      .where(and(...conditions)!)
      .orderBy(desc(distributors.createdAt))
      .limit(pageSize)
      .offset(filteredOffset);

    const ids = filteredRows.map((r) => r.id);
    const allTags =
      ids.length > 0
        ? await conn
            .select({
              distributorId: distributorTags.distributorId,
              id: tags.id,
              name: tags.name,
              color: tags.color,
            })
            .from(distributorTags)
            .innerJoin(tags, eq(distributorTags.tagId, tags.id))
            .where(inArray(distributorTags.distributorId, ids))
        : [];

    const tagMap = new Map<string, { id: string; name: string; color: string | null }[]>();
    for (const t of allTags) {
      const arr = tagMap.get(t.distributorId) ?? [];
      arr.push({ id: t.id, name: t.name, color: t.color });
      tagMap.set(t.distributorId, arr);
    }

    return {
      items: filteredRows.map((r) => ({ ...r, tags: tagMap.get(r.id) ?? [] })),
      total: filteredTotal,
      page: filteredPage,
      pageCount: filteredPageCount,
    };
  }

  const rows = await conn
    .select()
    .from(distributors)
    .where(where)
    .orderBy(desc(distributors.createdAt))
    .limit(pageSize)
    .offset(offset);

  // Fetch tags for all returned distributors
  const ids = rows.map((r) => r.id);
  const allTags =
    ids.length > 0
      ? await conn
          .select({
            distributorId: distributorTags.distributorId,
            id: tags.id,
            name: tags.name,
            color: tags.color,
          })
          .from(distributorTags)
          .innerJoin(tags, eq(distributorTags.tagId, tags.id))
          .where(inArray(distributorTags.distributorId, ids))
      : [];

  const tagMap = new Map<string, { id: string; name: string; color: string | null }[]>();
  for (const t of allTags) {
    const arr = tagMap.get(t.distributorId) ?? [];
    arr.push({ id: t.id, name: t.name, color: t.color });
    tagMap.set(t.distributorId, arr);
  }

  const items: DistributorWithTags[] = rows.map((r) => ({
    ...r,
    tags: tagMap.get(r.id) ?? [],
  }));

  return { items, total, page, pageCount };
}

/** Full list of distributors for CSV export (no pagination). */
export async function listForExport(
  projectId: string,
  query: ListDistributorsQuery,
  conn: DB = defaultDb,
) {
  const conditions = [eq(distributors.projectId, projectId)];
  if (query.view === "trash") conditions.push(isNotNull(distributors.deletedAt));
  else if (query.view === "archived") {
    conditions.push(isNull(distributors.deletedAt), isNotNull(distributors.archivedAt));
  } else {
    conditions.push(isNull(distributors.deletedAt), isNull(distributors.archivedAt));
  }
  if (query.listId) conditions.push(eq(distributors.listId, query.listId));
  if (query.subscription) conditions.push(eq(distributors.status, query.subscription));

  const rows = await conn
    .select()
    .from(distributors)
    .where(and(...conditions)!)
    .orderBy(asc(distributors.email));

  const ids = rows.map((r) => r.id);
  const allTags =
    ids.length > 0
      ? await conn
          .select({
            distributorId: distributorTags.distributorId,
            id: tags.id,
            name: tags.name,
            color: tags.color,
          })
          .from(distributorTags)
          .innerJoin(tags, eq(distributorTags.tagId, tags.id))
          .where(inArray(distributorTags.distributorId, ids))
      : [];

  const tagMap = new Map<string, { id: string; name: string; color: string | null }[]>();
  for (const t of allTags) {
    const arr = tagMap.get(t.distributorId) ?? [];
    arr.push({ id: t.id, name: t.name, color: t.color });
    tagMap.set(t.distributorId, arr);
  }

  return rows.map((r) => ({ ...r, tags: tagMap.get(r.id) ?? [] }));
}

/* ---- Writes ----------------------------------------------------------- */

export async function create(input: InsertDistributor, conn: DB = defaultDb) {
  const [row] = await conn.insert(distributors).values(input).returning();
  return row;
}

export async function update(
  projectId: string,
  id: string,
  data: Partial<Pick<InsertDistributor, "email" | "name" | "firstName" | "lastName" | "fields">>,
  conn: DB = defaultDb,
) {
  const [row] = await conn
    .update(distributors)
    .set(data)
    .where(and(eq(distributors.id, id), eq(distributors.projectId, projectId)))
    .returning();
  return row ?? null;
}

/* ---- Tags ------------------------------------------------------------- */

export async function setTags(distributorId: string, tagIds: string[], conn: DB = defaultDb) {
  await conn.delete(distributorTags).where(eq(distributorTags.distributorId, distributorId));
  if (tagIds.length > 0) {
    await conn
      .insert(distributorTags)
      .values(tagIds.map((tagId) => ({ distributorId, tagId })));
  }
}

export async function addTagToMany(
  projectId: string,
  ids: string[],
  tagId: string,
  conn: DB = defaultDb,
) {
  const existing = await conn
    .select({ distributorId: distributorTags.distributorId })
    .from(distributorTags)
    .where(and(inArray(distributorTags.distributorId, ids), eq(distributorTags.tagId, tagId)));
  const existingIds = new Set(existing.map((e) => e.distributorId));
  const toAdd = ids.filter((id) => !existingIds.has(id));
  if (toAdd.length > 0) {
    await conn
      .insert(distributorTags)
      .values(toAdd.map((distributorId) => ({ distributorId, tagId })));
  }
  return toAdd.length;
}

export async function removeTagFromMany(
  projectId: string,
  ids: string[],
  tagId: string,
  conn: DB = defaultDb,
) {
  const result = await conn
    .delete(distributorTags)
    .where(and(inArray(distributorTags.distributorId, ids), eq(distributorTags.tagId, tagId)))
    .returning();
  return result.length;
}

/* ---- Bulk mutations --------------------------------------------------- */

export async function setArchived(projectId: string, ids: string[], archived: boolean, conn: DB = defaultDb) {
  const result = await conn
    .update(distributors)
    .set({ archivedAt: archived ? new Date() : null })
    .where(and(inArray(distributors.id, ids), eq(distributors.projectId, projectId), isNull(distributors.deletedAt)))
    .returning();
  return result.length;
}

export async function softDelete(projectId: string, ids: string[], conn: DB = defaultDb) {
  const result = await conn
    .update(distributors)
    .set({ deletedAt: new Date() })
    .where(and(inArray(distributors.id, ids), eq(distributors.projectId, projectId), isNull(distributors.deletedAt)))
    .returning();
  return result.length;
}

export async function restore(projectId: string, ids: string[], conn: DB = defaultDb) {
  const result = await conn
    .update(distributors)
    .set({ deletedAt: null, archivedAt: null })
    .where(and(inArray(distributors.id, ids), eq(distributors.projectId, projectId)))
    .returning();
  return result.length;
}

/* ---- Import helpers --------------------------------------------------- */

export async function emailsInList(listId: string, conn: DB = defaultDb) {
  const rows = await conn
    .select({ email: distributors.email })
    .from(distributors)
    .where(and(eq(distributors.listId, listId), isNull(distributors.deletedAt)));
  return rows.map((r) => r.email);
}

export async function emailsInOtherLists(projectId: string, listId: string, conn: DB = defaultDb) {
  const rows = await conn
    .select({ email: distributors.email })
    .from(distributors)
    .where(
      and(
        eq(distributors.projectId, projectId),
        sql`${distributors.listId} != ${listId}`,
        isNull(distributors.deletedAt),
      ),
    );
  return rows.map((r) => r.email);
}

export async function suppressedEmails(projectId: string, conn: DB = defaultDb) {
  const rows = await conn
    .select({ email: suppressions.email })
    .from(suppressions)
    .where(eq(suppressions.projectId, projectId));
  return rows.map((r) => r.email);
}

export async function insertMany(rows: InsertDistributor[], conn: DB = defaultDb) {
  if (rows.length === 0) return 0;
  const result = await conn
    .insert(distributors)
    .values(rows)
    .onConflictDoNothing()
    .returning();
  return result.length;
}

export async function updateManyByEmail(
  listId: string,
  updates: { email: string; name: string; firstName: string | null; lastName: string | null; fields: Record<string, string> }[],
  conn: DB = defaultDb,
) {
  let count = 0;
  for (const u of updates) {
    const result = await conn
      .update(distributors)
      .set({ name: u.name, firstName: u.firstName, lastName: u.lastName, fields: u.fields })
      .where(and(eq(distributors.listId, listId), eq(distributors.email, u.email)))
      .returning();
    count += result.length;
  }
  return count;
}
