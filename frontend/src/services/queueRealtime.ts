import { io } from "socket.io-client";
import type { Socket } from "socket.io-client";
import { readSession, SESSION_CHANGED_EVENT } from "./session";

export type RealtimeStatus = "connecting" | "connected" | "disconnected";
type Subscriber = { refresh: () => void; status?: (value: RealtimeStatus) => void };
const subscribers = new Set<Subscriber>();
let socket: Socket | null = null;
let token: string | undefined;
let status: RealtimeStatus = "disconnected";

function updateStatus(value: RealtimeStatus) {
  status = value;
  subscribers.forEach((subscriber) => subscriber.status?.(value));
}

function refreshAll() {
  subscribers.forEach((subscriber) => subscriber.refresh());
}

function syncSession() {
  const session = readSession();
  const nextToken = session && ["student", "staff"].includes(session.user.role) ? session.token : undefined;
  if (nextToken === token && socket) return;
  socket?.removeAllListeners();
  socket?.disconnect();
  socket = null;
  token = nextToken;
  if (!token) {
    updateStatus("disconnected");
    return;
  }
  const api = new URL(import.meta.env.VITE_API_URL ?? "http://127.0.0.1:5000/api", window.location.origin);
  socket = io(api.origin, {
    // Socket.IO carries events over WebSocket; HTTP polling is disabled.
    transports: ["websocket"],
    auth: { token },
    autoConnect: false,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 10000,
  });
  updateStatus("connecting");
  socket.on("connect", () => {
    updateStatus("connected");
    // Also recovers changes missed while offline or during the initial fetch.
    refreshAll();
  });
  socket.on("queue:updated", refreshAll);
  socket.on("disconnect", () => updateStatus("disconnected"));
  socket.on("connect_error", () => updateStatus("disconnected"));
  socket.connect();
}

export function subscribeQueueUpdates(refresh: () => void, onStatus?: Subscriber["status"]) {
  const subscriber = { refresh, status: onStatus };
  subscribers.add(subscriber);
  onStatus?.(status);
  if (subscribers.size === 1) {
    window.addEventListener(SESSION_CHANGED_EVENT, syncSession);
    window.addEventListener("storage", syncSession);
    syncSession();
  }
  return () => {
    subscribers.delete(subscriber);
    if (subscribers.size) return;
    window.removeEventListener(SESSION_CHANGED_EVENT, syncSession);
    window.removeEventListener("storage", syncSession);
    socket?.removeAllListeners();
    socket?.disconnect();
    socket = null;
    token = undefined;
    status = "disconnected";
  };
}
