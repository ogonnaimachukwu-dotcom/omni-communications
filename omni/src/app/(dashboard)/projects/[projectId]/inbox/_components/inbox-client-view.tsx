"use client";

import { useState, useEffect, useRef } from "react";
import {
  listConversationsAction,
  getConversationDetailAction,
  updateConversationStatusAction,
  assignConversationAction,
  sendReplyAction,
} from "../actions";
import type { ConversationListItem, ThreadMessage } from "@/core/reply-center/reply-center.repository";
import {
  Search,
  CheckCircle,
  Inbox,
  User,
  Users,
  Send,
  MessageSquare,
  Clock,
  Paperclip,
  Tag,
  Loader2,
  ChevronRight,
  Shield,
  ArrowLeft,
} from "lucide-react";
import { cn } from "@/lib/utils";
import Link from "next/link";

interface Member {
  id: string;
  name: string | null;
  email: string;
}

interface Props {
  projectId: string;
  projectName: string;
  teamMembers: Member[];
  currentUser: {
    id: string;
    name?: string | null;
    email?: string | null;
  };
}

const STATUS_OPTIONS = [
  { value: "open", label: "Open", color: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" },
  { value: "waiting", label: "Waiting", color: "bg-amber-500/15 text-amber-400 border-amber-500/30" },
  { value: "closed", label: "Closed", color: "bg-gray-500/15 text-gray-400 border-gray-500/30" },
  { value: "spam", label: "Spam", color: "bg-zinc-500/15 text-zinc-400 border-zinc-500/30" },
  { value: "interested", label: "Interested", color: "bg-violet-500/15 text-violet-400 border-violet-500/30" },
  { value: "meeting", label: "Meeting", color: "bg-pink-500/15 text-pink-400 border-pink-500/30" },
  { value: "won", label: "Won", color: "bg-green-500/15 text-green-400 border-green-500/30" },
  { value: "lost", label: "Lost", color: "bg-rose-500/15 text-rose-400 border-rose-500/30" },
];

export function InboxClientView({ projectId, projectName, teamMembers, currentUser }: Props) {
  const [conversations, setConversations] = useState<ConversationListItem[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ConversationListItem | null>(null);
  const [messages, setMessages] = useState<ThreadMessage[]>([]);

  // Filter states
  const [statusFilter, setStatusFilter] = useState<string>("open");
  const [assigneeFilter, setAssigneeFilter] = useState<string>("all"); // "all", "mine", "unassigned"
  const [searchTerm, setSearchTerm] = useState("");

  // Loading/input states
  const [loadingList, setLoadingList] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [sendingReply, setSendingReply] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Fetch list of conversations
  const fetchConversations = async (selectedIdToKeep?: string) => {
    setLoadingList(true);
    try {
      const filters: {
        search?: string;
        status?: "open" | "waiting" | "closed" | "spam" | "interested" | "meeting" | "won" | "lost";
        assigneeId?: string;
        limit?: number;
      } = {
        search: searchTerm || undefined,
        status: (statusFilter as "open" | "waiting" | "closed" | "spam" | "interested" | "meeting" | "won" | "lost") || undefined,
        limit: 50,
      };


      if (assigneeFilter === "mine") {
        filters.assigneeId = currentUser.id;
      } else if (assigneeFilter === "unassigned") {
        filters.assigneeId = "unassigned";
      }

      const list = await listConversationsAction(projectId, filters);
      setConversations(list);

      // If active conversation is in the list, refresh it
      if (selectedIdToKeep) {
        const found = list.find((c) => c.id === selectedIdToKeep);
        if (found) {
          // Keep active id
        }
      }
    } catch (err) {
      console.error("Failed to load conversations list", err);
    } finally {
      setLoadingList(false);
    }
  };

  // Trigger list reload on filter changes
  useEffect(() => {
    fetchConversations(activeId || undefined);
  }, [statusFilter, assigneeFilter, searchTerm]);

  // Periodic check (every 30s)
  useEffect(() => {
    const timer = setInterval(() => {
      fetchConversations(activeId || undefined);
      if (activeId) {
        refreshActiveConversationMessages(activeId);
      }
    }, 30000);
    return () => clearInterval(timer);
  }, [activeId]);

  // Load a single conversation details + message list
  const loadConversation = async (id: string) => {
    setLoadingDetail(true);
    try {
      const res = await getConversationDetailAction(projectId, id);
      setDetail(res.detail);
      setMessages(res.messages);
      setActiveId(id);

      // Clear local unread dot
      setConversations((prev) =>
        prev.map((c) => (c.id === id ? { ...c, unreadCount: 0 } : c))
      );
    } catch (err) {
      console.error("Failed to load conversation details", err);
    } finally {
      setLoadingDetail(false);
    }
  };

  // Silent refresh of active thread messages
  const refreshActiveConversationMessages = async (id: string) => {
    try {
      const res = await getConversationDetailAction(projectId, id);
      setDetail(res.detail);
      setMessages(res.messages);
    } catch (err) {
      console.error("Silent message refresh failed", err);
    }
  };

  // Scroll to bottom of message thread
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Handlers
  const handleStatusChange = async (newStatus: "open" | "waiting" | "closed" | "spam" | "interested" | "meeting" | "won" | "lost") => {
    if (!activeId) return;

    try {
      await updateConversationStatusAction(projectId, activeId, newStatus);
      setDetail((prev) => (prev ? { ...prev, status: newStatus } : null));
      // Refresh list to reflect new status
      fetchConversations(activeId);
    } catch (err) {
      alert("Failed to update status");
    }
  };

  const handleAssigneeChange = async (assigneeId: string | null) => {
    if (!activeId) return;
    const value = assigneeId === "unassigned" ? null : assigneeId;
    try {
      await assignConversationAction(projectId, activeId, value);
      const assigneeName = teamMembers.find((m) => m.id === value)?.name ?? null;
      setDetail((prev) => (prev ? { ...prev, assigneeId: value, assigneeName } : null));
      fetchConversations(activeId);
    } catch (err) {
      alert("Failed to assign conversation");
    }
  };

  const handleSendReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeId || !replyText.trim() || sendingReply) return;

    setSendingReply(true);
    try {
      const formattedHtml = replyText.replace(/\n/g, "<br />");
      await sendReplyAction(projectId, activeId, formattedHtml);
      setReplyText("");
      // Reload thread and status
      await refreshActiveConversationMessages(activeId);
      // Reload list to move conversation to the top and set state to Waiting
      fetchConversations(activeId);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to send email reply");
    } finally {
      setSendingReply(false);
    }
  };

  // Helper: Avatar Initials
  const getInitials = (name?: string | null, email?: string | null) => {
    const text = name || email || "Lead";
    return text.split(/\s+/).map((n) => n[0]).join("").toUpperCase().slice(0, 2);
  };

  const getStatusColor = (status: string) => {
    return STATUS_OPTIONS.find((o) => o.value === status)?.color || "";
  };

  return (
    <div className="flex h-full border border-border/60 rounded-xl overflow-hidden bg-background">
      {/* Left Sidebar Pane: Status lists & search */}
      <div className="w-80 flex flex-col border-r border-border/60 bg-card">
        {/* Header navigation & title */}
        <div className="p-4 border-b border-border/50 space-y-3">
          <div className="flex items-center justify-between">
            <Link
              href={`/projects/${projectId}`}
              className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="size-3.5" />
              Dashboard
            </Link>
            <span className="text-[10px] bg-indigo-500/10 border border-indigo-500/30 text-indigo-400 px-1.5 py-0.5 rounded-full font-semibold">
              Reply Center
            </span>
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight text-foreground flex items-center gap-2">
              <Inbox className="size-4.5 text-indigo-500" />
              Inbox Conversations
            </h1>
          </div>

          {/* Search bar */}
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search conversations..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 bg-background border border-border rounded-lg text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>
        </div>

        {/* System & status filters tab panel */}
        <div className="flex border-b border-border/50 text-[11px] font-semibold text-muted-foreground">
          <button
            onClick={() => setAssigneeFilter("all")}
            className={cn(
              "flex-1 py-2 text-center border-b transition-colors",
              assigneeFilter === "all" ? "border-indigo-500 text-indigo-400 bg-indigo-500/5" : "border-transparent hover:text-foreground"
            )}
          >
            All
          </button>
          <button
            onClick={() => setAssigneeFilter("mine")}
            className={cn(
              "flex-1 py-2 text-center border-b transition-colors",
              assigneeFilter === "mine" ? "border-indigo-500 text-indigo-400 bg-indigo-500/5" : "border-transparent hover:text-foreground"
            )}
          >
            My Inbox
          </button>
          <button
            onClick={() => setAssigneeFilter("unassigned")}
            className={cn(
              "flex-1 py-2 text-center border-b transition-colors",
              assigneeFilter === "unassigned" ? "border-indigo-500 text-indigo-400 bg-indigo-500/5" : "border-transparent hover:text-foreground"
            )}
          >
            Unassigned
          </button>
        </div>

        {/* Horizontal Status pill filters */}
        <div className="p-2 border-b border-border/50 flex gap-1 overflow-x-auto scrollbar-thin">
          {STATUS_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setStatusFilter(opt.value)}
              className={cn(
                "px-2.5 py-1 rounded-full text-[10px] font-bold border transition-all whitespace-nowrap",
                statusFilter === opt.value
                  ? "bg-indigo-600 text-white border-indigo-600 shadow-md shadow-indigo-600/10"
                  : "bg-background/80 text-muted-foreground border-border hover:text-foreground hover:bg-muted"
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* List scroll container */}
        <div className="flex-1 overflow-y-auto divide-y divide-border/40">
          {loadingList && conversations.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 gap-2 text-muted-foreground">
              <Loader2 className="size-5 animate-spin text-indigo-500" />
              <span className="text-xs">Loading replies...</span>
            </div>
          ) : conversations.length === 0 ? (
            <div className="text-center py-12 px-4 text-xs text-muted-foreground">
              No replies matching criteria.
            </div>
          ) : (
            conversations.map((c) => {
              const active = activeId === c.id;
              const initials = getInitials(c.contactName, c.contactEmail);
              const unread = c.unreadCount > 0;
              return (
                <button
                  key={c.id}
                  onClick={() => loadConversation(c.id)}
                  className={cn(
                    "w-full text-left p-3.5 flex items-start gap-3 transition-colors hover:bg-muted/40",
                    active ? "bg-indigo-600/10 border-l-2 border-indigo-500" : ""
                  )}
                >
                  {/* Lead initials avatar */}
                  <div className="size-9 rounded-full flex-shrink-0 bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 font-bold flex items-center justify-center text-xs relative">
                    {initials}
                    {unread && (
                      <span className="absolute -top-0.5 -right-0.5 size-2.5 bg-emerald-500 rounded-full border-2 border-card ring-2 ring-emerald-500/35" />
                    )}
                  </div>

                  {/* Info column */}
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center justify-between gap-1">
                      <span className="font-semibold text-xs text-foreground truncate">
                        {c.contactName || c.contactEmail}
                      </span>
                      <span className="text-[10px] text-muted-foreground whitespace-nowrap flex items-center gap-1">
                        <Clock className="size-3" />
                        {new Date(c.lastMessageAt).toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric",
                        })}
                      </span>
                    </div>

                    <div className="text-[11px] font-medium text-foreground truncate">
                      {c.subject}
                    </div>

                    <div className="text-[10px] text-muted-foreground truncate">
                      {c.lastMessageText || "Sent a reply"}
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* Middle Pane: Thread flow & Composer */}
      <div className="flex-1 flex flex-col bg-background/50">
        {!activeId ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-8 gap-3">
            <div className="size-16 rounded-2xl bg-indigo-500/5 border border-indigo-500/10 flex items-center justify-center text-indigo-400">
              <Inbox className="size-8" />
            </div>
            <div>
              <h2 className="font-semibold text-sm text-foreground">Select a conversation</h2>
              <p className="text-xs text-muted-foreground mt-1 max-w-xs">
                Interact with synced inbound email replies, analyze scores, summaries, and respond in real-time.
              </p>
            </div>
          </div>
        ) : loadingDetail && messages.length === 0 ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="size-6 animate-spin text-indigo-500" />
          </div>
        ) : (
          <>
            {/* Conversation detail header cockpit */}
            <div className="p-4 border-b border-border/60 bg-card flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="font-bold text-sm text-foreground">{detail?.subject}</h2>
                <div className="text-[10px] text-muted-foreground flex items-center gap-1.5 mt-0.5">
                  <span>To: <strong>{detail?.inboxEmail}</strong></span>
                  <span>•</span>
                  {detail?.campaignSubject && (
                    <span>Campaign: <strong className="text-indigo-400">{detail.campaignSubject}</strong></span>
                  )}
                </div>
              </div>

              {/* Assignments / Status controls */}
              <div className="flex items-center gap-2">
                {/* Assignee select */}
                <div className="flex items-center gap-1">
                  <User className="size-3.5 text-muted-foreground" />
                  <select
                    value={detail?.assigneeId || "unassigned"}
                    onChange={(e) => handleAssigneeChange(e.target.value)}
                    className="bg-background border border-border rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  >
                    <option value="unassigned">Unassigned</option>
                    {teamMembers.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name || m.email}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Status select */}
                <div>
                  <select
                    value={detail?.status || "open"}
                    onChange={(e) => handleStatusChange(e.target.value as "open" | "waiting" | "closed" | "spam" | "interested" | "meeting" | "won" | "lost")}
                    className={cn(
                      "border rounded px-2.5 py-1 text-xs font-bold focus:outline-none focus:ring-1 focus:ring-indigo-500 uppercase",
                      detail ? getStatusColor(detail.status) : ""
                    )}
                  >
                    {STATUS_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value} className="bg-background text-foreground font-semibold">
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Scrollable message thread list */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {messages.map((m) => {
                const incoming = m.type === "incoming";
                return (
                  <div
                    key={m.id}
                    className={cn(
                      "flex items-start gap-3 max-w-[85%]",
                      incoming ? "mr-auto" : "ml-auto flex-row-reverse"
                    )}
                  >
                    {/* Tiny initial avatar for each bubble */}
                    <div className={cn(
                      "size-8 rounded-full border flex-shrink-0 flex items-center justify-center font-bold text-[10px]",
                      incoming ? "bg-indigo-500/10 border-indigo-500/20 text-indigo-400" : "bg-zinc-800 border-border text-foreground"
                    )}>
                      {incoming ? getInitials(detail?.contactName, detail?.contactEmail) : getInitials(currentUser.name, currentUser.email)}
                    </div>

                    <div className="space-y-1">
                      {/* Name & timestamp */}
                      <div className={cn(
                        "flex items-center gap-2 text-[10px] text-muted-foreground",
                        incoming ? "justify-start" : "justify-end"
                      )}>
                        <span className="font-semibold text-foreground">
                          {incoming ? (m.fromName || m.fromAddress) : (detail?.assigneeName || "System Outbox")}
                        </span>
                        <span>•</span>
                        <span>{new Date(m.timestamp).toLocaleString()}</span>
                      </div>

                      {/* Message Bubble Card */}
                      <div className={cn(
                        "p-4 rounded-2xl border text-sm shadow-sm",
                        incoming
                          ? "bg-card border-border/70 text-foreground rounded-tl-none"
                          : "bg-indigo-600 border-indigo-500 text-white rounded-tr-none"
                      )}>
                        {/* Body html render */}
                        {m.bodyHtml ? (
                          <div
                            className="prose prose-sm max-w-none break-words leading-relaxed"
                            dangerouslySetInnerHTML={{ __html: m.bodyHtml }}
                          />
                        ) : (
                          <div className="whitespace-pre-wrap leading-relaxed">{m.bodyText}</div>
                        )}

                        {/* Sentiment tag inline */}
                        {incoming && m.sentiment && (
                          <div className="mt-3 flex items-center gap-1.5">
                            <span className={cn(
                              "text-[9px] px-1.5 py-0.5 rounded-full font-bold uppercase tracking-wider",
                              m.sentiment === "positive" ? "bg-emerald-500/20 text-emerald-400" :
                              m.sentiment === "negative" ? "bg-rose-500/20 text-rose-400" :
                              "bg-zinc-500/20 text-zinc-400"
                            )}>
                              {m.sentiment}
                            </span>
                          </div>
                        )}

                        {/* Attachments List */}
                        {incoming && m.attachments && m.attachments.length > 0 && (
                          <div className="mt-4 pt-3 border-t border-border/40 space-y-1.5">
                            <span className="text-[10px] font-semibold text-muted-foreground flex items-center gap-1">
                              <Paperclip className="size-3" />
                              Attachments ({m.attachments.length})
                            </span>
                            <div className="flex flex-wrap gap-2">
                              {m.attachments.map((att, index) => (
                                <div
                                  key={index}
                                  className="flex items-center gap-1 px-2 py-1 rounded bg-background border border-border text-[11px] font-medium"
                                >
                                  <span className="text-foreground max-w-[120px] truncate">{att.filename}</span>
                                  <span className="text-muted-foreground text-[9px]">({Math.round(att.size / 1024)} KB)</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            {/* Composer Reply Box */}
            <div className="p-4 border-t border-border/60 bg-card">
              <form onSubmit={handleSendReply} className="space-y-3">
                <div className="relative">
                  <textarea
                    rows={3}
                    placeholder={`Reply to ${detail?.contactName || detail?.contactEmail}...`}
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    required
                    className="w-full px-3 py-2.5 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 placeholder-muted-foreground resize-none"
                  />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                    <Shield className="size-3" />
                    Sent via default profile transport
                  </span>
                  <button
                    type="submit"
                    disabled={sendingReply || !replyText.trim()}
                    className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-semibold rounded-lg text-xs flex items-center gap-1.5 transition-colors shadow-md shadow-indigo-600/10"
                  >
                    {sendingReply ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <Send className="size-3.5" />
                    )}
                    Send Reply
                  </button>
                </div>
              </form>
            </div>
          </>
        )}
      </div>

      {/* Right Sidebar: Context details, AI summary & lead scoring */}
      {activeId && detail && (
        <div className="w-80 border-l border-border/60 bg-card overflow-y-auto divide-y divide-border/50">
          {/* Section 1: Lead/Contact Information */}
          <div className="p-4 text-center space-y-3.5">
            <div className="size-16 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-xl font-bold flex items-center justify-center mx-auto shadow-sm">
              {getInitials(detail.contactName, detail.contactEmail)}
            </div>
            <div>
              <h3 className="font-bold text-sm text-foreground">{detail.contactName || "Unknown Lead"}</h3>
              <p className="text-xs text-muted-foreground mt-0.5">{detail.contactEmail}</p>
            </div>
          </div>

          {/* Section 2: AI Summary Placeholder */}
          <div className="p-4 space-y-2">
            <h4 className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
              <MessageSquare className="size-3.5 text-indigo-500" />
              AI Conversation Summary
            </h4>
            <div className="p-3 bg-muted/40 border border-border/40 rounded-lg text-xs text-foreground leading-relaxed">
              {detail.aiSummary || "AI summary will render here once reply sync completes analysis."}
            </div>
          </div>

          {/* Section 3: Circular Lead Score Indicator */}
          <div className="p-4 space-y-2">
            <h4 className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
              <Tag className="size-3.5 text-indigo-500" />
              Lead Engagement Score
            </h4>
            <div className="flex items-center gap-4 bg-muted/20 border border-border/40 p-3.5 rounded-lg">
              {/* Circular gauge */}
              <div className="relative size-12 flex-shrink-0">
                <svg className="size-full -rotate-90" viewBox="0 0 36 36">
                  <path
                    className="text-border"
                    strokeWidth="3.5"
                    stroke="currentColor"
                    fill="none"
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  />
                  <path
                    className="text-indigo-500"
                    strokeWidth="3.5"
                    strokeDasharray={`${detail.leadScore || 75}, 100`}
                    strokeLinecap="round"
                    stroke="currentColor"
                    fill="none"
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-foreground">
                  {detail.leadScore || 75}%
                </div>
              </div>
              <div>
                <div className="font-semibold text-xs text-foreground">Score: {detail.leadScore || 75} / 100</div>
                <div className="text-[10px] text-muted-foreground mt-0.5">High intent category response detected.</div>
              </div>
            </div>
          </div>

          {/* Section 4: Configuration & Linking Details */}
          <div className="p-4 space-y-3 text-xs">
            <h4 className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
              Thread Details
            </h4>
            <div className="space-y-2">
              <div className="flex items-center justify-between text-muted-foreground">
                <span>Inbox connection</span>
                <span className="font-medium text-foreground truncate max-w-[120px]" title={detail.inboxEmail || ""}>
                  {detail.inboxEmail}
                </span>
              </div>
              <div className="flex items-center justify-between text-muted-foreground">
                <span>Profile ID</span>
                <span className="font-mono text-[10px] text-foreground truncate max-w-[120px]" title={detail.communicationProfileId || ""}>
                  {detail.communicationProfileId || "Default Resend"}
                </span>
              </div>
              <div className="flex items-center justify-between text-muted-foreground">
                <span>Campaign ID</span>
                <span className="font-mono text-[10px] text-foreground truncate max-w-[120px]" title={detail.campaignId || ""}>
                  {detail.campaignId || "None"}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
