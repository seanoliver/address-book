import { z } from "zod";

const authFlowSchema = z.enum(["login", "signup"]);

export type AuthFlow = z.infer<typeof authFlowSchema>;

/** Unknown or legacy callbacks retain the historical login fallback. */
export function parseAuthFlow(value: unknown): AuthFlow {
  const parsed = authFlowSchema.safeParse(value);
  return parsed.success ? parsed.data : "login";
}

export function authConfirmationUrl(baseUrl: string, flow: AuthFlow): string {
  const url = new URL("/auth/confirm", baseUrl);
  url.searchParams.set("flow", flow);
  return url.toString();
}
