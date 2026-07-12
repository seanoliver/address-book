import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  // Best-effort: even if GoTrue errors, redirect home — the cookie is cleared
  // client-side either way and requireUser re-gates everything.
  await supabase.auth.signOut();
  // 303 so the POST redirects to a GET of the landing page.
  return NextResponse.redirect(new URL("/", request.url), { status: 303 });
}
