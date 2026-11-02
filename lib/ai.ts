import { apiGet } from "@/lib/api";

/** Whether the server has AI (translation, summaries) set up. Asked once per page load. */
let statusPromise: Promise<boolean> | null = null;
export function aiEnabled(): Promise<boolean> {
  statusPromise ??= apiGet<{ enabled: boolean }>("/api/ai/status")
    .then((s) => !!s.enabled)
    .catch(() => {
      statusPromise = null; // retry next time
      return false;
    });
  return statusPromise;
}

/** The reader's language, e.g. "English" or "Urdu", from the browser settings. */
export function preferredLanguage(): string {
  const code = (typeof navigator !== "undefined" && navigator.language) || "en";
  try {
    return new Intl.DisplayNames(["en"], { type: "language" }).of(code.split("-")[0]) ?? "English";
  } catch {
    return "English";
  }
}
