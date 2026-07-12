import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/** JWT claims shape returned by requireUser; assignable to withRls's claims param. */
export type SessionClaims = { sub: string; email?: string; [k: string]: unknown };

/**
 * Validated JWT claims or redirect to /login. Call in every dashboard
 * page/action. getClaims() verifies the JWT (locally when the project uses
 * asymmetric signing keys; via the Auth server otherwise) rather than
 * trusting the cookie contents. Wrapped in React cache() so the layout gate
 * and page/action calls within one render pass share a single getClaims().
 */
export const requireUser = cache(async (): Promise<SessionClaims> => {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims?.sub) redirect("/login");
  return data.claims as SessionClaims;
});
