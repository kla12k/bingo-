"use client";

import { io, type Socket } from "socket.io-client";

const url = process.env.NEXT_PUBLIC_SOCKET_URL ?? "http://localhost:3001";

const RECONNECT_DELAY_MS = Number(process.env.NEXT_PUBLIC_SOCKET_RECONNECT_DELAY) || 2000;
const RECONNECT_DELAY_MAX_MS = Number(process.env.NEXT_PUBLIC_SOCKET_RECONNECT_DELAY_MAX) || 10000;

declare global {
  // eslint-disable-next-line no-var
  var __bingoSocket: Socket | undefined;
}

function getAccessToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem("tokens");
    if (!raw) return null;
    const tokens = JSON.parse(raw) as { access?: string };
    return tokens?.access ?? null;
  } catch {
    return null;
  }
}

/** Single shared socket — survives Next.js HMR without leaking connections. */
export function getSocket(): Socket {
  if (typeof window === "undefined") {
    throw new Error("getSocket() must be called in the browser");
  }

  const token = getAccessToken();

  if (!globalThis.__bingoSocket) {
    globalThis.__bingoSocket = io(url, {
      autoConnect: Boolean(token),
      auth: { token: token ?? "" },
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: RECONNECT_DELAY_MS,
      reconnectionDelayMax: RECONNECT_DELAY_MAX_MS,
      randomizationFactor: 0.5,
      timeout: 20000,
      transports: ["polling", "websocket"],
    });
  } else if (token) {
    const sock = globalThis.__bingoSocket as Socket & { auth?: { token?: string } };
    const prev = sock.auth?.token ?? "";
    sock.auth = { token };
    // Token arrived after socket was created disconnected — connect now.
    if (!sock.connected) {
      sock.connect();
    } else if (prev !== token) {
      // Auth changed mid-session — force a clean reconnect with the new token.
      sock.disconnect().connect();
    }
  }

  return globalThis.__bingoSocket;
}

export function disconnectSocket() {
  if (globalThis.__bingoSocket) {
    globalThis.__bingoSocket.removeAllListeners();
    globalThis.__bingoSocket.disconnect();
    globalThis.__bingoSocket = undefined;
  }
}
