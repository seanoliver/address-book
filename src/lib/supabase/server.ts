import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Per-request Supabase server client (auth only — all data access goes
 * through src/lib/db). Canonical @supabase/ssr cookie pattern: getAll/setAll,
 * with setAll swallowed in server-component contexts where cookie writes are
 * forbidden (middleware handles session refresh there).
 */
export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Called from a Server Component — cookies can't be written
            // there. Safe to ignore: middleware refreshes sessions.
          }
        },
      },
    },
  );
}
