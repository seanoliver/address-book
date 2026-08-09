import { createElement } from "react";
import { ImageResponse } from "next/og";
import { SealedSocialCard } from "@/components/sealed-social-card";

export const dynamic = "force-static";

export function GET() {
  return new ImageResponse(createElement(SealedSocialCard), {
    width: 1200,
    height: 630,
  });
}
