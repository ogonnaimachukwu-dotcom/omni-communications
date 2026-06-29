ALTER TABLE "inbox_connections" ADD COLUMN "name" text NOT NULL;--> statement-breakpoint
ALTER TABLE "inbox_connections" ADD COLUMN "host" text;--> statement-breakpoint
ALTER TABLE "inbox_connections" ADD COLUMN "port" integer;--> statement-breakpoint
ALTER TABLE "inbox_connections" ADD COLUMN "tls" boolean DEFAULT true;--> statement-breakpoint
ALTER TABLE "inbox_connections" ADD COLUMN "folders" jsonb DEFAULT '[]'::jsonb;--> statement-breakpoint
ALTER TABLE "inbox_messages" ADD COLUMN "uid" integer;--> statement-breakpoint
ALTER TABLE "inbox_messages" ADD COLUMN "folder" text DEFAULT 'INBOX' NOT NULL;--> statement-breakpoint
ALTER TABLE "inbox_messages" ADD COLUMN "message_id" text;--> statement-breakpoint
ALTER TABLE "inbox_messages" ADD COLUMN "thread_id" text;--> statement-breakpoint
ALTER TABLE "inbox_messages" ADD COLUMN "in_reply_to" text;--> statement-breakpoint
ALTER TABLE "inbox_messages" ADD COLUMN "references" text;--> statement-breakpoint
ALTER TABLE "inbox_messages" ADD COLUMN "to_addresses" jsonb DEFAULT '[]'::jsonb;--> statement-breakpoint
ALTER TABLE "inbox_messages" ADD COLUMN "cc_addresses" jsonb DEFAULT '[]'::jsonb;--> statement-breakpoint
ALTER TABLE "inbox_messages" ADD COLUMN "attachments" jsonb DEFAULT '[]'::jsonb;--> statement-breakpoint
ALTER TABLE "inbox_messages" ADD COLUMN "headers" jsonb DEFAULT '{}'::jsonb;--> statement-breakpoint
CREATE INDEX "inbox_messages_message_id_idx" ON "inbox_messages" USING btree ("message_id");--> statement-breakpoint
CREATE INDEX "inbox_messages_thread_id_idx" ON "inbox_messages" USING btree ("thread_id");--> statement-breakpoint
CREATE INDEX "inbox_messages_received_idx" ON "inbox_messages" USING btree ("received_at");