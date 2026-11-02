import { AttachmentResponse } from "@/types";
import { API_BASE } from "@/lib/config";

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

/**
 * Save a file to disk. Fetching it into a blob: URL makes the link same-origin, so the
 * `download` attribute is honoured; if that fails we fall back to the dl=1 link.
 */
export async function saveFile(url: string, name: string): Promise<void> {
  const href = downloadHref(url);
  try {
    const res = await fetch(href);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const objectUrl = URL.createObjectURL(await res.blob());
    const a = document.createElement("a");
    a.href = objectUrl;
    a.download = name || "download";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 10_000);
  } catch {
    window.location.href = href;
  }
}


/** Server paths like "/api/files/1/download" become full URLs on the API origin. */
export function apiUrl(url: string): string {
  return url.startsWith("http") ? url : `${API_BASE}${url}`;
}
