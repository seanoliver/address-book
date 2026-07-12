import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Canonical @supabase/ssr session-refresh middleware: creates a request-bound
 * client, triggers a token refresh if the access token is stale, and writes
 * any refreshed cookies onto both the request (for downstream handlers) and
 * the response (for the browser).
 *
 * No auth gating happens here — requireUser() in pages/actions does that.
 * Public routes (/b/*, /u/*, /api/webhooks/*) are excluded by the matcher in
 * src/proxy.ts and never reach this code.
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // IMPORTANT: do not run code between createServerClient and the auth call
  // below — doing so can make sessions randomly terminate. getClaims()
  // validates the JWT (refreshing the session first if it is about to
  // expire), which is what writes refreshed cookies back via setAll.
  await supabase.auth.getClaims();

  // IMPORTANT: return supabaseResponse as-is (or copy its cookies onto any
  // replacement response); dropping its cookies desyncs browser and server
  // sessions.
  return supabaseResponse;
}
