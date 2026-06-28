import PgBoss from "pg-boss";
import { env } from "@/env";

/**
 * pg-boss runs on the existing Postgres (architecture §7) — no Redis. The web
 * process enqueues; the worker process consumes. A single lazily-started
 * singleton is shared within each process.
 */
import { logStorage } from "@/lib/logger";

let boss: PgBoss | null = null;
let starting: Promise<PgBoss> | null = null;

export async function getBoss(): Promise<PgBoss> {
  if (boss) return boss;
  if (starting) return starting;

  starting = (async () => {
    const instance = new PgBoss({ connectionString: env.DATABASE_URL });
    instance.on("error", (err) => console.error("[pg-boss]", err));
    await instance.start();

    // Automatically propagate correlationId to all enqueued jobs
    const originalSend = instance.send.bind(instance);
    /* eslint-disable @typescript-eslint/no-explicit-any */
    instance.send = (async (name: string, data: Record<string, unknown> | null, options: unknown) => {
      const store = logStorage.getStore();
      if (store?.correlationId && data && typeof data === "object") {
        if (!data.correlationId) {
          (data as Record<string, unknown>).correlationId = store.correlationId;
        }
      }
      return originalSend(name, data as any, options as any);
    }) as any;
    /* eslint-enable @typescript-eslint/no-explicit-any */

    boss = instance;
    return instance;
  })();

  return starting;
}

export async function stopBoss(): Promise<void> {
  if (boss) {
    await boss.stop({ graceful: true });
    boss = null;
    starting = null;
  }
}
