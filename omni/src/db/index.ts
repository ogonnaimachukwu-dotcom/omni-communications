import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { env } from "@/env";
import * as schema from "./schema";
import * as authSchema from "./auth-schema";

// Single shared connection pool for the whole process (web or worker).
const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

export const db = drizzle(pool, {
  schema: { ...schema, ...authSchema },
  casing: "snake_case",
});

export async function closeDatabase(): Promise<void> {
  await pool.end();
}

// A Drizzle transaction handle, derived from db.transaction's callback arg.
export type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

// Repositories accept either the pooled client or an open transaction, so the
// same query functions compose inside db.transaction(...) without casts.
export type DB = typeof db | Transaction;
