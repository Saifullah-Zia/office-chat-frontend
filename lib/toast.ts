/** Minimal app-wide toast: fire-and-forget messages rendered by <Toaster />. */
export const TOAST_EVENT = "office-chat-toast";

export function showToast(message: string) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<string>(TOAST_EVENT, { detail: message }));
}
