"use client";

import * as React from "react";
import { useActionState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { createProjectAction, updateProjectAction, type FormState } from "../actions";
import type { ProjectStatus } from "@/core/projects/project.schema";

interface ProjectDefaults {
  id: string;
  name: string;
  companyName: string | null;
  ceoName: string | null;
  notes: string | null;
  status: ProjectStatus;
}

type Props = { mode: "create" } | { mode: "edit"; project: ProjectDefaults };

const initialState: FormState = { status: "idle" };

export function ProjectForm(props: Props) {
  const action = props.mode === "create" ? createProjectAction : updateProjectAction;
  const [state, formAction, pending] = useActionState(action, initialState);

  const project = props.mode === "edit" ? props.project : undefined;
  const fieldErrors = state.status === "error" ? state.fieldErrors : undefined;

  return (
    <form action={formAction} className="space-y-5">
      {props.mode === "edit" && project && (
        <input type="hidden" name="id" value={project.id} />
      )}

      <Field label="Project name" htmlFor="name" error={fieldErrors?.name} required>
        <Input
          id="name"
          name="name"
          defaultValue={project?.name ?? ""}
          placeholder="Acme Inc. newsletter"
          autoFocus
          required
          maxLength={120}
        />
      </Field>

      <Field label="Company" htmlFor="companyName" error={fieldErrors?.companyName}>
        <Input
          id="companyName"
          name="companyName"
          defaultValue={project?.companyName ?? ""}
          placeholder="Acme Inc."
          maxLength={160}
        />
      </Field>

      <Field label="CEO name" htmlFor="ceoName" error={fieldErrors?.ceoName}>
        <Input
          id="ceoName"
          name="ceoName"
          defaultValue={project?.ceoName ?? ""}
          placeholder="Jane Okeke"
          maxLength={120}
        />
      </Field>

      {props.mode === "edit" && (
        <Field label="Status" htmlFor="status" error={fieldErrors?.status}>
          <Select
            id="status"
            name="status"
            defaultValue={project?.status ?? "active"}
            className="max-w-xs"
          >
            <option value="active">Active</option>
            <option value="archived">Archived</option>
          </Select>
        </Field>
      )}

      <Field label="Notes" htmlFor="notes" error={fieldErrors?.notes}>
        <Textarea
          id="notes"
          name="notes"
          defaultValue={project?.notes ?? ""}
          placeholder="Internal context — sending cadence, preferences, anything worth remembering."
          rows={4}
          maxLength={2000}
        />
      </Field>

      {state.status === "error" && state.message && (
        <p className="text-sm text-destructive">{state.message}</p>
      )}
      {state.status === "success" && state.message && (
        <p className="text-sm text-success">{state.message}</p>
      )}

      <div className="flex items-center gap-3 pt-1">
        <Button type="submit" disabled={pending}>
          {pending && <Loader2 className="size-4 animate-spin" />}
          {props.mode === "create" ? "Create project" : "Save changes"}
        </Button>
      </div>
    </form>
  );
}

function Field({
  label,
  htmlFor,
  error,
  required,
  children,
}: {
  label: string;
  htmlFor: string;
  error?: string[];
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor}>
        {label}
        {required && <span className="text-destructive"> *</span>}
      </Label>
      {children}
      {error?.length ? <p className="text-xs text-destructive">{error[0]}</p> : null}
    </div>
  );
}
