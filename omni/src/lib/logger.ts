import { AsyncLocalStorage } from "async_hooks";
import { randomUUID } from "crypto";

export interface LogContext {
  requestId?: string;
  correlationId?: string;
  userId?: string;
  projectId?: string;
  campaignId?: string;
  mailboxId?: string;
  inboxConnectionId?: string;
  workerId?: string;
  jobId?: string;
}

export const logStorage = new AsyncLocalStorage<LogContext>();

export function getLogContext(req: Request): LogContext {
  const headers = req.headers;
  const requestId = headers.get("x-request-id") || randomUUID();
  const correlationId =
    headers.get("x-correlation-id") ||
    headers.get("x-request-id") ||
    requestId;
  
  // Try to parse authorization/user context if passed in headers
  const userId = headers.get("x-user-id") || undefined;
  const projectId = headers.get("x-project-id") || undefined;

  return {
    requestId,
    correlationId,
    userId,
    projectId,
  };
}

export const logger = {
  info(message: string, meta?: unknown) {
    this.log("info", message, meta);
  },
  warn(message: string, meta?: unknown) {
    this.log("warn", message, meta);
  },
  error(message: string, meta?: unknown) {
    this.log("error", message, meta);
  },
  debug(message: string, meta?: unknown) {
    this.log("debug", message, meta);
  },
  log(level: string, message: string, meta?: unknown) {
    const context = logStorage.getStore() || {};
    
    // Safely extract error properties if meta is an Error
    let errMeta = {};
    if (meta instanceof Error) {
      errMeta = {
        error: {
          message: meta.message,
          stack: meta.stack,
          name: meta.name,
        },
      };
    } else if (meta && typeof meta === "object") {
      errMeta = { ...meta };
    }

    const logEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      ...context,
      ...errMeta,
    };

    if (level === "error") {
      console.error(JSON.stringify(logEntry));
    } else {
      console.log(JSON.stringify(logEntry));
    }
  },
};

export function withLogging<T>(req: Request, handler: () => Promise<T>): Promise<T> {
  const context = getLogContext(req);
  return logStorage.run(context, handler);
}
