import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Sealed",
    short_name: "Sealed",
    description:
      "A private address book that friends and family can keep current.",
    start_url: "/",
    display: "standalone",
    background_color: "#faf7f1",
    theme_color: "#faf7f1",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
    ],
  };
}
