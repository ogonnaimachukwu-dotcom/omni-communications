import { and, count, desc, eq, ilike, inArray, isNull, isNotNull, or, sql } from "drizzle-orm";
import { db as defaultDb, type DB } from "@/db";
import { trace } from "@/lib/tracing";
import {
  projects,
  projectMembers,
  distributors,
  campaigns,
  campaignRecipients,
} from "@/db/schema";
import type {
  CreateProjectInput,
  UpdateProjectInput,
  ListProjectsQuery,
  ProjectStatus,
} from "./project.schema";

/**
 * Data-access for projects. Enforces user-scoping at the database boundary to
 * prevent bypass / IDOR vulnerabilities.
 */

export type ProjectRow = typeof projects.$inferSelect;

export interface ProjectStats {
  totalDistributors: number;
  totalCampaigns: number;
  emailsSent: number;
  lastCampaignAt: Date | string | null;
}

export interface PagedProjects {
  items: ProjectRow[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
}

/** Map optional form fields to explicit null so empties clear the column. */
function toColumns(input: CreateProjectInput | UpdateProjectInput) {
  return {
    name: input.name,
    companyName: input.companyName ?? null,
    ceoName: input.ceoName ?? null,
    notes: input.notes ?? null,
    status: input.status,
  };
}

export async function create(
  input: CreateProjectInput & { ownerId: string },
  db: DB = defaultDb,
): Promise<ProjectRow> {
  return db.transaction(async (tx) => {
    const [project] = await tx.insert(projects).values(toColumns(input)).returning();
    await tx.insert(projectMembers).values({
      projectId: project.id,
      userId: input.ownerId,
      role: "owner",
    });
    return project;
  });
}

export async function findAccessibleProject(
  id: string,
  userId: string,
  opts: { includeDeleted?: boolean } = {},
  db: DB = defaultDb,
): Promise<ProjectRow | null> {
  return trace("db.findAccessibleProject", async () => {
    const conditions = [
      eq(projects.id, id),
      eq(projectMembers.userId, userId),
    ];
    if (!opts.includeDeleted) {
      conditions.push(isNull(projects.deletedAt));
    }
    const [row] = await db
      .select({
        id: projects.id,
        name: projects.name,
        ceoName: projects.ceoName,
        companyName: projects.companyName,
        notes: projects.notes,
        status: projects.status,
        createdAt: projects.createdAt,
        updatedAt: projects.updatedAt,
        deletedAt: projects.deletedAt,
      })
      .from(projects)
      .innerJoin(projectMembers, eq(projects.id, projectMembers.projectId))
      .where(and(...conditions))
      .limit(1);
    return row ?? null;
  });
}

export async function isMember(
  projectId: string,
  userId: string,
  db: DB = defaultDb,
): Promise<boolean> {
  const [row] = await db
    .select({ count: count() })
    .from(projectMembers)
    .where(
      and(
        eq(projectMembers.projectId, projectId),
        eq(projectMembers.userId, userId),
      ),
    );
  return (row?.count ?? 0) > 0;
}

export async function checkProjectExistsOnly(
  id: string,
  db: DB = defaultDb,
): Promise<boolean> {
  const [row] = await db
    .select({ count: count() })
    .from(projects)
    .where(and(eq(projects.id, id), isNull(projects.deletedAt)));
  return (row?.count ?? 0) > 0;
}

export async function update(
  id: string,
  userId: string,
  input: UpdateProjectInput,
  db: DB = defaultDb,
): Promise<ProjectRow | null> {
  const accessible = await findAccessibleProject(id, userId, {}, db);
  if (!accessible) return null;

  const [row] = await db
    .update(projects)
    .set(toColumns(input))
    .where(and(eq(projects.id, id), isNull(projects.deletedAt)))
    .returning();
  return row ?? null;
}

export async function setStatus(
  id: string,
  userId: string,
  status: ProjectStatus,
  db: DB = defaultDb,
): Promise<ProjectRow | null> {
  const accessible = await findAccessibleProject(id, userId, {}, db);
  if (!accessible) return null;

  const [row] = await db
    .update(projects)
    .set({ status })
    .where(and(eq(projects.id, id), isNull(projects.deletedAt)))
    .returning();
  return row ?? null;
}

export async function softDelete(
  id: string,
  userId: string,
  db: DB = defaultDb,
): Promise<ProjectRow | null> {
  const accessible = await findAccessibleProject(id, userId, {}, db);
  if (!accessible) return null;

  const [row] = await db
    .update(projects)
    .set({ deletedAt: new Date() })
    .where(and(eq(projects.id, id), isNull(projects.deletedAt)))
    .returning();
  return row ?? null;
}

export async function restore(
  id: string,
  userId: string,
  db: DB = defaultDb,
): Promise<ProjectRow | null> {
  const accessible = await findAccessibleProject(id, userId, { includeDeleted: true }, db);
  if (!accessible) return null;

  const [row] = await db
    .update(projects)
    .set({ deletedAt: null })
    .where(and(eq(projects.id, id), isNotNull(projects.deletedAt)))
    .returning();
  return row ?? null;
}

export async function list(
  query: ListProjectsQuery,
  userId: string,
  db: DB = defaultDb,
): Promise<PagedProjects> {
  const { q, status, trash, page, pageSize } = query;

  const conditions = [
    trash ? isNotNull(projects.deletedAt) : isNull(projects.deletedAt),
    eq(projectMembers.userId, userId),
  ];
  if (status) conditions.push(eq(projects.status, status));
  if (q) {
    const pattern = `%${q}%`;
    const match = or(
      ilike(projects.name, pattern),
      ilike(projects.companyName, pattern),
      ilike(projects.ceoName, pattern),
    );
    if (match) conditions.push(match);
  }
  const where = and(...conditions);

  const [{ value: total }] = await db
    .select({ value: count() })
    .from(projects)
    .innerJoin(projectMembers, eq(projects.id, projectMembers.projectId))
    .where(where);

  const items = await db
    .select({
      id: projects.id,
      name: projects.name,
      ceoName: projects.ceoName,
      companyName: projects.companyName,
      notes: projects.notes,
      status: projects.status,
      createdAt: projects.createdAt,
      updatedAt: projects.updatedAt,
      deletedAt: projects.deletedAt,
    })
    .from(projects)
    .innerJoin(projectMembers, eq(projects.id, projectMembers.projectId))
    .where(where)
    .orderBy(desc(projects.updatedAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  return {
    items,
    total,
    page,
    pageSize,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
  };
}


/**
 * KPI rollups for the detail page. These query the dependent tables that
 * already exist in the Batch 1 schema, so the numbers are real — they read 0
 * until the distributor/campaign/send modules populate those tables, then
 * light up automatically. No placeholder values required.
 */
export async function stats(projectId: string, db: DB = defaultDb): Promise<ProjectStats> {
  const [{ value: totalDistributors }] = await db
    .select({ value: count() })
    .from(distributors)
    .where(eq(distributors.projectId, projectId));

  const [{ value: totalCampaigns }] = await db
    .select({ value: count() })
    .from(campaigns)
    .where(and(eq(campaigns.projectId, projectId), isNull(campaigns.deletedAt)));

  const [{ value: emailsSent }] = await db
    .select({ value: count() })
    .from(campaignRecipients)
    .where(
      and(
        eq(campaignRecipients.projectId, projectId),
        inArray(campaignRecipients.status, ["sent", "delivered"]),
      ),
    );

  const [lastCampaign] = await db
    .select({
      at: sql<Date | string | null>`max(coalesce(${campaigns.sentAt}, ${campaigns.createdAt}))`,
    })
    .from(campaigns)
    .where(and(eq(campaigns.projectId, projectId), isNull(campaigns.deletedAt)));

  return {
    totalDistributors,
    totalCampaigns,
    emailsSent,
    lastCampaignAt: lastCampaign?.at ?? null,
  };
}
