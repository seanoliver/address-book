import { z } from "zod";

export const bookSchema = z.object({
  title: z.string().trim().min(1).max(120),
  slug: z.string().regex(/^[a-z0-9][a-z0-9-]{2,62}$/,
    "3-63 chars; lowercase letters, numbers, hyphens; must start alphanumeric"),
  partner_name: z.boolean(),
  kids_names: z.boolean(),
  birthday: z.boolean(),
});
export type BookInput = z.infer<typeof bookSchema>;
