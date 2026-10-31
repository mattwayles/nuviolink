import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "NuvioLink",
    short_name: "NuvioLink",
    description: "View and manage the watchlists of every profile on your Nuvio account.",
    start_url: "/",
    display: "standalone",
    background_color: "#07080c",
    theme_color: "#07080c",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
