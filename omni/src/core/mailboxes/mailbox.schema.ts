import { z } from "zod";

export const mailboxProviderSchema = z.enum(["gmail", "outlook"]);
export const mailboxStatusSchema = z.enum(["active", "invalid", "paused"]);

export const mailboxSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  email: z.string().email(),
  provider: mailboxProviderSchema,
  status: mailboxStatusSchema,
  credentials: z.string(), // SealedSecret encrypted JSON string
  tokenExpiresAt: z.date().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
  lastSyncedAt: z.date().nullable(),
  syncCursor: z.string().nullable(),
});

export const createMailboxInputSchema = z.object({
  projectId: z.string().uuid(),
  email: z.string().email(),
  provider: mailboxProviderSchema,
  credentials: z.string(), // SealedSecret string
  tokenExpiresAt: z.date().optional(),
});

export const updateMailboxStatusInputSchema = z.object({
  status: mailboxStatusSchema,
});

export type Mailbox = z.infer<typeof mailboxSchema>;
export type CreateMailboxInput = z.infer<typeof createMailboxInputSchema>;
export type UpdateMailboxStatusInput = z.infer<typeof updateMailboxStatusInputSchema>;
