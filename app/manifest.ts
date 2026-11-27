import type { MetadataRoute } from "next";

/** Makes JCAT Connect installable ("Add to Home Screen" / "Install app"). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "JCAT Connect",
    short_name: "JCAT Connect",
    description: "Secure real-time workplace chat",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#ffffff",
    theme_color: "#4f46e5",
    icons: [
      { src: "/jcat-icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/jcat-icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/jcat-icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
