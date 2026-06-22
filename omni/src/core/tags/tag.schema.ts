import { z } from "zod";

export const idSchema = z.string().uuid("Invalid tag id");

export const createTagSchema = z.object({
  name: z
    .string({ required_error: "Enter a tag name" })
    .trim()
    .min(1, "Enter a tag name")
    .max(40, "Tag name must be 40 characters or fewer"),
  color: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z
      .string()
      .trim()
      .regex(/^#[0-9a-fA-F]{3,8}$/, "Enter a valid hex color")
      .optional(),
  ),
});
export type CreateTagInput = z.infer<typeof createTagSchema>;

export const updateTagSchema = createTagSchema;
export type UpdateTagInput = z.infer<typeof updateTagSchema>;
