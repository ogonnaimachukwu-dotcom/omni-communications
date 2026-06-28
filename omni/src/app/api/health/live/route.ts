import { NextResponse } from "next/server";
import pkg from "../../../../../package.json";

export async function GET() {
  return NextResponse.json({
    status: "UP",
    version: pkg.version,
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
}
