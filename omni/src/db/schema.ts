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
  primaryKey,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { user } from "./auth-schema";
export { user };

/* =========================================================================
 * Enums
 * ====================================================================== */

export const projectStatus = pgEnum("project_status", ["active", "archived"]);

export const projectMemberRole = pgEnum("project_member_role", [
  "owner",
  "admin",
  "member",
  "viewer",
]);


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
  "paused",
]);

export const customFieldType = pgEnum("custom_field_type", [
  "text",
  "number",
  "date",
  "select",
  "boolean",
]);

export const importStatus = pgEnum("import_status", [
  "completed",
  "partial",
  "failed",
]);

export const mailboxProvider = pgEnum("mailbox_provider", ["gmail", "outlook"]);
export const mailboxStatus = pgEnum("mailbox_status", ["active", "invalid", "paused"]);

export const sendingProviderType = pgEnum("sending_provider_type", ["resend", "smtp", "ses", "mailgun", "postmark"]);
export const sendingProviderStatus = pgEnum("sending_provider_status", ["active", "invalid", "disabled"]);
export const inboxConnectionType = pgEnum("inbox_connection_type", ["imap", "oauth_gmail", "oauth_outlook"]);
export const inboxConnectionStatus = pgEnum("inbox_connection_status", ["active", "invalid", "disabled"]);
export const trackingProviderType = pgEnum("tracking_provider_type", ["resend_webhook", "postmark_webhook", "ses_sns", "mailgun_webhook"]);
export const trackingProviderStatus = pgEnum("tracking_provider_status", ["active", "disabled"]);
export const healthStatus = pgEnum("health_status", ["healthy", "warning", "unhealthy"]);
export const messageSentiment = pgEnum("message_sentiment", ["positive", "neutral", "negative", "bounce"]);
export const conversationStatus = pgEnum("conversation_status", [
  "open",
  "waiting",
  "closed",
  "spam",
  "interested",
  "meeting",
  "won",
  "lost",
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
  "failed",
  "unsubscribed",
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

export const projectMembers = pgTable(
  "project_members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: projectMemberRole("role").notNull().default("member"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    uniqueIndex("project_members_project_user_uidx").on(t.projectId, t.userId),
    index("project_members_user_idx").on(t.userId),
  ],
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
 * Mailboxes — connected Gmail / Outlook accounts.
 * ====================================================================== */

export const mailboxes = pgTable(
  "mailboxes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    provider: mailboxProvider("provider").notNull(),
    status: mailboxStatus("status").notNull().default("active"),
    credentials: text("credentials").notNull(), // SealedSecret stringified
    tokenExpiresAt: timestamp("token_expires_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
    lastSyncedAt: timestamp("last_synced_at"),
    syncCursor: text("sync_cursor"),
  },
  (t) => [
    index("mailboxes_project_idx").on(t.projectId),
    uniqueIndex("mailboxes_project_email_uidx").on(t.projectId, t.email),
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
    name: text("name").notNull(),
    firstName: text("first_name"),
    lastName: text("last_name"),
    // Flexible merge-tag fields (company, title, custom columns from CSV import).
    fields: jsonb("fields").$type<Record<string, string>>().notNull().default({}),
    status: distributorStatus("status").notNull().default("subscribed"),
    archivedAt: timestamp("archived_at"),
    deletedAt: timestamp("deleted_at"),
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
    index("distributors_list_active_idx").on(t.listId, t.deletedAt),
    // One email per list; re-importing updates rather than duplicates.
    uniqueIndex("distributors_list_email_uidx").on(t.listId, t.email),
    uniqueIndex("distributors_unsub_token_uidx").on(t.unsubscribeToken),
  ],
);

/* =========================================================================
 * Tags — project-scoped labels that can be applied to distributors.
 * ====================================================================== */

export const tags = pgTable(
  "tags",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    color: text("color"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index("tags_project_idx").on(t.projectId),
    uniqueIndex("tags_project_name_uidx").on(t.projectId, sql`lower(${t.name})`),
  ],
);

export const distributorTags = pgTable(
  "distributor_tags",
  {
    distributorId: uuid("distributor_id")
      .notNull()
      .references(() => distributors.id, { onDelete: "cascade" }),
    tagId: uuid("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
  },
  (t) => [
    primaryKey({ columns: [t.distributorId, t.tagId] }),
    index("distributor_tags_tag_idx").on(t.tagId),
  ],
);

/* =========================================================================
 * Custom field definitions — project-scoped typed columns for distributors.
 * ====================================================================== */

export const customFieldDefinitions = pgTable(
  "custom_field_definitions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    label: text("label").notNull(),
    type: customFieldType("type").notNull().default("text"),
    options: jsonb("options").$type<string[]>(),
    position: integer("position").notNull().default(0),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index("custom_field_definitions_project_idx").on(t.projectId),
    uniqueIndex("custom_field_definitions_project_key_uidx").on(t.projectId, t.key),
  ],
);

/* =========================================================================
 * Distributor imports — log of committed CSV imports.
 * ====================================================================== */

export const distributorImports = pgTable(
  "distributor_imports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    listId: uuid("list_id")
      .notNull()
      .references(() => distributorLists.id, { onDelete: "cascade" }),
    filename: text("filename").notNull(),
    status: importStatus("status").notNull().default("completed"),
    totalRows: integer("total_rows").notNull().default(0),
    successCount: integer("success_count").notNull().default(0),
    failureCount: integer("failure_count").notNull().default(0),
    duplicateCount: integer("duplicate_count").notNull().default(0),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    completedAt: timestamp("completed_at"),
  },
  (t) => [
    index("distributor_imports_project_idx").on(t.projectId),
    index("distributor_imports_list_idx").on(t.listId),
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
    mailboxId: uuid("mailbox_id").references(() => mailboxes.id, {
      onDelete: "set null",
    }),
    communicationProfileId: uuid("communication_profile_id").references(() => communicationProfiles.id, {
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
    index("campaigns_mailbox_idx").on(t.mailboxId),
    index("campaigns_communication_profile_idx").on(t.communicationProfileId),
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
    sendingProviderId: uuid("sending_provider_id").references(() => sendingProviders.id, {
      onDelete: "set null",
    }),
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
    // Analytics: project-scoped status rollups (also speeds project stats()).
    index("campaign_recipients_project_status_idx").on(t.projectId, t.status),
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
    campaignId: uuid("campaign_id").references(() => campaigns.id, {
      onDelete: "set null",
    }),
    communicationProfileId: uuid("communication_profile_id").references(() => communicationProfiles.id, {
      onDelete: "set null",
    }),
    trackingProviderId: uuid("tracking_provider_id").references(() => trackingProviders.id, {
      onDelete: "set null",
    }),
    providerMessageId: text("provider_message_id"),
    type: emailEventType("type").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>(),
    occurredAt: timestamp("occurred_at").notNull().defaultNow(),
  },
  (t) => [
    index("email_events_recipient_idx").on(t.recipientId),
    index("email_events_provider_msg_idx").on(t.providerMessageId),
    index("email_events_campaign_idx").on(t.campaignId),
    index("email_events_profile_idx").on(t.communicationProfileId),
    index("email_events_provider_idx").on(t.trackingProviderId),
    // Analytics: project-scoped aggregation + time-series by event type.
    index("email_events_project_type_time_idx").on(t.projectId, t.type, t.occurredAt),
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

/* =========================================================================
 * V1 Decoupled Communication Engine
 * ====================================================================== */

export const sendingProviders = pgTable(
  "sending_providers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    type: sendingProviderType("type").notNull(),
    status: sendingProviderStatus("status").notNull().default("active"),
    credentials: text("credentials").notNull(), // SealedSecret stringified config JSON
    isDefault: boolean("is_default").notNull().default(false),
    createdAt: timestamp("created_at").notNull().defaultNow(),

    updatedAt: timestamp("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [index("sending_providers_project_idx").on(t.projectId)]
);

export const inboxConnections = pgTable(
  "inbox_connections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    name: text("name").notNull(),          // Human-readable label e.g. "CEO Inbox"
    email: text("email").notNull(),
    type: inboxConnectionType("type").notNull(),
    host: text("host"),                    // IMAP host (null for OAuth)
    port: integer("port"),                 // IMAP port (null for OAuth)
    tls: boolean("tls").default(true),     // Use TLS/SSL
    status: inboxConnectionStatus("status").notNull().default("active"),
    credentials: text("credentials").notNull(), // SealedSecret encrypted JSON
    tokenExpiresAt: timestamp("token_expires_at"),
    lastSyncedAt: timestamp("last_synced_at"),
    syncCursor: text("sync_cursor"),        // Last synced IMAP UID or Gmail historyId
    folders: jsonb("folders").$type<string[]>().default([]),  // Discovered folder list
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index("inbox_connections_project_idx").on(t.projectId),
    uniqueIndex("inbox_connections_project_email_uidx").on(t.projectId, t.email),
  ]
);

export const trackingProviders = pgTable(
  "tracking_providers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    type: trackingProviderType("type").notNull(),
    status: trackingProviderStatus("status").notNull().default("active"),
    config: text("config").notNull(), // SealedSecret stringified webhook secrets/endpoints JSON
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [index("tracking_providers_project_idx").on(t.projectId)]
);

export const communicationProfiles = pgTable(
  "communication_profiles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    sendingProviderId: uuid("sending_provider_id").references(() => sendingProviders.id, {
      onDelete: "set null",
    }),
    inboxConnectionId: uuid("inbox_connection_id").references(() => inboxConnections.id, {
      onDelete: "set null",
    }),
    trackingProviderId: uuid("tracking_provider_id").references(() => trackingProviders.id, {
      onDelete: "set null",
    }),
    signatureId: uuid("signature_id").references(() => signatures.id, {
      onDelete: "set null",
    }),
    dailyLimit: integer("daily_limit").notNull().default(500),
    replyAlias: text("reply_alias").notNull(), // from Name
    timezone: text("timezone").notNull().default("UTC"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [index("communication_profiles_project_idx").on(t.projectId)]
);

export const conversations = pgTable(
  "conversations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    campaignId: uuid("campaign_id").references(() => campaigns.id, {
      onDelete: "set null",
    }),
    distributorId: uuid("distributor_id").references(() => distributors.id, {
      onDelete: "set null",
    }),
    communicationProfileId: uuid("communication_profile_id").references(() => communicationProfiles.id, {
      onDelete: "set null",
    }),
    inboxConnectionId: uuid("inbox_connection_id")
      .notNull()
      .references(() => inboxConnections.id, { onDelete: "cascade" }),
    assigneeId: text("assignee_id").references(() => user.id, {
      onDelete: "set null",
    }),
    status: conversationStatus("status").notNull().default("open"),
    subject: text("subject").notNull(),
    lastMessageAt: timestamp("last_message_at")
      .notNull()
      .defaultNow(),
    aiSummary: text("ai_summary"),
    leadScore: integer("lead_score"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index("conversations_project_idx").on(t.projectId),
    index("conversations_status_idx").on(t.status),
    index("conversations_last_msg_idx").on(t.lastMessageAt),
  ]
);

export const inboxMessages = pgTable(
  "inbox_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    inboxConnectionId: uuid("inbox_connection_id")
      .notNull()
      .references(() => inboxConnections.id, { onDelete: "cascade" }),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    conversationId: uuid("conversation_id").references(() => conversations.id, {
      onDelete: "cascade",
    }),

    // IMAP identification
    uid: integer("uid"),                                   // IMAP UID
    folder: text("folder").notNull().default("INBOX"),
    messageId: text("message_id"),                         // RFC 2822 Message-ID header
    threadId: text("thread_id"),                           // Gmail thread ID or derived chain
    inReplyTo: text("in_reply_to"),                        // In-Reply-To header for threading
    references: text("references"),                        // References header (space-separated)

    // Addresses
    fromAddress: text("from_address").notNull(),
    fromName: text("from_name"),
    toAddresses: jsonb("to_addresses").$type<string[]>().default([]),
    ccAddresses: jsonb("cc_addresses").$type<string[]>().default([]),

    // Content
    subject: text("subject").notNull(),
    bodyHtml: text("body_html"),
    bodyText: text("body_text"),

    // Attachments stored as JSON array of metadata (not binaries)
    attachments: jsonb("attachments").$type<{
      filename: string;
      contentType: string;
      size: number;
      contentId?: string;
    }[]>().default([]),

    // Arbitrary additional headers (JSON object)
    headers: jsonb("headers").$type<Record<string, string>>().default({}),

    // State
    isRead: boolean("is_read").notNull().default(false),
    sentiment: messageSentiment("sentiment").notNull().default("neutral"),
    aiSuggestedResponse: text("ai_suggested_response"),
    receivedAt: timestamp("received_at").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("inbox_messages_connection_idx").on(t.inboxConnectionId),
    index("inbox_messages_project_idx").on(t.projectId),
    index("inbox_messages_message_id_idx").on(t.messageId),
    index("inbox_messages_thread_id_idx").on(t.threadId),
    index("inbox_messages_received_idx").on(t.receivedAt),
    index("inbox_messages_conversation_idx").on(t.conversationId),
  ]
);


export const outboundReplies = pgTable(
  "outbound_replies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    conversationId: uuid("conversation_id").references(() => conversations.id, {
      onDelete: "cascade",
    }),
    inboxMessageId: uuid("inbox_message_id")
      .references(() => inboxMessages.id, { onDelete: "cascade" }), // nullable, since a reply can be direct to conversation thread
    sendingProviderId: uuid("sending_provider_id")
      .notNull()
      .references(() => sendingProviders.id, { onDelete: "cascade" }),
    bodyHtml: text("body_html").notNull(),
    sentAt: timestamp("sent_at").notNull().defaultNow(),
  },
  (t) => [
    index("outbound_replies_message_idx").on(t.inboxMessageId),
    index("outbound_replies_provider_idx").on(t.sendingProviderId),
    index("outbound_replies_conversation_idx").on(t.conversationId),
  ]
);

export const providerHealthLogs = pgTable(
  "provider_health_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    providerId: uuid("provider_id").notNull(),
    providerType: text("provider_type").$type<"sending" | "inbox" | "tracking">().notNull(),
    status: healthStatus("status").notNull(),
    errorDetails: text("error_details"),
    checkedAt: timestamp("checked_at").notNull().defaultNow(),
  },
  (t) => [
    index("provider_health_logs_project_idx").on(t.projectId),
    index("provider_health_logs_provider_idx").on(t.providerId),
  ]
);
