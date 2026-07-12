"use client";

import { useEffect } from "react";
import Script from "next/script";

/**
 * Cloudflare Turnstile widget, implicit-rendering mode.
 *
 * This is the ONE sanctioned external script in the app. CSP note for
 * Task 18: `script-src` must allow https://challenges.cloudflare.com and
 * `frame-src` must allow it too (the widget renders its challenge in an
 * iframe from that origin). Nothing else external is permitted.
 *
 * api.js scans the DOM for `.cf-turnstile` and injects a hidden
 * `cf-turnstile-response` input into the ENCLOSING <form> — always render
 * this component inside the form it protects.
 */

type TurnstileGlobal = { reset?: () => void };

/**
 * Reset the widget after a failed submit. Turnstile responses are single-use
 * at siteverify: without a reset, a user who hits a validation error and
 * resubmits would post the already-consumed response and fail verification
 * forever. Call with the action state's error each render.
 */
export function useTurnstileResetOnError(error: string | undefined): void {
  useEffect(() => {
    if (!error) return;
    const turnstile = (window as { turnstile?: TurnstileGlobal }).turnstile;
    try {
      turnstile?.reset?.();
    } catch {
      // Widget not rendered yet (script still loading) — nothing to reset.
    }
  }, [error]);
}

export function TurnstileWidget() {
  return (
    <>
      <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js"
        strategy="afterInteractive"
        async
        defer
      />
      <div
        className="cf-turnstile"
        data-sitekey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? ""}
      />
    </>
  );
}
