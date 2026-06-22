import { z } from "zod";

export const idSchema = z.string().uuid("Invalid list id");

export const createListSchema = z.object({
  name: z
    .string({ required_error: "Enter a list name" })
    .trim()
    .min(1, "Enter a list name")
    .max(120, "List name must be 120 characters or fewer"),
  description: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z.string().trim().max(500).optional(),
  ),
});
export type CreateListInput = z.infer<typeof createListSchema>;

export const updateListSchema = createListSchema;
export type UpdateListInput = z.infer<typeof updateListSchema>;
