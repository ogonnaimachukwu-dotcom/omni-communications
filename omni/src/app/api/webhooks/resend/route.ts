import { NextResponse } from "next/server";
import { env } from "@/env";
import { db } from "@/db";
import { campaigns } from "@/db/schema";
import { eq } from "drizzle-orm";
import * as recipientRepo from "@/core/campaigns/recipient.repository";
import * as campaignRepo from "@/core/campaigns/campaign.repository";
import * as suppressions from "@/core/suppressions/suppression.service";
import { ResendTrackingAdapter } from "@/lib/tracking/adapters/resend";
import { withLogging, logStorage, logger } from "@/lib/logger";
import { trace } from "@/lib/tracing";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<NextResponse> {
  return withLogging(request, async () => {
    return trace("api.webhook.resend", async () => {
      const raw = await request.text();
      const adapter = new ResendTrackingAdapter();

      if (!adapter.verifySignature(raw, request.headers, env.RESEND_WEBHOOK_SECRET)) {
        logger.warn("Invalid signature on webhook");
        return NextResponse.json({ error: "invalid signature" }, { status: 401 });
      }

      const parsedEvents = adapter.parseWebhook(raw, request.headers);
      if (parsedEvents.length === 0) {
        return NextResponse.json({ ok: true });
      }

      for (const event of parsedEvents) {
        const recipient = await recipientRepo.findByProviderMessageId(event.providerMessageId);

        const store = logStorage.getStore();
        if (store && recipient) {
          store.projectId = recipient.projectId;
          store.campaignId = recipient.campaignId;
        }

        let campaignId: string | null = null;
        let communicationProfileId: string | null = null;

        if (recipient) {
          campaignId = recipient.campaignId;
          const [camp] = await db
            .select({ communicationProfileId: campaigns.communicationProfileId })
            .from(campaigns)
            .where(eq(campaigns.id, recipient.campaignId))
            .limit(1);
          if (camp) {
            communicationProfileId = camp.communicationProfileId;
          }
        }

        await recipientRepo.recordEvent({
          projectId: recipient?.projectId ?? null,
          recipientId: recipient?.id ?? null,
          campaignId,
          communicationProfileId,
          providerMessageId: event.providerMessageId,
          type: event.type,
          payload: event.payload,
          occurredAt: event.occurredAt,
        });

        if (recipient) {
          const occurredAt = event.occurredAt || new Date();

          if (event.type === "delivered") {
            await recipientRepo.markByProviderMessageId(event.providerMessageId, {
              status: "delivered",
              deliveredAt: occurredAt,
            });
            await campaignRepo.bumpCounters(recipient.campaignId, { deliveredCount: 1 });
          } else if (event.type === "bounced" || event.type === "complained") {
            const reason = event.type === "bounced" ? "bounce" : "complaint";
            await recipientRepo.markByProviderMessageId(event.providerMessageId, {
              status: event.type,
              failedAt: occurredAt,
              error: reason,
            });
            await campaignRepo.bumpCounters(recipient.campaignId, { failedCount: 1 });
            await suppressions.suppress(recipient.projectId, {
              email: recipient.email,
              reason,
              source: "resend_webhook",
            });
          }
        }
      }

      return NextResponse.json({ ok: true });
    });
  });
}
