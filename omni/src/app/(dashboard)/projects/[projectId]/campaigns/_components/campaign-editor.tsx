"use client";

import { useActionState, useEffect, useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import type { FormState, DraftState } from "../actions";

type Option = { id: string; label: string };

interface Props {
  editable: boolean;
  aiConfigured: boolean;
  initial: {
    subject: string;
    bodyHtml: string;
    previewText: string;
    listId: string;
    sendingDomainId: string;
    signatureId: string;
  };
  lists: Option[];
  domains: Option[];
  signatures: Option[];
  updateAction: (prev: FormState, formData: FormData) => Promise<FormState>;
  draftAction: (prev: DraftState, formData: FormData) => Promise<DraftState>;
}

export function CampaignEditor({
  editable,
  aiConfigured,
  initial,
  lists,
  domains,
  signatures,
  updateAction,
  draftAction,
}: Props) {
  const [subject, setSubject] = useState(initial.subject);
  const [bodyHtml, setBodyHtml] = useState(initial.bodyHtml);
  const [previewText, setPreviewText] = useState(initial.previewText);
  const [listId, setListId] = useState(initial.listId);
  const [sendingDomainId, setSendingDomainId] = useState(initial.sendingDomainId);
  const [signatureId, setSignatureId] = useState(initial.signatureId);

  const [saveState, saveAction, saving] = useActionState<FormState, FormData>(updateAction, {
    status: "idle",
  });
  const [draftResult, runDraftAction, drafting] = useActionState<DraftState, FormData>(draftAction, {
    status: "idle",
  });

  // When the AI returns a draft, fill the editor.
  useEffect(() => {
    if (draftResult.status === "success") {
      if (draftResult.subject) setSubject(draftResult.subject);
      setBodyHtml(draftResult.bodyHtml);
    }
  }, [draftResult]);

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="space-y-4">
        {aiConfigured && editable && (
          <Card className="space-y-3 p-4">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Sparkles className="size-4" /> Draft with AI
            </div>
            <form action={runDraftAction} className="space-y-2">
              <input type="hidden" name="currentSubject" value={subject} />
              <input type="hidden" name="currentBodyHtml" value={bodyHtml} />
              <Textarea
                name="instructions"
                rows={3}
                placeholder="e.g. Announce our Q3 distributor pricing update, warm and concise."
                required
              />
              <div className="grid grid-cols-2 gap-2">
                <Input name="tone" placeholder="Tone (optional)" />
                <Input name="audience" placeholder="Audience (optional)" />
              </div>
              <Button type="submit" size="sm" variant="outline" disabled={drafting}>
                {drafting ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
                Generate draft
              </Button>
              {draftResult.status === "error" && (
                <p className="text-sm text-red-600">{draftResult.message}</p>
              )}
            </form>
          </Card>
        )}

        <form action={saveAction} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="subject">Subject</Label>
            <Input
              id="subject"
              name="subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              disabled={!editable}
              placeholder="Subject line (supports {{name}})"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="previewText">Preview text</Label>
            <Input
              id="previewText"
              name="previewText"
              value={previewText}
              onChange={(e) => setPreviewText(e.target.value)}
              disabled={!editable}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="bodyHtml">Body (HTML)</Label>
            <Textarea
              id="bodyHtml"
              name="bodyHtml"
              rows={12}
              value={bodyHtml}
              onChange={(e) => setBodyHtml(e.target.value)}
              disabled={!editable}
              className="font-mono text-sm"
              placeholder="<p>Hello {{name}}…</p>"
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="listId">List</Label>
              <select
                id="listId"
                name="listId"
                value={listId}
                onChange={(e) => setListId(e.target.value)}
                disabled={!editable}
                className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
              >
                <option value="">— select —</option>
                {lists.map((o) => (
                  <option key={o.id} value={o.id}>{o.label}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sendingDomainId">Sending domain</Label>
              <select
                id="sendingDomainId"
                name="sendingDomainId"
                value={sendingDomainId}
                onChange={(e) => setSendingDomainId(e.target.value)}
                disabled={!editable}
                className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
              >
                <option value="">— select —</option>
                {domains.map((o) => (
                  <option key={o.id} value={o.id}>{o.label}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="signatureId">Signature</Label>
              <select
                id="signatureId"
                name="signatureId"
                value={signatureId}
                onChange={(e) => setSignatureId(e.target.value)}
                disabled={!editable}
                className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
              >
                <option value="">— none —</option>
                {signatures.map((o) => (
                  <option key={o.id} value={o.id}>{o.label}</option>
                ))}
              </select>
            </div>
          </div>

          {editable && (
            <div className="flex items-center gap-3">
              <Button type="submit" disabled={saving}>
                {saving && <Loader2 className="size-4 animate-spin" />}
                Save draft
              </Button>
              {saveState.status === "success" && (
                <span className="text-sm text-green-600">{saveState.message}</span>
              )}
              {saveState.status === "error" && (
                <span className="text-sm text-red-600">{saveState.message ?? "Couldn't save"}</span>
              )}
            </div>
          )}
        </form>
      </div>

      <div className="space-y-2">
        <Label>Preview</Label>
        <Card className="p-4">
          <p className="mb-2 text-sm font-medium">{subject || "(no subject)"}</p>
          <div
            className="prose prose-sm max-w-none text-sm"
            dangerouslySetInnerHTML={{ __html: bodyHtml || "<p class='text-muted-foreground'>Nothing yet…</p>" }}
          />
        </Card>
      </div>
    </div>
  );
}
