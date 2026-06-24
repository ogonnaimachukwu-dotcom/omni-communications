"use client";

import { useActionState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import type { FormState } from "../actions";

interface Props {
  createAction: (prev: FormState, formData: FormData) => Promise<FormState>;
}

export function NewCampaignForm({ createAction }: Props) {
  const [state, action, pending] = useActionState<FormState, FormData>(createAction, { status: "idle" });

  return (
    <Card className="max-w-lg space-y-4 p-6">
      <form action={action} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="subject">Subject</Label>
          <Input id="subject" name="subject" placeholder="Subject line (you can edit this later)" />
        </div>
        <Button type="submit" disabled={pending}>
          {pending && <Loader2 className="size-4 animate-spin" />}
          Create draft
        </Button>
        {state.status === "error" && (
          <p className="text-sm text-red-600">{state.message ?? "Couldn't create campaign"}</p>
        )}
      </form>
    </Card>
  );
}
