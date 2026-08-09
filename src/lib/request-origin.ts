import "server-only";
import { headers } from "next/headers";

function firstHeaderValue(value: string | null): string | null {
  return value?.split(",", 1)[0]?.trim() || null;
}

/**
 * Returns the browser origin only when it agrees with the host observed by
 * the deployment. This keeps OAuth on the deployment where PKCE began without
 * turning a spoofed Origin header into an open redirect.
 */
export function originFromHeaders(
  requestHeaders: Pick<Headers, "get">,
  fallbackUrl: string,
): string {
  const requestHost = firstHeaderValue(
    requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host"),
  );
  const origin = firstHeaderValue(requestHeaders.get("origin"));

  if (requestHost && origin) {
    try {
      const parsed = new URL(origin);
      if (
        (parsed.protocol === "http:" || parsed.protocol === "https:") &&
        parsed.host === requestHost
      ) {
        return parsed.origin;
      }
    } catch {
      // Invalid/untrusted Origin; use the canonical fallback below.
    }
  }

  return new URL(fallbackUrl).origin;
}

export async function currentRequestOrigin(): Promise<string> {
  return originFromHeaders(await headers(), process.env.APP_URL!);
}
