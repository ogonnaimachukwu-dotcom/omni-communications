ALTER TYPE "public"."email_event_type" ADD VALUE 'failed';--> statement-breakpoint
ALTER TYPE "public"."email_event_type" ADD VALUE 'unsubscribed';--> statement-breakpoint
ALTER TYPE "public"."tracking_provider_type" ADD VALUE 'mailgun_webhook';--> statement-breakpoint
ALTER TABLE "email_events" ADD COLUMN "campaign_id" uuid;--> statement-breakpoint
ALTER TABLE "email_events" ADD COLUMN "communication_profile_id" uuid;--> statement-breakpoint
ALTER TABLE "email_events" ADD COLUMN "tracking_provider_id" uuid;--> statement-breakpoint
ALTER TABLE "email_events" ADD CONSTRAINT "email_events_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_events" ADD CONSTRAINT "email_events_communication_profile_id_communication_profiles_id_fk" FOREIGN KEY ("communication_profile_id") REFERENCES "public"."communication_profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_events" ADD CONSTRAINT "email_events_tracking_provider_id_tracking_providers_id_fk" FOREIGN KEY ("tracking_provider_id") REFERENCES "public"."tracking_providers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "email_events_campaign_idx" ON "email_events" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "email_events_profile_idx" ON "email_events" USING btree ("communication_profile_id");--> statement-breakpoint
CREATE INDEX "email_events_provider_idx" ON "email_events" USING btree ("tracking_provider_id");