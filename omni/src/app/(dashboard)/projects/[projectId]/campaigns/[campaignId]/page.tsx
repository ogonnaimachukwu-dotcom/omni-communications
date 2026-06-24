import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Trash2 } from "lucide-react";
import { idSchema as projectIdSchema } from "@/core/projects/project.schema";
import { getProject } from "@/core/projects/project.service";
import { getCampaign } from "@/core/campaigns/campaign.service";
import { listLists } from "@/core/distributors/list.service";
import { listSendingDomains } from "@/core/sending-domains/sending-domain.service";
import { listSignatures } from "@/core/signatures/signature.service";
import { isAiConfigured } from "@/lib/ai";
import { Button } from "@/components/ui/button";
import { CampaignEditor } from "../_components/campaign-editor";
import { SendBar } from "../_components/send-bar";
import { SignatureManager } from "../_components/signature-manager";
import {
  updateCampaignAction,
  draftCampaignAction,
  approveCampaignAction,
  sendCampaignAction,
  cancelScheduleAction,
  deleteCampaignAction,
  createSignatureAction,
  deleteSignatureAction,
} from "../actions";

export default async function CampaignDetailPage({
  params,
}: {
  params: Promise<{ projectId: string; campaignId: string }>;
}) {
  const { projectId, campaignId } = await params;
  const pid = projectIdSchema.safeParse(projectId);
  if (!pid.success) notFound();

  const project = await getProject(pid.data);
  if (!project) notFound();

  const campaign = await getCampaign(project.id, campaignId);
  if (!campaign) notFound();

  const [lists, domains, signatures] = await Promise.all([
    listLists(project.id),
    listSendingDomains(project.id),
    listSignatures(project.id),
  ]);

  const editable = campaign.status === "draft";

  return (
    <div className="space-y-6">
      <Link
        href={`/projects/${project.id}/campaigns`}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Campaigns
      </Link>

      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">{campaign.subject || "Untitled campaign"}</h1>
        {editable && (
          <form action={deleteCampaignAction.bind(null, project.id, campaign.id)}>
            <Button type="submit" variant="ghost" size="sm">
              <Trash2 className="size-4" /> Delete
            </Button>
          </form>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <CampaignEditor
          editable={editable}
          aiConfigured={isAiConfigured()}
          initial={{
            subject: campaign.subject,
            bodyHtml: campaign.bodyHtml,
            previewText: campaign.previewText ?? "",
            listId: campaign.listId ?? "",
            sendingDomainId: campaign.sendingDomainId ?? "",
            signatureId: campaign.signatureId ?? "",
          }}
          lists={lists.map((l) => ({ id: l.id, label: l.name }))}
          domains={domains.map((d) => ({ id: d.id, label: `${d.fromName} <${d.fromEmail}>` }))}
          signatures={signatures.map((s) => ({ id: s.id, label: s.name }))}
          updateAction={updateCampaignAction.bind(null, project.id, campaign.id)}
          draftAction={draftCampaignAction.bind(null, project.id)}
        />

        <div className="space-y-6">
          <SendBar
            status={campaign.status}
            scheduledAt={campaign.scheduledAt ? campaign.scheduledAt.toISOString() : null}
            counts={{
              total: campaign.totalRecipients,
              sent: campaign.sentCount,
              delivered: campaign.deliveredCount,
              failed: campaign.failedCount,
            }}
            approveAction={approveCampaignAction.bind(null, project.id, campaign.id)}
            sendAction={sendCampaignAction.bind(null, project.id, campaign.id)}
            cancelAction={cancelScheduleAction.bind(null, project.id, campaign.id)}
          />

          <SignatureManager
            signatures={signatures.map((s) => ({ id: s.id, name: s.name, isDefault: s.isDefault }))}
            createAction={createSignatureAction.bind(null, project.id)}
            deleteAction={deleteSignatureAction.bind(null, project.id)}
          />
        </div>
      </div>
    </div>
  );
}
