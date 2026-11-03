import { apiPost } from "@/lib/api";
import { clearAuth } from "@/lib/auth";
import { disablePush } from "@/lib/push";
import { unregisterNativePush } from "@/lib/native";
import { disconnectStomp } from "@/lib/socket";

/** Full sign-out: stop push here, end the session on the server, forget the token. */
export async function signOut() {
  // Stop push to this browser first (needs the token), so the next person here doesn't get our messages.
  await disablePush(false);
  await unregisterNativePush();
  // End the session server-side too, so this token stops working immediately.
  await apiPost("/api/account/logout").catch(() => {});
  disconnectStomp().catch(() => {});
  clearAuth();
  window.location.href = "/login";
}
