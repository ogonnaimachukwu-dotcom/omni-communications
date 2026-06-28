export interface ErrorMetadata {
  [key: string]: unknown;
}

/**
 * Shared base error for the application, supporting HTTP codes,
 * internal error codes, user messages, metadata payloads, and causes.
 */
export class AppError extends Error {
  public code: string;
  public statusCode: number;
  public userMessage?: string;
  public metadata?: ErrorMetadata;
  public override cause?: unknown;

  constructor(
    message: string,
    code: string,
    statusCode: number = 400,
    opts: {
      userMessage?: string;
      metadata?: ErrorMetadata;
      cause?: unknown;
    } = {}
  ) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.statusCode = statusCode;
    this.userMessage = opts.userMessage;
    this.metadata = opts.metadata;
    this.cause = opts.cause;

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}
