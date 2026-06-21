import { z } from "zod";

/**
 * Fail-fast environment validation. Imported once at process boot (web + worker).
 * If anything required is missing or malformed, the process refuses to start
 * rather than failing mysteriously deep inside a send job.
 */
const schema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("production"),
  APP_URL: z.string().url(),

  DATABASE_URL: z.string().min(1),

  BETTER_AUTH_SECRET: z.string().min(16),
  BETTER_AUTH_URL: z.string().url(),

  // 32-byte key, base64-encoded.
  ENCRYPTION_MASTER_KEY: z
    .string()
    .refine((v) => Buffer.from(v, "base64").length === 32, {
      message: "ENCRYPTION_MASTER_KEY must be 32 bytes, base64-encoded",
    }),

  RESEND_API_KEY: z.string().min(1),
  RESEND_WEBHOOK_SECRET: z.string().min(1),

  ANTHROPIC_API_KEY: z.string().min(1).optional(),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid environment configuration:");
  console.error(parsed.error.flatten().fieldErrors);
  throw new Error("Environment validation failed");
}

export const env = parsed.data;
