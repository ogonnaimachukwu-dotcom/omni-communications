CREATE TYPE "public"."conversation_status" AS ENUM('open', 'waiting', 'closed', 'spam', 'interested', 'meeting', 'won', 'lost');--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"campaign_id" uuid,
	"distributor_id" uuid,
	"communication_profile_id" uuid,
	"inbox_connection_id" uuid NOT NULL,
	"assignee_id" text,
	"status" "conversation_status" DEFAULT 'open' NOT NULL,
	"subject" text NOT NULL,
	"last_message_at" timestamp DEFAULT now() NOT NULL,
	"ai_summary" text,
	"lead_score" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "outbound_replies" ALTER COLUMN "inbox_message_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "inbox_messages" ADD COLUMN "conversation_id" uuid;--> statement-breakpoint
ALTER TABLE "outbound_replies" ADD COLUMN "conversation_id" uuid;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_distributor_id_distributors_id_fk" FOREIGN KEY ("distributor_id") REFERENCES "public"."distributors"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_communication_profile_id_communication_profiles_id_fk" FOREIGN KEY ("communication_profile_id") REFERENCES "public"."communication_profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_inbox_connection_id_inbox_connections_id_fk" FOREIGN KEY ("inbox_connection_id") REFERENCES "public"."inbox_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_assignee_id_user_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "conversations_project_idx" ON "conversations" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "conversations_status_idx" ON "conversations" USING btree ("status");--> statement-breakpoint
CREATE INDEX "conversations_last_msg_idx" ON "conversations" USING btree ("last_message_at");--> statement-breakpoint
ALTER TABLE "inbox_messages" ADD CONSTRAINT "inbox_messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outbound_replies" ADD CONSTRAINT "outbound_replies_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "inbox_messages_conversation_idx" ON "inbox_messages" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "outbound_replies_conversation_idx" ON "outbound_replies" USING btree ("conversation_id");