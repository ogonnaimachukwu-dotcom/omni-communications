import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { env } from "@/env";
import * as schema from "./schema";
import * as authSchema from "./auth-schema";

// Single shared connection pool for the whole process (web or worker).
const pool = new Pool({ connectionString: env.DATABASE_URL });

export const db = drizzle(pool, {
  schema: { ...schema, ...authSchema },
  casing: "snake_case",
});

export type DB = typeof db;
