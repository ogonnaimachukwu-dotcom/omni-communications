import { AsyncLocalStorage } from "async_hooks";
import { randomUUID } from "crypto";
import { logger } from "./logger";

export interface Span {
  id: string;
  name: string;
  startTime: number;
  parentId?: string;
}

export const traceStorage = new AsyncLocalStorage<Span>();

export async function trace<T>(name: string, fn: (span: Span) => Promise<T>): Promise<T> {
  const parentSpan = traceStorage.getStore();
  const span: Span = {
    id: randomUUID(),
    name,
    startTime: Date.now(),
    parentId: parentSpan?.id,
  };

  return traceStorage.run(span, async () => {
    try {
      const result = await fn(span);
      const durationMs = Date.now() - span.startTime;
      logger.info(`[Trace] ${name} completed`, {
        spanName: name,
        spanId: span.id,
        parentSpanId: span.parentId,
        durationMs,
        success: true,
      });
      return result;
    } catch (err) {
      const durationMs = Date.now() - span.startTime;
      logger.error(`[Trace] ${name} failed`, {
        spanName: name,
        spanId: span.id,
        parentSpanId: span.parentId,
        durationMs,
        success: false,
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  });
}
