import { Client, IMessage, StompSubscription } from "@stomp/stompjs";
import SockJS from "sockjs-client";
import { getToken } from "@/lib/auth";
import { WS_URL } from "@/lib/config";



let stompClient: Client | null = null;

/** Tell the server whether this app is on screen: it then skips push notifications (we see it here). */
/** Set by the Android app (it knows better than the page whether it's in the background). */
let nativeVisible: boolean | null = null;

function reportVisibility(client: Client) {
  if (!client.connected || typeof document === "undefined") return;
  const visible = nativeVisible ?? document.visibilityState === "visible";
  try {
    client.publish({ destination: "/app/presence.visible", body: JSON.stringify({ visible }) });
  } catch {}
}

if (typeof window !== "undefined") {
  window.__officeChatNativeVisible = (visible: boolean) => {
    nativeVisible = visible;
    if (stompClient) reportVisibility(stompClient);
  };
}
let visibilityHooked = false;

/**
 * Every live subscription, so they can be restored after a reconnect. stompjs reconnects on its own
 * (server restart, network blip) but does NOT re-subscribe, which left open tabs silently deaf.
 */
interface Registered {
  destination: string;
  callback: (message: IMessage) => void;
  sub: StompSubscription | null;
}
const registry = new Set<Registered>();
let waiters: { resolve: (c: Client) => void; reject: (e: Error) => void }[] = [];

export function getStompClient(): Client {
  if (!stompClient) {
    const client = new Client({
      webSocketFactory: () => new SockJS(WS_URL) as WebSocket,
      // Fresh token on every (re)connect.
      beforeConnect: () => {
        client.connectHeaders = { Authorization: `Bearer ${getToken() ?? ""}` };
      },
      reconnectDelay: 5_000,
      // Both sides check the line every 10s, so a dead connection is noticed quickly.
      heartbeatIncoming: 10_000,
      heartbeatOutgoing: 10_000,
      onConnect: () => {
        reportVisibility(client);
        if (!visibilityHooked && typeof document !== "undefined") {
          visibilityHooked = true;
          document.addEventListener("visibilitychange", () => { if (stompClient) reportVisibility(stompClient); });
        }
        for (const entry of registry) {
          entry.sub = client.subscribe(entry.destination, entry.callback);
        }
        waiters.forEach((w) => w.resolve(client));
        waiters = [];
      },
      onStompError: (frame) => {
        console.error("[STOMP] Error:", frame.headers["message"]);
        const err = new Error(frame.headers["message"] ?? "STOMP error");
        waiters.forEach((w) => w.reject(err));
        waiters = [];
      },
    });
    stompClient = client;
  }
  return stompClient;
}

export function connectStomp(): Promise<Client> {
  const client = getStompClient();
  if (client.connected) return Promise.resolve(client);
  return new Promise<Client>((resolve, reject) => {
    waiters.push({ resolve, reject });
    if (!client.active) client.activate();
  });
}

export function disconnectStomp(): Promise<void> {
  registry.clear();
  waiters.forEach((w) => w.reject(new Error("Disconnected")));
  waiters = [];
  if (stompClient) {
    const client = stompClient;
    stompClient = null;
    return client.deactivate();
  }
  return Promise.resolve();
}

/** Subscribe; the subscription survives reconnects until unsubscribe() is called. */
export async function subscribe(
  destination: string,
  callback: (message: IMessage) => void,
): Promise<{ unsubscribe: () => void }> {
  const client = await connectStomp();
  const entry: Registered = { destination, callback, sub: client.subscribe(destination, callback) };
  registry.add(entry);
  return {
    unsubscribe: () => {
      registry.delete(entry);
      if (stompClient?.connected) {
        try { entry.sub?.unsubscribe(); } catch {}
      }
      entry.sub = null;
    },
  };
}

export async function publish(
  destination: string,
  body: object,
): Promise<void> {
  const client = await connectStomp();
  client.publish({ destination, body: JSON.stringify(body) });
}

export const Topics = {
  conversation: (convId: number) => `/topic/conversation.${convId}`,
  typing: (convId: number) => `/topic/conversation.${convId}.typing`,
  presence: () => `/topic/presence`,
  userStatus: () => `/topic/user.status`,
  /** My private call signals (ring/answer/hang-up), delivered by the server relay. */
  callQueue: () => `/user/queue/call`,
};

export const Destinations = {
  typing: () => `/app/chat.typing`,
  callSignal: () => `/app/call.signal`,
  callHand: () => `/app/call.hand`,
};
