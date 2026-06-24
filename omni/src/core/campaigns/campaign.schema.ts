import { z } from "zod";

export const idSchema = z.string().uuid("Invalid campaign");

const optionalUuid = z
  .string()
  .uuid()
  .optional()
  .or(z.literal("").transform(() => undefined))
  .catch(undefined);

export const createCampaignSchema = z.object({
  subject: z.string().trim().max(500).default(""),
  bodyHtml: z.string().max(500_000).default(""),
  previewText: z.string().trim().max(500).optional().or(z.literal("").transform(() => undefined)),
  listId: optionalUuid,
  sendingDomainId: optionalUuid,
  signatureId: optionalUuid,
});
export type CreateCampaignInput = z.infer<typeof createCampaignSchema>;

export const updateCampaignSchema = createCampaignSchema;
export type UpdateCampaignInput = z.infer<typeof updateCampaignSchema>;

export const campaignViewEnum = z.enum(["active", "trash"]);
export type CampaignView = z.infer<typeof campaignViewEnum>;

export const listCampaignsQuerySchema = z.object({
  q: z.string().trim().max(120).optional().transform((v) => (v && v.length > 0 ? v : undefined)),
  status: z
    .enum(["draft", "approved", "scheduled", "sending", "sent", "failed"])
    .optional()
    .catch(undefined),
  view: campaignViewEnum.default("active").catch("active" as const),
  page: z.coerce.number().int().min(1).max(10_000).catch(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).catch(20).default(20),
});
export type ListCampaignsQuery = z.infer<typeof listCampaignsQuerySchema>;

export type RawSearchParams = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export function parseListCampaignsQuery(raw: RawSearchParams): ListCampaignsQuery {
  return listCampaignsQuerySchema.parse({
    q: first(raw.q),
    status: first(raw.status),
    view: first(raw.view),
    page: first(raw.page),
    pageSize: first(raw.pageSize),
  });
}

/** Audience refinement + scheduling, supplied when the operator sends/schedules. */
export const sendCampaignSchema = z.object({
  tagId: optionalUuid,
  subscription: z.enum(["subscribed", "unsubscribed", "bounced", "complained"]).optional(),
  // ISO datetime string for a scheduled send; absent = send immediately.
  scheduledAt: z
    .string()
    .datetime()
    .optional()
    .or(z.literal("").transform(() => undefined)),
});
export type SendCampaignInput = z.infer<typeof sendCampaignSchema>;

export const draftCampaignSchema = z.object({
  instructions: z.string().trim().min(1, "Describe what you want to say").max(4000),
  tone: z.string().trim().max(120).optional(),
  audience: z.string().trim().max(200).optional(),
  currentSubject: z.string().max(500).optional(),
  currentBodyHtml: z.string().max(500_000).optional(),
});
export type DraftCampaignInput = z.infer<typeof draftCampaignSchema>;
