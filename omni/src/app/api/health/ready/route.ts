import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { getBoss } from "@/lib/queue";
import pkg from "../../../../../package.json";

export async function GET() {
  let dbStatus = "healthy";
  let queueStatus = "healthy";
  let statusCode = 200;

  // 1. Verify Database
  try {
    await db.execute(sql`SELECT 1`);
  } catch (err) {
    console.error("[Health Check] Database readiness check failed:", err);
    dbStatus = "unhealthy";
    statusCode = 503;
  }

  // 2. Verify Queue
  try {
    const boss = await getBoss();
    if (!boss) {
      queueStatus = "unhealthy";
      statusCode = 503;
    }
  } catch (err) {
    console.error("[Health Check] Queue readiness check failed:", err);
    queueStatus = "unhealthy";
    statusCode = 503;
  }

  return NextResponse.json(
    {
      status: statusCode === 200 ? "UP" : "DOWN",
      version: pkg.version,
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      services: {
        database: dbStatus,
        queue: queueStatus,
      },
    },
    { status: statusCode }
  );
}
