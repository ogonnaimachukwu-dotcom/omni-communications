import { z } from "zod";

export const commitImportSchema = z.object({
  listId: z.string().uuid(),
  filename: z.string().min(1).max(260),
  mapping: z.object({
    email: z.string(),
    name: z.string().optional(),
    firstName: z.string().optional(),
    lastName: z.string().optional(),
    fields: z.record(z.string()).default({}),
  }),
  duplicatePolicy: z.enum(["skip", "update"]).default("skip"),
  excludedRows: z.array(z.number().int().min(0)).default([]),
});
export type CommitImportInput = z.infer<typeof commitImportSchema>;
