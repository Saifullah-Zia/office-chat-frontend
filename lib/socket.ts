import { Client, IMessage, StompSubscription } from "@stomp/stompjs";
import SockJS from "sockjs-client";
import { getToken } from "@/lib/auth";

const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? "http://localhost:8080/ws";

let stompClient: Client | null = null;

export function getStompClient(): Client {
  const token = getToken() ?? "";

  if (!stompClient) {
    stompClient = new Client({
      webSocketFactory: () => new SockJS(WS_URL) as WebSocket,
      beforeConnect: () => {
        const t = getToken() ?? "";
        if (stompClient) {
          stompClient.connectHeaders = {
            Authorization: `Bearer ${t}`,
          };
        }
      },
      connectHeaders: {
        Authorization: `Bearer ${token}`,
      },
      reconnectDelay: 5_000,
      onStompError: (frame) => {
        console.error("[STOMP] Error:", frame.headers["message"]);
      },
    });
  } else {
    stompClient.connectHeaders = {
      Authorization: `Bearer ${token}`,
    };
  }
  return stompClient;
}

let connectPromise: Promise<Client> | null = null;

export function connectStomp(): Promise<Client> {
  const client = getStompClient();

  if (client.connected) return Promise.resolve(client);
  if (connectPromise) return connectPromise;

  connectPromise = new Promise<Client>((resolve, reject) => {
    const prevOnConnect = client.onConnect;
    const prevOnStompError = client.onStompError;

    client.onConnect = (frame) => {
      connectPromise = null;
      if (prevOnConnect) prevOnConnect(frame);
      resolve(client);
    };

    client.onStompError = (frame) => {
      connectPromise = null;
      if (prevOnStompError) prevOnStompError(frame);
      reject(new Error(frame.headers["message"] ?? "STOMP error"));
    };

    client.activate();
  });

  return connectPromise;
}

export function disconnectStomp(): Promise<void> {
  if (stompClient) {
    const client = stompClient;
    stompClient = null;
    connectPromise = null;
    return client.deactivate();
  }
  return Promise.resolve();
}

export async function subscribe(
  destination: string,
  callback: (message: IMessage) => void,
): Promise<StompSubscription> {
  const client = await connectStomp();
  return client.subscribe(destination, callback);
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
  userQueue: (userId: number) => `/queue/user.${userId}`,
};

export const Destinations = {
  typing: (convId: number) => `/app/chat.typing`,
};
