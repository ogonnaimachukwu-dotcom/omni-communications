import {
  pgTable,
  pgEnum,
  uuid,
  text,
  timestamp,
  boolean,
  integer,
  jsonb,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { user } from "./auth-schema";

/* =========================================================================
 * Enums
 * ====================================================================== */

export const projectStatus = pgEnum("project_status", ["active", "archived"]);

export const domainVerification = pgEnum("domain_verification", [
  "pending",
  "verified",
  "failed",
]);

export const distributorStatus = pgEnum("distributor_status", [
  "subscribed",
  "unsubscribed",
  "bounced",
  "complained",
]);

export const suppressionReason = pgEnum("suppression_reason", [
  "unsubscribe",
  "bounce",
  "complaint",
  "manual",
]);

export const campaignStatus = pgEnum("campaign_status", [
  "draft",
  "approved",
  "scheduled",
  "sending",
  "sent",
  "failed",
]);

// The per-recipient send ledger lifecycle.
export const recipientStatus = pgEnum("recipient_status", [
  "queued",
  "sent",
  "delivered",
  "bounced",
  "complained",
  "failed",
  "suppressed",
]);

export const emailEventType = pgEnum("email_event_type", [
  "sent",
  "delivered",
  "delivery_delayed",
  "bounced",
  "complained",
  "opened",
  "clicked",
]);

/* =========================================================================
 * Projects  — the tenant root. Every tenant-owned row references this.
 * ====================================================================== */

export const projects = pgTable(
  "projects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    ceoName: text("ceo_name"),
    companyName: text("company_name"),
    notes: text("notes"),
    status: projectStatus("status").notNull().default("active"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
    deletedAt: timestamp("deleted_at"),
  },
  (t) => [index("projects_status_idx").on(t.status)],
);

/* =========================================================================
 * Sending domains — per-project verified "from" identities for Resend.
 * (The encrypted mailbox_connections/secrets tables for Gmail/MS arrive in
 *  Phase 2; the envelope-encryption lib already ships in src/lib/crypto.)
 * ====================================================================== */

export const sendingDomains = pgTable(
  "sending_domains",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    domain: text("domain").notNull(), // e.g. news.acme.com
    fromName: text("from_name").notNull(),
    fromEmail: text("from_email").notNull(),
    replyToEmail: text("reply_to_email"),
    resendDomainId: text("resend_domain_id"), // id returned by Resend
    spfVerified: boolean("spf_verified").notNull().default(false),
    dkimVerified: boolean("dkim_verified").notNull().default(false),
    dmarcVerified: boolean("dmarc_verified").notNull().default(false),
    status: domainVerification("status").notNull().default("pending"),
    isDefault: boolean("is_default").notNull().default(false),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index("sending_domains_project_idx").on(t.projectId),
    uniqueIndex("sending_domains_project_email_uidx").on(t.projectId, t.fromEmail),
  ],
);

/* =========================================================================
 * Distributor lists + distributors (contacts)
 * ====================================================================== */

export const distributorLists = pgTable(
  "distributor_lists",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
    deletedAt: timestamp("deleted_at"),
  },
  (t) => [index("distributor_lists_project_idx").on(t.projectId)],
);

export const distributors = pgTable(
  "distributors",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    listId: uuid("list_id")
      .notNull()
      .references(() => distributorLists.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    name: text("name"),
    // Flexible merge-tag fields (company, title, custom columns from CSV import).
    fields: jsonb("fields").$type<Record<string, string>>().notNull().default({}),
    status: distributorStatus("status").notNull().default("subscribed"),
    // Per-contact token powering RFC 8058 one-click unsubscribe.
    unsubscribeToken: uuid("unsubscribe_token").notNull().defaultRandom(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index("distributors_project_idx").on(t.projectId),
    index("distributors_list_idx").on(t.listId),
    // One email per list; re-importing updates rather than duplicates.
    uniqueIndex("distributors_list_email_uidx").on(t.listId, t.email),
    uniqueIndex("distributors_unsub_token_uidx").on(t.unsubscribeToken),
  ],
);

/* =========================================================================
 * Suppressions — the compliance gate. Checked at send time, ALWAYS.
 * Project-scoped: a contact unsubscribing from one CEO doesn't mute another.
 * ====================================================================== */

export const suppressions = pgTable(
  "suppressions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    reason: suppressionReason("reason").notNull(),
    source: text("source"), // e.g. "resend_webhook", "one_click", "import"
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("suppressions_project_email_uidx").on(t.projectId, t.email),
    index("suppressions_email_idx").on(t.email),
  ],
);

/* =========================================================================
 * Signatures
 * ====================================================================== */

export const signatures = pgTable(
  "signatures",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    html: text("html").notNull(),
    isDefault: boolean("is_default").notNull().default(false),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [index("signatures_project_idx").on(t.projectId)],
);

/* =========================================================================
 * Campaigns
 * ====================================================================== */

export const campaigns = pgTable(
  "campaigns",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    listId: uuid("list_id").references(() => distributorLists.id, {
      onDelete: "set null",
    }),
    sendingDomainId: uuid("sending_domain_id").references(() => sendingDomains.id, {
      onDelete: "set null",
    }),
    signatureId: uuid("signature_id").references(() => signatures.id, {
      onDelete: "set null",
    }),
    subject: text("subject").notNull().default(""),
    // Author-facing HTML (email-safe). Rendered + unsubscribe-injected at send time.
    bodyHtml: text("body_html").notNull().default(""),
    previewText: text("preview_text"),
    status: campaignStatus("status").notNull().default("draft"),
    scheduledAt: timestamp("scheduled_at"),
    approvedAt: timestamp("approved_at"),
    approvedBy: text("approved_by").references(() => user.id, {
      onDelete: "set null",
    }),
    sentAt: timestamp("sent_at"),
    // Denormalized counters for the dashboard (kept in sync by the worker/webhook).
    totalRecipients: integer("total_recipients").notNull().default(0),
    sentCount: integer("sent_count").notNull().default(0),
    deliveredCount: integer("delivered_count").notNull().default(0),
    failedCount: integer("failed_count").notNull().default(0),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
    deletedAt: timestamp("deleted_at"),
  },
  (t) => [
    index("campaigns_project_idx").on(t.projectId),
    index("campaigns_status_idx").on(t.status),
  ],
);

/* =========================================================================
 * Campaign recipients — THE SEND LEDGER. One row per intended send.
 * Source of truth for sent / delivered / failed tracking.
 * ====================================================================== */

export const campaignRecipients = pgTable(
  "campaign_recipients",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    distributorId: uuid("distributor_id").references(() => distributors.id, {
      onDelete: "set null",
    }),
    email: text("email").notNull(),
    status: recipientStatus("status").notNull().default("queued"),
    providerMessageId: text("provider_message_id"), // Resend message id
    error: text("error"),
    sentAt: timestamp("sent_at"),
    deliveredAt: timestamp("delivered_at"),
    failedAt: timestamp("failed_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index("campaign_recipients_campaign_idx").on(t.campaignId),
    index("campaign_recipients_status_idx").on(t.status),
    index("campaign_recipients_provider_msg_idx").on(t.providerMessageId),
    // Idempotency: never enqueue the same address twice for one campaign.
    uniqueIndex("campaign_recipients_campaign_email_uidx").on(t.campaignId, t.email),
  ],
);

/* =========================================================================
 * Email events — raw provider events (Resend webhooks). Feeds status + audit.
 * ====================================================================== */

export const emailEvents = pgTable(
  "email_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id").references(() => projects.id, {
      onDelete: "cascade",
    }),
    recipientId: uuid("recipient_id").references(() => campaignRecipients.id, {
      onDelete: "cascade",
    }),
    providerMessageId: text("provider_message_id"),
    type: emailEventType("type").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>(),
    occurredAt: timestamp("occurred_at").notNull().defaultNow(),
  },
  (t) => [
    index("email_events_recipient_idx").on(t.recipientId),
    index("email_events_provider_msg_idx").on(t.providerMessageId),
  ],
);

/* =========================================================================
 * Audit log — append-only record of consequential actions.
 * ====================================================================== */

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actorUserId: text("actor_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    projectId: uuid("project_id"),
    action: text("action").notNull(), // e.g. "campaign.approved"
    entityType: text("entity_type"),
    entityId: text("entity_id"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    ipAddress: text("ip_address"),
    createdAt: timestamp("created_at")
      .notNull()
      .default(sql`now()`),
  },
  (t) => [
    index("audit_logs_project_idx").on(t.projectId),
    index("audit_logs_actor_idx").on(t.actorUserId),
    index("audit_logs_action_idx").on(t.action),
  ],
);
