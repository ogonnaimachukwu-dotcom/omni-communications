"use client";

import { useState, useEffect } from "react";
import {
  createSendingProviderAction,
  removeSendingProviderAction,
  testSendingProviderAction,
  createInboxConnectionAction,
  removeInboxConnectionAction,
  testInboxConnectionAction,
  createTrackingProviderAction,
  removeTrackingProviderAction,
  createCommunicationProfileAction,
  removeCommunicationProfileAction,
  updateSendingProviderAction,
  setDefaultSendingProviderAction,
  getProviderStatisticsAction,
} from "../actions";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Plus, Trash, Activity, Check, AlertCircle, RefreshCw, Send, Mail, ShieldCheck, Settings, Star, Edit2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface SenderItem {
  id: string;
  name: string;
  type: string;
  status: string;
  isDefault: boolean;
}


interface InboxItem {
  id: string;
  email: string;
  type: string;
  status: string;
  lastSyncedAt: Date | null;
}

interface TrackerItem {
  id: string;
  name: string;
  type: string;
  status: string;
}

interface ProfileItem {
  id: string;
  name: string;
  sendingProviderId: string | null;
  inboxConnectionId: string | null;
  trackingProviderId: string | null;
  signatureId: string | null;
  dailyLimit: number;
  replyAlias: string;
  timezone: string;
}

interface Props {
  projectId: string;
  initialSenders: SenderItem[];
  initialInboxes: InboxItem[];
  initialTrackers: TrackerItem[];
  initialProfiles: ProfileItem[];
}

export function CommunicationClientView({
  projectId,
  initialSenders,
  initialInboxes,
  initialTrackers,
  initialProfiles,
}: Props) {
  const [senders, setSenders] = useState<SenderItem[]>(initialSenders);
  const [inboxes, setInboxes] = useState<InboxItem[]>(initialInboxes);
  const [trackers, setTrackers] = useState<TrackerItem[]>(initialTrackers);
  const [profiles, setProfiles] = useState<ProfileItem[]>(initialProfiles);

  const [loading, setLoading] = useState<string | null>(null);
  const [stats, setStats] = useState<any[]>([]);
  const [editingSenderId, setEditingSenderId] = useState<string | null>(null);

  // Form states
  const [senderName, setSenderName] = useState("");
  const [senderType, setSenderType] = useState<"resend" | "smtp">("resend");
  const [resendKey, setResendKey] = useState("");
  const [smtpHost, setSmtpHost] = useState("");
  const [smtpPort, setSmtpPort] = useState("587");
  const [smtpSecure, setSmtpSecure] = useState(false);
  const [smtpUser, setSmtpUser] = useState("");
  const [smtpPass, setSmtpPass] = useState("");

  const [inboxEmail, setInboxEmail] = useState("");
  const [inboxType, setInboxType] = useState<"imap">("imap");
  const [imapHost, setImapHost] = useState("");
  const [imapPort, setImapPort] = useState("993");
  const [imapSecure, setImapSecure] = useState(true);
  const [imapUser, setImapUser] = useState("");
  const [imapPass, setImapPass] = useState("");

  const [trackerName, setTrackerName] = useState("");
  const [trackerSecret, setTrackerSecret] = useState("");

  const [profileName, setProfileName] = useState("");
  const [profileSenderId, setProfileSenderId] = useState("");
  const [profileInboxId, setProfileInboxId] = useState("");
  const [profileTrackerId, setProfileTrackerId] = useState("");
  const [profileAlias, setProfileAlias] = useState("");

  const fetchStats = async () => {
    try {
      const data = await getProviderStatisticsAction(projectId);
      setStats(data);
    } catch (err) {
      console.error("Failed to load statistics", err);
    }
  };

  useEffect(() => {
    fetchStats();
  }, [projectId]);

  const handleEditSender = (s: SenderItem) => {
    setEditingSenderId(s.id);
    setSenderName(s.name);
    setSenderType(s.type as any);
    setResendKey("");
    setSmtpHost("");
    setSmtpPort("587");
    setSmtpSecure(false);
    setSmtpUser("");
    setSmtpPass("");
  };

  const handleCancelEdit = () => {
    setEditingSenderId(null);
    setSenderName("");
    setResendKey("");
    setSmtpHost("");
    setSmtpUser("");
    setSmtpPass("");
  };

  async function handleSetDefaultSender(id: string) {
    setLoading(`default_${id}`);
    try {
      await setDefaultSendingProviderAction(projectId, id);
      setSenders(senders.map(s => ({
        ...s,
        isDefault: s.id === id
      })));
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to set default sender");
    } finally {
      setLoading(null);
    }
  }

  async function handleAddSender(e: React.FormEvent) {
    e.preventDefault();
    setLoading(editingSenderId ? "update_sender" : "add_sender");
    try {
      const config =
        senderType === "resend"
          ? { apiKey: resendKey }
          : { host: smtpHost, port: Number(smtpPort), secure: smtpSecure, username: smtpUser, password: smtpPass };

      if (editingSenderId) {
        const updated = await updateSendingProviderAction(projectId, editingSenderId, senderName, config);
        setSenders(senders.map(s => s.id === editingSenderId ? { ...s, name: updated.name, type: updated.type } : s));
        setEditingSenderId(null);
      } else {
        const newSender = await createSendingProviderAction(projectId, senderName, senderType, config);
        setSenders([...senders, { id: newSender.id, name: newSender.name, type: newSender.type, status: newSender.status, isDefault: newSender.isDefault }]);
      }
      setSenderName("");
      setResendKey("");
      setSmtpHost("");
      setSmtpUser("");
      setSmtpPass("");
      fetchStats();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to save sender");
    } finally {
      setLoading(null);
    }
  }


  async function handleRemoveSender(id: string) {
    if (!confirm("Are you sure?")) return;
    try {
      await removeSendingProviderAction(projectId, id);
      setSenders(senders.filter(s => s.id !== id));
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete");
    }
  }

  async function handleTestSender(id: string) {
    setLoading(id);
    try {
      const success = await testSendingProviderAction(projectId, id);
      setSenders(senders.map(s => (s.id === id ? { ...s, status: success ? "active" : "invalid" } : s)));
      alert(success ? "Connection Succeeded!" : "Connection Failed!");
    } catch (err) {
      alert(err instanceof Error ? err.message : "Test failed");
    } finally {
      setLoading(null);
    }
  }

  async function handleAddInbox(e: React.FormEvent) {
    e.preventDefault();
    setLoading("add_inbox");
    try {
      const config = { host: imapHost, port: Number(imapPort), secure: imapSecure, username: imapUser, password: imapPass };
      const newInbox = await createInboxConnectionAction(projectId, inboxEmail, "imap", config);
      setInboxes([
        ...inboxes,
        { id: newInbox.id, email: newInbox.email, type: newInbox.type, status: newInbox.status, lastSyncedAt: null },
      ]);
      setInboxEmail("");
      setImapHost("");
      setImapUser("");
      setImapPass("");
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to add inbox");
    } finally {
      setLoading(null);
    }
  }

  async function handleRemoveInbox(id: string) {
    if (!confirm("Are you sure?")) return;
    try {
      await removeInboxConnectionAction(projectId, id);
      setInboxes(inboxes.filter(i => i.id !== id));
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete");
    }
  }

  async function handleTestInbox(id: string) {
    setLoading(id);
    try {
      const success = await testInboxConnectionAction(projectId, id);
      setInboxes(inboxes.map(i => (i.id === id ? { ...i, status: success ? "active" : "invalid" } : i)));
      alert(success ? "Inbox sync test Succeeded!" : "Inbox sync test Failed!");
    } catch (err) {
      alert(err instanceof Error ? err.message : "Test failed");
    } finally {
      setLoading(null);
    }
  }

  async function handleAddTracker(e: React.FormEvent) {
    e.preventDefault();
    setLoading("add_tracker");
    try {
      const config = { secret: trackerSecret };
      const newTracker = await createTrackingProviderAction(projectId, trackerName, "resend_webhook", config);
      setTrackers([...trackers, { id: newTracker.id, name: newTracker.name, type: newTracker.type, status: newTracker.status }]);
      setTrackerName("");
      setTrackerSecret("");
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to add tracking provider");
    } finally {
      setLoading(null);
    }
  }

  async function handleRemoveTracker(id: string) {
    if (!confirm("Are you sure?")) return;
    try {
      await removeTrackingProviderAction(projectId, id);
      setTrackers(trackers.filter(t => t.id !== id));
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete");
    }
  }

  async function handleAddProfile(e: React.FormEvent) {
    e.preventDefault();
    setLoading("add_profile");
    try {
      const newProfile = await createCommunicationProfileAction(
        projectId,
        profileName,
        profileSenderId || null,
        profileInboxId || null,
        profileTrackerId || null,
        null,
        500,
        profileAlias || "Omni Sender",
        "UTC"
      );
      setProfiles([
        ...profiles,
        {
          id: newProfile.id,
          name: newProfile.name,
          sendingProviderId: newProfile.sendingProviderId,
          inboxConnectionId: newProfile.inboxConnectionId,
          trackingProviderId: newProfile.trackingProviderId,
          signatureId: newProfile.signatureId,
          dailyLimit: newProfile.dailyLimit,
          replyAlias: newProfile.replyAlias,
          timezone: newProfile.timezone,
        },
      ]);
      setProfileName("");
      setProfileSenderId("");
      setProfileInboxId("");
      setProfileTrackerId("");
      setProfileAlias("");
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to add profile");
    } finally {
      setLoading(null);
    }
  }

  async function handleRemoveProfile(id: string) {
    if (!confirm("Are you sure?")) return;
    try {
      await removeCommunicationProfileAction(projectId, id);
      setProfiles(profiles.filter(p => p.id !== id));
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete");
    }
  }

  return (
    <div className="grid gap-6 md:grid-cols-3">
      <div className="md:col-span-2 space-y-6">
        {/* Profiles */}
        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings className="size-5 text-indigo-500" />
              Communication Profiles
            </CardTitle>
            <CardDescription>Unified campaign contexts for sending limits and configuration settings.</CardDescription>
          </CardHeader>
          <CardContent>
            {profiles.length === 0 ? (
              <div className="text-center py-6 text-sm text-muted-foreground">No communication profiles created.</div>
            ) : (
              <div className="space-y-3">
                {profiles.map(p => (
                  <div key={p.id} className="flex items-center justify-between p-3 border border-border rounded-lg bg-background">
                    <div>
                      <div className="font-semibold text-sm">{p.name}</div>
                      <div className="text-xs text-muted-foreground">
                        Alias: <span className="text-foreground">{p.replyAlias}</span> • Daily Limit:{" "}
                        <span className="text-foreground">{p.dailyLimit}</span> • Timezone:{" "}
                        <span className="text-foreground">{p.timezone}</span>
                      </div>
                    </div>
                    <button
                      onClick={() => handleRemoveProfile(p.id)}
                      className="p-1.5 text-muted-foreground hover:text-destructive rounded hover:bg-muted transition-colors"
                    >
                      <Trash className="size-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Sending Providers */}
        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Send className="size-5 text-indigo-500" />
              Sending Providers
            </CardTitle>
            <CardDescription>Configured transports responsible only for outbound campaigns.</CardDescription>
          </CardHeader>
          <CardContent>
            {senders.length === 0 ? (
              <div className="text-center py-6 text-sm text-muted-foreground">No sending providers configured.</div>
            ) : (
              <div className="space-y-3">
                {senders.map(s => {
                  const pStats = stats.find(st => st.providerId === s.id);
                  return (
                    <div key={s.id} className="flex flex-col gap-2 p-3 border border-border rounded-lg bg-background">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                          <div
                            className={cn(
                              "size-2 rounded-full",
                              s.status === "active" ? "bg-emerald-500" : "bg-rose-500"
                            )}
                          />
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-sm">{s.name}</span>
                              {s.isDefault && (
                                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-bold bg-indigo-500/15 text-indigo-400 border border-indigo-500/30 rounded-full">
                                  <Star className="size-2.5 fill-indigo-400" /> Default
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-muted-foreground uppercase">{s.type}</div>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5">
                          {!s.isDefault && s.status === "active" && (
                            <button
                              onClick={() => handleSetDefaultSender(s.id)}
                              disabled={loading === `default_${s.id}`}
                              className="p-1.5 text-muted-foreground hover:text-indigo-400 rounded hover:bg-muted transition-colors"
                              title="Set as Default"
                            >
                              <Star className="size-4" />
                            </button>
                          )}
                          <button
                            onClick={() => handleEditSender(s)}
                            className="p-1.5 text-muted-foreground hover:text-foreground rounded hover:bg-muted transition-colors"
                            title="Edit Configuration"
                          >
                            <Edit2 className="size-4" />
                          </button>
                          <button
                            onClick={() => handleTestSender(s.id)}
                            disabled={loading === s.id}
                            className="p-1.5 text-muted-foreground hover:text-foreground rounded hover:bg-muted transition-colors flex items-center gap-1 text-xs"
                          >
                            <Activity className="size-3.5" />
                            Verify
                          </button>
                          <button
                            onClick={() => handleRemoveSender(s.id)}
                            className="p-1.5 text-muted-foreground hover:text-destructive rounded hover:bg-muted transition-colors"
                          >
                            <Trash className="size-4" />
                          </button>
                        </div>
                      </div>

                      {/* Provider Statistics */}
                      <div className="mt-1 flex gap-4 text-[11px] text-muted-foreground border-t border-border/50 pt-2">
                        <span>Sent: <strong className="text-foreground">{pStats?.sent ?? 0}</strong></span>
                        <span>Delivered: <strong className="text-emerald-400">{pStats?.delivered ?? 0}</strong></span>
                        <span>Failed: <strong className="text-rose-400">{pStats?.failed ?? 0}</strong></span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Inboxes */}
        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Mail className="size-5 text-indigo-500" />
              Inbox Connections
            </CardTitle>
            <CardDescription>IMAP configurations listening only for recipient replies.</CardDescription>
          </CardHeader>
          <CardContent>
            {inboxes.length === 0 ? (
              <div className="text-center py-6 text-sm text-muted-foreground">No inbox connections verified.</div>
            ) : (
              <div className="space-y-3">
                {inboxes.map(i => (
                  <div key={i.id} className="flex items-center justify-between p-3 border border-border rounded-lg bg-background">
                    <div className="flex items-center gap-2.5">
                      <div
                        className={cn(
                          "size-2 rounded-full",
                          i.status === "active" ? "bg-emerald-500" : "bg-rose-500"
                        )}
                      />
                      <div>
                        <div className="font-semibold text-sm">{i.email}</div>
                        <div className="text-xs text-muted-foreground uppercase">{i.type}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleTestInbox(i.id)}
                        disabled={loading === i.id}
                        className="p-1.5 text-muted-foreground hover:text-foreground rounded hover:bg-muted transition-colors flex items-center gap-1 text-xs"
                      >
                        <Activity className="size-3.5" />
                        Verify
                      </button>
                      <button
                        onClick={() => handleRemoveInbox(i.id)}
                        className="p-1.5 text-muted-foreground hover:text-destructive rounded hover:bg-muted transition-colors"
                      >
                        <Trash className="size-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Creational Sidebar Forms */}
      <div className="space-y-6">
        {/* Create Profile */}
        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="text-sm">Create Profile</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleAddProfile} className="space-y-3.5">
              <div>
                <label className="text-xs font-semibold text-muted-foreground">Profile Name</label>
                <input
                  type="text"
                  required
                  value={profileName}
                  onChange={e => setProfileName(e.target.value)}
                  placeholder="e.g. CEO Outreach Profile"
                  className="w-full mt-1 px-3 py-1.5 border border-border rounded bg-background text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-muted-foreground">Reply Alias (From Name)</label>
                <input
                  type="text"
                  required
                  value={profileAlias}
                  onChange={e => setProfileAlias(e.target.value)}
                  placeholder="John Doe"
                  className="w-full mt-1 px-3 py-1.5 border border-border rounded bg-background text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-muted-foreground">Sending Provider</label>
                <select
                  value={profileSenderId}
                  onChange={e => setProfileSenderId(e.target.value)}
                  className="w-full mt-1 px-3 py-1.5 border border-border rounded bg-background text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-indigo-500"
                >
                  <option value="">Default Platform Resend</option>
                  {senders.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.type})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-muted-foreground">Inbox Connection</label>
                <select
                  value={profileInboxId}
                  onChange={e => setProfileInboxId(e.target.value)}
                  className="w-full mt-1 px-3 py-1.5 border border-border rounded bg-background text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-indigo-500"
                >
                  <option value="">None (No Replies Sync)</option>
                  {inboxes.map(i => (
                    <option key={i.id} value={i.id}>
                      {i.email}
                    </option>
                  ))}
                </select>
              </div>

              <button
                type="submit"
                disabled={loading === "add_profile"}
                className="w-full py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded text-sm font-semibold transition-colors flex items-center justify-center gap-1.5"
              >
                <Plus className="size-4" />
                Create Profile
              </button>
            </form>
          </CardContent>
        </Card>

        {/* Configure Sending */}
        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="text-sm">{editingSenderId ? "Edit Sending Provider" : "Add Sending Provider"}</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleAddSender} className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-muted-foreground">Name</label>
                <input
                  type="text"
                  required
                  value={senderName}
                  onChange={e => setSenderName(e.target.value)}
                  placeholder="Corporate SMTP Server"
                  className="w-full mt-1 px-3 py-1.5 border border-border rounded bg-background text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-muted-foreground">Type</label>
                <select
                  value={senderType}
                  onChange={e => setSenderType(e.target.value as any)}
                  className="w-full mt-1 px-3 py-1.5 border border-border rounded bg-background text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-indigo-500"
                >
                  <option value="resend">Resend API Key</option>
                  <option value="smtp">Custom SMTP Server</option>
                </select>
              </div>

              {senderType === "resend" ? (
                <div>
                  <label className="text-xs font-semibold text-muted-foreground">Resend API Key</label>
                  <input
                    type="password"
                    required={!editingSenderId}
                    value={resendKey}
                    onChange={e => setResendKey(e.target.value)}
                    placeholder={editingSenderId ? "•••••••••••• (leave blank to keep current)" : "re_..."}
                    className="w-full mt-1 px-3 py-1.5 border border-border rounded bg-background text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
              ) : (
                <div className="space-y-2">
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground">Host</label>
                    <input
                      type="text"
                      required
                      value={smtpHost}
                      onChange={e => setSmtpHost(e.target.value)}
                      placeholder="smtp.example.com"
                      className="w-full mt-1 px-3 py-1.5 border border-border rounded bg-background text-sm text-foreground focus:outline-none"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-xs font-semibold text-muted-foreground">Port</label>
                      <input
                        type="text"
                        required
                        value={smtpPort}
                        onChange={e => setSmtpPort(e.target.value)}
                        className="w-full mt-1 px-3 py-1.5 border border-border rounded bg-background text-sm text-foreground focus:outline-none"
                      />
                    </div>
                    <div className="flex items-center gap-2 pt-5">
                      <input
                        type="checkbox"
                        checked={smtpSecure}
                        onChange={e => setSmtpSecure(e.target.checked)}
                        className="rounded accent-indigo-500"
                      />
                      <label className="text-xs font-semibold text-muted-foreground">Secure (SSL)</label>
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground">Username</label>
                    <input
                      type="text"
                      required
                      value={smtpUser}
                      onChange={e => setSmtpUser(e.target.value)}
                      className="w-full mt-1 px-3 py-1.5 border border-border rounded bg-background text-sm text-foreground focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground">Password</label>
                    <input
                      type="password"
                      required={!editingSenderId}
                      value={smtpPass}
                      onChange={e => setSmtpPass(e.target.value)}
                      placeholder={editingSenderId ? "•••••••••••• (leave blank to keep current)" : ""}
                      className="w-full mt-1 px-3 py-1.5 border border-border rounded bg-background text-sm text-foreground focus:outline-none"
                    />
                  </div>
                </div>
              )}

              <button
                type="submit"
                disabled={loading === "add_sender" || loading === "update_sender"}
                className="w-full py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded text-sm font-semibold transition-colors flex items-center justify-center gap-1.5"
              >
                {editingSenderId ? (
                  <>
                    <Check className="size-4" />
                    Save Changes
                  </>
                ) : (
                  <>
                    <Plus className="size-4" />
                    Add Sender
                  </>
                )}
              </button>

              {editingSenderId && (
                <button
                  type="button"
                  onClick={handleCancelEdit}
                  className="w-full py-1.5 bg-muted hover:bg-muted/80 text-foreground rounded text-sm font-semibold transition-colors mt-2"
                >
                  Cancel Edit
                </button>
              )}
            </form>
          </CardContent>
        </Card>

        {/* Configure Inbox */}
        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="text-sm">Add Inbox Connection</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleAddInbox} className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-muted-foreground">Email Address</label>
                <input
                  type="email"
                  required
                  value={inboxEmail}
                  onChange={e => setInboxEmail(e.target.value)}
                  placeholder="ceo@company.com"
                  className="w-full mt-1 px-3 py-1.5 border border-border rounded bg-background text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-muted-foreground">IMAP Host</label>
                <input
                  type="text"
                  required
                  value={imapHost}
                  onChange={e => setImapHost(e.target.value)}
                  placeholder="imap.company.com"
                  className="w-full mt-1 px-3 py-1.5 border border-border rounded bg-background text-sm text-foreground focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs font-semibold text-muted-foreground">IMAP Port</label>
                  <input
                    type="text"
                    required
                    value={imapPort}
                    onChange={e => setImapPort(e.target.value)}
                    className="w-full mt-1 px-3 py-1.5 border border-border rounded bg-background text-sm text-foreground focus:outline-none"
                  />
                </div>
                <div className="flex items-center gap-2 pt-5">
                  <input
                    type="checkbox"
                    checked={imapSecure}
                    onChange={e => setImapSecure(e.target.checked)}
                    className="rounded accent-indigo-500"
                  />
                  <label className="text-xs font-semibold text-muted-foreground">Secure (SSL)</label>
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-muted-foreground">Username</label>
                <input
                  type="text"
                  required
                  value={imapUser}
                  onChange={e => setImapUser(e.target.value)}
                  className="w-full mt-1 px-3 py-1.5 border border-border rounded bg-background text-sm text-foreground focus:outline-none"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-muted-foreground">Password</label>
                <input
                  type="password"
                  required
                  value={imapPass}
                  onChange={e => setImapPass(e.target.value)}
                  className="w-full mt-1 px-3 py-1.5 border border-border rounded bg-background text-sm text-foreground focus:outline-none"
                />
              </div>

              <button
                type="submit"
                disabled={loading === "add_inbox"}
                className="w-full py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded text-sm font-semibold transition-colors flex items-center justify-center gap-1.5"
              >
                <Plus className="size-4" />
                Add Inbox
              </button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
