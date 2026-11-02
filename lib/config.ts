/**
 * Where the backend lives. Set NEXT_PUBLIC_API_URL at build time (e.g. https://api.yourcompany.com);
 * the WebSocket URL is derived from it unless NEXT_PUBLIC_WS_URL is set explicitly.
 */
export const API_BASE = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080").replace(/\/+$/, "");
export const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? `${API_BASE}/ws`;
