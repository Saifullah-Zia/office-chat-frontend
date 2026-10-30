import { AttachmentResponse } from "@/types";

/**
 * Raster images the server serves inline. SVG is excluded: it can carry script, so the
 * server forces it to download and it's shown as a file instead.
 */
export function isViewableImage(att: Pick<AttachmentResponse, "contentType" | "mimeType">): boolean {
  const type = (att.contentType ?? att.mimeType ?? "").toLowerCase();
  return type.startsWith("image/") && !type.includes("svg");
}

/**
 * Link that saves the file instead of opening it. The API is on another origin, where
 * browsers ignore the `download` attribute, so the server is asked to send it as an attachment.
 */
export function downloadHref(url: string): string {
  return url + (url.includes("?") ? "&" : "?") + "dl=1";
}
