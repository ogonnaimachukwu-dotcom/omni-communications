import { z } from "zod";

export const idSchema = z.string().uuid("Invalid signature");

export const createSignatureSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  html: z.string().trim().min(1, "Signature HTML is required").max(20_000),
  isDefault: z.coerce.boolean().optional().default(false),
});
export type CreateSignatureInput = z.infer<typeof createSignatureSchema>;

export const updateSignatureSchema = createSignatureSchema;
export type UpdateSignatureInput = z.infer<typeof updateSignatureSchema>;
