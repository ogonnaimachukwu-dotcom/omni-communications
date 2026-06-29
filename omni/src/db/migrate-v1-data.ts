import { db } from "./index";
import {
  mailboxes,
  sendingProviders,
  inboxConnections,
  trackingProviders,
  communicationProfiles,
  campaigns,
} from "./schema";
import { eq, and } from "drizzle-orm";
import { sealToString } from "../lib/crypto/envelope";

export async function runDataMigration() {
  console.log("🚀 Starting V1 Communication Engine data migration...");

  // 1. Fetch all active or legacy mailboxes
  const legacyMailboxes = await db.select().from(mailboxes);
  console.log(`Found ${legacyMailboxes.length} legacy mailboxes to migrate.`);

  for (const mailbox of legacyMailboxes) {
    try {
      // Check if already migrated
      const [existingInbox] = await db
        .select()
        .from(inboxConnections)
        .where(and(eq(inboxConnections.projectId, mailbox.projectId), eq(inboxConnections.email, mailbox.email)))
        .limit(1);

      if (existingInbox) {
        console.log(`Mailbox ${mailbox.email} already migrated. Skipping.`);
        continue;
      }

      console.log(`Migrating mailbox: ${mailbox.email}...`);

      // 2. Create Sending Provider
      const isGmail = mailbox.provider === "gmail";
      const sendingType = isGmail ? "smtp" : "smtp"; // Map to smtp or oauth_gmail/outlook if we want to preserve tokens.
      // But wait! We can preserve the exact OAuth credential payload inside config!
      const sendingProviderPayload = {
        credentialsPayload: mailbox.credentials,
      };

      const [sendingProv] = await db
        .insert(sendingProviders)
        .values({
          projectId: mailbox.projectId,
          name: `Sending (${mailbox.email})`,
          type: isGmail ? "smtp" : "smtp", // Use smtp transport fallback
          status: mailbox.status === "active" ? "active" : "invalid",
          credentials: mailbox.credentials, // reuse same sealed secret
        })
        .returning();

      // 3. Create Inbox Connection
      const [inboxConn] = await db
        .insert(inboxConnections)
        .values({
          projectId: mailbox.projectId,
          name: mailbox.email,          // use email as default name during migration
          email: mailbox.email,
          type: isGmail ? "oauth_gmail" : "oauth_outlook",
          status: mailbox.status === "active" ? "active" : "invalid",
          credentials: mailbox.credentials || "",
          tokenExpiresAt: mailbox.tokenExpiresAt ? new Date(mailbox.tokenExpiresAt) : null,
          lastSyncedAt: mailbox.lastSyncedAt ? new Date(mailbox.lastSyncedAt) : null,
          syncCursor: mailbox.syncCursor || "",
        })
        .returning();

      // 4. Create default Tracking Provider for this project
      // Check if tracking provider already exists for project
      let trackingId: string | null = null;
      const [existingTracking] = await db
        .select()
        .from(trackingProviders)
        .where(and(eq(trackingProviders.projectId, mailbox.projectId), eq(trackingProviders.type, "resend_webhook")))
        .limit(1);

      if (existingTracking) {
        trackingId = existingTracking.id;
      } else {
        const dummyConfig = sealToString(JSON.stringify({ secret: process.env.RESEND_WEBHOOK_SECRET || "default_secret" }));
        const [trackingProv] = await db
          .insert(trackingProviders)
          .values({
            projectId: mailbox.projectId,
            name: "Resend Webhook Tracking",
            type: "resend_webhook",
            status: "active",
            config: dummyConfig,
          })
          .returning();
        trackingId = trackingProv.id;
      }

      // 5. Create Communication Profile
      const [profile] = await db
        .insert(communicationProfiles)
        .values({
          projectId: mailbox.projectId,
          name: `Default Profile (${mailbox.email})`,
          sendingProviderId: sendingProv.id,
          inboxConnectionId: inboxConn.id,
          trackingProviderId: trackingId,
          dailyLimit: 500,
          replyAlias: mailbox.email,
          timezone: "UTC",
        })
        .returning();

      // 6. Update all campaigns referencing this legacy mailbox
      const updatedCampaigns = await db
        .update(campaigns)
        .set({
          communicationProfileId: profile.id,
        })
        .where(eq(campaigns.mailboxId, mailbox.id))
        .returning();

      console.log(`Successfully migrated ${mailbox.email}. Linked to ${updatedCampaigns.length} campaigns.`);
    } catch (err) {
      console.error(`❌ Error migrating mailbox ${mailbox.email}:`, err);
    }
  }

  console.log("✅ V1 Communication Engine data migration completed.");
}

// Allow direct execution
if (require.main === module) {
  runDataMigration()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
