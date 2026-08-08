"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const emailSchema = z.object({ email: z.email().max(254) });
const flowSchema = z.enum(["login", "signup"]);

type AuthFlow = z.infer<typeof flowSchema>;

function readFlow(formData: FormData): AuthFlow {
  const parsed = flowSchema.safeParse(formData.get("flow"));
  return parsed.success ? parsed.data : "login";
}

export async function sendMagicLink(formData: FormData) {
  const flow = readFlow(formData);
  const parsed = emailSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) redirect(`/${flow}?error=1`);

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.data.email,
    options: { emailRedirectTo: `${process.env.APP_URL}/auth/confirm` },
  });

  // Generic failure state — never reveal whether an account already exists.
  if (error) redirect(`/${flow}?error=1`);
  redirect(`/${flow}?sent=1`);
}

export async function continueWithGoogle(formData: FormData) {
  const flow = readFlow(formData);
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${process.env.APP_URL}/auth/confirm` },
  });
  if (error || !data.url) redirect(`/${flow}?error=1`);
  redirect(data.url);
}
