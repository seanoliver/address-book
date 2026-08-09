"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import {
  authConfirmationUrl,
  parseAuthFlow,
} from "@/lib/auth-flow";
import { currentRequestOrigin } from "@/lib/request-origin";
import { createClient } from "@/lib/supabase/server";

const emailSchema = z.object({ email: z.email().max(254) });

function readFlow(formData: FormData) {
  return parseAuthFlow(formData.get("flow"));
}

export async function sendMagicLink(formData: FormData) {
  const flow = readFlow(formData);
  const parsed = emailSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) redirect(`/${flow}?error=1`);

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.data.email,
    options: {
      emailRedirectTo: authConfirmationUrl(process.env.APP_URL!, flow),
    },
  });

  // Generic failure state — never reveal whether an account already exists.
  if (error) redirect(`/${flow}?error=1`);
  redirect(`/${flow}?sent=1`);
}

export async function continueWithGoogle(formData: FormData) {
  const flow = readFlow(formData);
  const supabase = await createClient();
  const origin = await currentRequestOrigin();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: authConfirmationUrl(origin, flow) },
  });
  if (error || !data.url) redirect(`/${flow}?error=1`);
  redirect(data.url);
}
