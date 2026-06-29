import { z } from "zod";

export const sendingProviderTypeSchema = z.enum(["resend", "smtp", "ses", "mailgun", "postmark"]);
export const sendingProviderStatusSchema = z.enum(["active", "invalid", "disabled"]);

export const inboxConnectionTypeSchema = z.enum(["imap", "oauth_gmail", "oauth_outlook"]);
export const inboxConnectionStatusSchema = z.enum(["active", "invalid", "disabled"]);

export const trackingProviderTypeSchema = z.enum(["resend_webhook", "postmark_webhook", "ses_sns"]);
export const trackingProviderStatusSchema = z.enum(["active", "disabled"]);

export const sendingProviderSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  name: z.string().min(1),
  type: sendingProviderTypeSchema,
  status: sendingProviderStatusSchema,
  credentials: z.string(), // SealedSecret stringified config JSON
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const createSendingProviderInputSchema = z.object({
  projectId: z.string().uuid(),
  name: z.string().min(1),
  type: sendingProviderTypeSchema,
  credentials: z.string(),
});

export const inboxConnectionSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  name: z.string().min(1),
  email: z.string().email(),
  type: inboxConnectionTypeSchema,
  host: z.string().nullable(),
  port: z.number().int().nullable(),
  tls: z.boolean().nullable(),
  status: inboxConnectionStatusSchema,
  credentials: z.string(), // SealedSecret stringified config JSON
  tokenExpiresAt: z.date().nullable(),
  lastSyncedAt: z.date().nullable(),
  syncCursor: z.string().nullable(),
  folders: z.array(z.string()).nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const createInboxConnectionInputSchema = z.object({
  projectId: z.string().uuid(),
  name: z.string().min(1),
  email: z.string().email(),
  type: inboxConnectionTypeSchema,
  host: z.string().optional(),
  port: z.number().int().optional(),
  tls: z.boolean().optional(),
  credentials: z.string(),
  tokenExpiresAt: z.date().optional(),
});


export const trackingProviderSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  name: z.string().min(1),
  type: trackingProviderTypeSchema,
  status: trackingProviderStatusSchema,
  config: z.string(), // SealedSecret
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const createTrackingProviderInputSchema = z.object({
  projectId: z.string().uuid(),
  name: z.string().min(1),
  type: trackingProviderTypeSchema,
  config: z.string(),
});

export const communicationProfileSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  name: z.string().min(1),
  sendingProviderId: z.string().uuid().nullable(),
  inboxConnectionId: z.string().uuid().nullable(),
  trackingProviderId: z.string().uuid().nullable(),
  signatureId: z.string().uuid().nullable(),
  dailyLimit: z.number().int().min(1),
  replyAlias: z.string().min(1),
  timezone: z.string().min(1),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const createCommunicationProfileInputSchema = z.object({
  projectId: z.string().uuid(),
  name: z.string().min(1),
  sendingProviderId: z.string().uuid().optional().nullable(),
  inboxConnectionId: z.string().uuid().optional().nullable(),
  trackingProviderId: z.string().uuid().optional().nullable(),
  signatureId: z.string().uuid().optional().nullable(),
  dailyLimit: z.number().int().min(1).default(500),
  replyAlias: z.string().min(1),
  timezone: z.string().min(1).default("UTC"),
});

export type SendingProvider = z.infer<typeof sendingProviderSchema>;
export type CreateSendingProviderInput = z.infer<typeof createSendingProviderInputSchema>;

export type InboxConnection = z.infer<typeof inboxConnectionSchema>;
export type CreateInboxConnectionInput = z.infer<typeof createInboxConnectionInputSchema>;

export type TrackingProvider = z.infer<typeof trackingProviderSchema>;
export type CreateTrackingProviderInput = z.infer<typeof createTrackingProviderInputSchema>;

export type CommunicationProfile = z.infer<typeof communicationProfileSchema>;
export type CreateCommunicationProfileInput = z.infer<typeof createCommunicationProfileInputSchema>;
