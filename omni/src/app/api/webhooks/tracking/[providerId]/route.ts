import { NextResponse } from "next/server";
import { db } from "@/db";
import { trackingProviders, campaigns } from "@/db/schema";
import { eq } from "drizzle-orm";
import { openFromString } from "@/lib/crypto/envelope";
import { createTrackingAdapter } from "@/lib/tracking";
import * as recipientRepo from "@/core/campaigns/recipient.repository";
import * as campaignRepo from "@/core/campaigns/campaign.repository";
import * as suppressions from "@/core/suppressions/suppression.service";
import { withLogging, logStorage, logger } from "@/lib/logger";
import { trace } from "@/lib/tracing";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  props: { params: Promise<{ providerId: string }> }
): Promise<NextResponse> {
  const { providerId } = await props.params;

  return withLogging(request, async () => {
    return trace("api.webhook.tracking", async () => {
      // 1. Fetch tracking provider
      const [provider] = await db
        .select()
        .from(trackingProviders)
        .where(eq(trackingProviders.id, providerId))
        .limit(1);

      if (!provider) {
        logger.warn(`Tracking provider not found: ${providerId}`);
        return NextResponse.json({ error: "provider not found" }, { status: 404 });
      }

      if (provider.status !== "active") {
        logger.warn(`Tracking provider is not active: ${providerId}`);
        return NextResponse.json({ error: "provider disabled" }, { status: 403 });
      }

      // 2. Decrypt configuration to get webhook signature secret
      let config: Record<string, string> = {};
      try {
        config = JSON.parse(openFromString(provider.config));
      } catch (err) {
        logger.error(`Failed to decrypt/parse config for provider ${providerId}: ${err}`);
      }

      const secret = config.webhookSecret || config.secret || "";

      // 3. Resolve adapter and verify signature
      const rawBody = await request.text();
      let adapter;
      try {
        adapter = createTrackingAdapter(provider.type);
      } catch (err) {
        logger.error(`Unsupported tracking adapter: ${provider.type}`);
        return NextResponse.json({ error: "unsupported provider type" }, { status: 400 });
      }

      if (!adapter.verifySignature(rawBody, request.headers, secret)) {
        logger.warn(`Signature verification failed for provider: ${providerId}`);
        return NextResponse.json({ error: "invalid signature" }, { status: 401 });
      }

      // 4. Parse events
      const parsedEvents = adapter.parseWebhook(rawBody, request.headers);
      if (parsedEvents.length === 0) {
        return NextResponse.json({ ok: true, message: "no trackable events parsed" });
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

        // 5. Store Event
        await recipientRepo.recordEvent({
          projectId: recipient?.projectId ?? provider.projectId,
          recipientId: recipient?.id ?? null,
          campaignId,
          communicationProfileId,
          trackingProviderId: provider.id,
          providerMessageId: event.providerMessageId,
          type: event.type,
          payload: event.payload,
          occurredAt: event.occurredAt,
        });

        // 6. Update Recipient status & Campaign counters & Suppressions
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
              source: `tracking_${provider.type}`,
            });
          } else if (event.type === "failed") {
            await recipientRepo.markByProviderMessageId(event.providerMessageId, {
              status: "failed",
              failedAt: occurredAt,
              error: "failed",
            });
            await campaignRepo.bumpCounters(recipient.campaignId, { failedCount: 1 });
          } else if (event.type === "unsubscribed") {
            await recipientRepo.markByProviderMessageId(event.providerMessageId, {
              status: "suppressed",
              failedAt: occurredAt,
              error: "unsubscribe",
            });
            await suppressions.suppress(recipient.projectId, {
              email: recipient.email,
              reason: "unsubscribe",
              source: `tracking_${provider.type}`,
            });
          }
        }
      }

      return NextResponse.json({ ok: true, processedEvents: parsedEvents.length });
    });
  });
}
