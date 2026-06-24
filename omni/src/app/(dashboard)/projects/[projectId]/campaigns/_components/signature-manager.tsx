"use client";

import { useActionState } from "react";
import { Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import type { FormState } from "../actions";

type Sig = { id: string; name: string; isDefault: boolean };

interface Props {
  signatures: Sig[];
  createAction: (prev: FormState, formData: FormData) => Promise<FormState>;
  deleteAction: (formData: FormData) => void | Promise<void>;
}

export function SignatureManager({ signatures, createAction, deleteAction }: Props) {
  const [state, action, pending] = useActionState<FormState, FormData>(createAction, { status: "idle" });

  return (
    <Card className="space-y-4 p-4">
      <h3 className="text-sm font-medium">Signatures</h3>

      <ul className="space-y-1">
        {signatures.length === 0 && (
          <li className="text-sm text-muted-foreground">No signatures yet.</li>
        )}
        {signatures.map((s) => (
          <li key={s.id} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
            <span>
              {s.name}
              {s.isDefault && <span className="ml-2 text-xs text-muted-foreground">(default)</span>}
            </span>
            <form action={deleteAction}>
              <input type="hidden" name="id" value={s.id} />
              <Button type="submit" variant="ghost" size="sm" aria-label="Delete signature">
                <Trash2 className="size-4" />
              </Button>
            </form>
          </li>
        ))}
      </ul>

      <form action={action} className="space-y-2 border-t pt-3">
        <div className="space-y-1.5">
          <Label htmlFor="sig-name">Name</Label>
          <Input id="sig-name" name="name" placeholder="Default signature" required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="sig-html">HTML</Label>
          <Textarea id="sig-html" name="html" rows={3} className="font-mono text-sm" required />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="isDefault" /> Set as default
        </label>
        <Button type="submit" size="sm" disabled={pending}>
          {pending && <Loader2 className="size-4 animate-spin" />}
          Add signature
        </Button>
        {state.status === "error" && (
          <p className="text-sm text-red-600">{state.message ?? "Couldn't create"}</p>
        )}
      </form>
    </Card>
  );
}
