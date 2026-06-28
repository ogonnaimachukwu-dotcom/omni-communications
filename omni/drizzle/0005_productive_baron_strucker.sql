CREATE TYPE "public"."health_status" AS ENUM('healthy', 'warning', 'unhealthy');--> statement-breakpoint
CREATE TYPE "public"."inbox_connection_status" AS ENUM('active', 'invalid', 'disabled');--> statement-breakpoint
CREATE TYPE "public"."inbox_connection_type" AS ENUM('imap', 'oauth_gmail', 'oauth_outlook');--> statement-breakpoint
CREATE TYPE "public"."message_sentiment" AS ENUM('positive', 'neutral', 'negative', 'bounce');--> statement-breakpoint
CREATE TYPE "public"."sending_provider_status" AS ENUM('active', 'invalid', 'disabled');--> statement-breakpoint
CREATE TYPE "public"."sending_provider_type" AS ENUM('resend', 'smtp', 'ses', 'mailgun', 'postmark');--> statement-breakpoint
CREATE TYPE "public"."tracking_provider_status" AS ENUM('active', 'disabled');--> statement-breakpoint
CREATE TYPE "public"."tracking_provider_type" AS ENUM('resend_webhook', 'postmark_webhook', 'ses_sns');--> statement-breakpoint
CREATE TABLE "communication_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"name" text NOT NULL,
	"sending_provider_id" uuid,
	"inbox_connection_id" uuid,
	"tracking_provider_id" uuid,
	"signature_id" uuid,
	"daily_limit" integer DEFAULT 500 NOT NULL,
	"reply_alias" text NOT NULL,
	"timezone" text DEFAULT 'UTC' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inbox_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"email" text NOT NULL,
	"type" "inbox_connection_type" NOT NULL,
	"status" "inbox_connection_status" DEFAULT 'active' NOT NULL,
	"credentials" text NOT NULL,
	"token_expires_at" timestamp,
	"last_synced_at" timestamp,
	"sync_cursor" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inbox_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"inbox_connection_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"from_address" text NOT NULL,
	"from_name" text,
	"subject" text NOT NULL,
	"body_html" text,
	"body_text" text,
	"is_read" boolean DEFAULT false NOT NULL,
	"sentiment" "message_sentiment" DEFAULT 'neutral' NOT NULL,
	"ai_suggested_response" text,
	"received_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "outbound_replies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"inbox_message_id" uuid NOT NULL,
	"sending_provider_id" uuid NOT NULL,
	"body_html" text NOT NULL,
	"sent_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "provider_health_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"provider_id" uuid NOT NULL,
	"provider_type" text NOT NULL,
	"status" "health_status" NOT NULL,
	"error_details" text,
	"checked_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sending_providers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"name" text NOT NULL,
	"type" "sending_provider_type" NOT NULL,
	"status" "sending_provider_status" DEFAULT 'active' NOT NULL,
	"credentials" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tracking_providers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"name" text NOT NULL,
	"type" "tracking_provider_type" NOT NULL,
	"status" "tracking_provider_status" DEFAULT 'active' NOT NULL,
	"config" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "communication_profile_id" uuid;--> statement-breakpoint
ALTER TABLE "communication_profiles" ADD CONSTRAINT "communication_profiles_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communication_profiles" ADD CONSTRAINT "communication_profiles_sending_provider_id_sending_providers_id_fk" FOREIGN KEY ("sending_provider_id") REFERENCES "public"."sending_providers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communication_profiles" ADD CONSTRAINT "communication_profiles_inbox_connection_id_inbox_connections_id_fk" FOREIGN KEY ("inbox_connection_id") REFERENCES "public"."inbox_connections"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communication_profiles" ADD CONSTRAINT "communication_profiles_tracking_provider_id_tracking_providers_id_fk" FOREIGN KEY ("tracking_provider_id") REFERENCES "public"."tracking_providers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communication_profiles" ADD CONSTRAINT "communication_profiles_signature_id_signatures_id_fk" FOREIGN KEY ("signature_id") REFERENCES "public"."signatures"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbox_connections" ADD CONSTRAINT "inbox_connections_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbox_messages" ADD CONSTRAINT "inbox_messages_inbox_connection_id_inbox_connections_id_fk" FOREIGN KEY ("inbox_connection_id") REFERENCES "public"."inbox_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbox_messages" ADD CONSTRAINT "inbox_messages_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outbound_replies" ADD CONSTRAINT "outbound_replies_inbox_message_id_inbox_messages_id_fk" FOREIGN KEY ("inbox_message_id") REFERENCES "public"."inbox_messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outbound_replies" ADD CONSTRAINT "outbound_replies_sending_provider_id_sending_providers_id_fk" FOREIGN KEY ("sending_provider_id") REFERENCES "public"."sending_providers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_health_logs" ADD CONSTRAINT "provider_health_logs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sending_providers" ADD CONSTRAINT "sending_providers_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tracking_providers" ADD CONSTRAINT "tracking_providers_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "communication_profiles_project_idx" ON "communication_profiles" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "inbox_connections_project_idx" ON "inbox_connections" USING btree ("project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "inbox_connections_project_email_uidx" ON "inbox_connections" USING btree ("project_id","email");--> statement-breakpoint
CREATE INDEX "inbox_messages_connection_idx" ON "inbox_messages" USING btree ("inbox_connection_id");--> statement-breakpoint
CREATE INDEX "inbox_messages_project_idx" ON "inbox_messages" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "outbound_replies_message_idx" ON "outbound_replies" USING btree ("inbox_message_id");--> statement-breakpoint
CREATE INDEX "outbound_replies_provider_idx" ON "outbound_replies" USING btree ("sending_provider_id");--> statement-breakpoint
CREATE INDEX "provider_health_logs_project_idx" ON "provider_health_logs" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "provider_health_logs_provider_idx" ON "provider_health_logs" USING btree ("provider_id");--> statement-breakpoint
CREATE INDEX "sending_providers_project_idx" ON "sending_providers" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "tracking_providers_project_idx" ON "tracking_providers" USING btree ("project_id");--> statement-breakpoint
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_communication_profile_id_communication_profiles_id_fk" FOREIGN KEY ("communication_profile_id") REFERENCES "public"."communication_profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "campaigns_communication_profile_idx" ON "campaigns" USING btree ("communication_profile_id");