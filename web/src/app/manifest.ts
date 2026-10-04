import type { MetadataRoute } from "next";

// Static, so the static export writes it out as a file too.
export const dynamic = "force-static";

/** Served at /manifest.webmanifest and linked from every page. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    // A fixed id, so the installed app stays the same app if start_url ever changes.
    id: "/",
    name: "PhotoEYE",
    short_name: "PhotoEYE",
    description: "Plan photo walks, learn composition, and organize your reference library.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#111318",
    theme_color: "#111318",
    orientation: "portrait-primary",
    icons: [
      { src: "/icons/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable.svg", sizes: "any", type: "image/svg+xml", purpose: "maskable" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    // Photos shared from the phone's share sheet are posted here; the service
    // worker takes them and opens Partners.
    share_target: {
      action: "/share-target",
      method: "POST",
      enctype: "multipart/form-data",
      params: {
        title: "title",
        text: "text",
        files: [{ name: "photos", accept: ["image/*"] }],
      },
    },
  };
}
