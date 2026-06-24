CREATE TYPE "public"."mailbox_provider" AS ENUM('gmail', 'outlook');--> statement-breakpoint
CREATE TYPE "public"."mailbox_status" AS ENUM('active', 'invalid', 'paused');--> statement-breakpoint
CREATE TABLE "mailboxes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"email" text NOT NULL,
	"provider" "mailbox_provider" NOT NULL,
	"status" "mailbox_status" DEFAULT 'active' NOT NULL,
	"credentials" text NOT NULL,
	"token_expires_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"last_synced_at" timestamp,
	"sync_cursor" text
);
--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "mailbox_id" uuid;--> statement-breakpoint
ALTER TABLE "mailboxes" ADD CONSTRAINT "mailboxes_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "mailboxes_project_idx" ON "mailboxes" USING btree ("project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "mailboxes_project_email_uidx" ON "mailboxes" USING btree ("project_id","email");--> statement-breakpoint
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_mailbox_id_mailboxes_id_fk" FOREIGN KEY ("mailbox_id") REFERENCES "public"."mailboxes"("id") ON DELETE set null ON UPDATE no action;