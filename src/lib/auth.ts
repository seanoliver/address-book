import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/** JWT claims shape returned by requireUser; assignable to withRls's claims param. */
export type SessionClaims = { sub: string; email?: string; [k: string]: unknown };

/**
 * Validated JWT claims or redirect to /login. Call in every dashboard
 * page/action. getClaims() verifies the JWT (locally when the project uses
 * asymmetric signing keys; via the Auth server otherwise) rather than
 * trusting the cookie contents.
 */
export async function requireUser(): Promise<SessionClaims> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims?.sub) redirect("/login");
  return data.claims as SessionClaims;
}
