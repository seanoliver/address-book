import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

// Next 16 renamed the root `middleware` file convention to `proxy`.
export default async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Refresh sessions everywhere EXCEPT:
     * - _next/static, _next/image, favicon.ico and static assets
     * - /b/* (public book permalinks) and /u/* (recipient update links) —
     *   privacy: no session work on recipient-facing pages
     * - /api/webhooks/* (signature-verified, no cookies)
     */
    "/((?!_next/static|_next/image|favicon.ico|b/|u/|api/webhooks/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|txt|xml|woff2?)$).*)",
  ],
};
