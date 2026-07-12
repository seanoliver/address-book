import { z } from "zod";

/**
 * Optional free-text field: trimmed, capped at `max` (mirrors the SQL CHECK
 * constraints), and empty-after-trim becomes undefined so the DB stores NULL
 * rather than "".
 */
const opt = (max: number) =>
  z.string().trim().max(max).transform((s) => s === "" ? undefined : s).optional();

export const contactSchema = z.object({
  full_name: z.string().trim().min(1).max(200),
  partner_name: opt(200),
  kids_names: opt(500),
  email: z.string().trim().max(320).pipe(z.email().or(z.literal(""))).transform((s) => s === "" ? undefined : s).optional(),
  birthday: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).or(z.literal("")).transform((s) => s === "" ? undefined : s).optional(),
  address_line1: opt(200), address_line2: opt(200),
  city: opt(120), state_region: opt(120),
  postal_code: opt(20), country: opt(120),
  notes: opt(2000),
});
export type ContactInput = z.infer<typeof contactSchema>;
