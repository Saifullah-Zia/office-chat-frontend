/**
 * auth.ts — Single source of truth for auth tokens.
 *
 * The ONLY place we read/write the JWT token is localStorage.
 * No Zustand persist, no hydration races, no middleware.
 */

const TOKEN_KEY = "office_chat_token";
const USER_KEY = "office_chat_user";

export interface StoredUser {
  userId: number;
  name: string;
  email: string;
  role: string;
}

/** Save auth data after successful login/register */
export function saveAuth(token: string, user: StoredUser): void {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

/** Get the current JWT token (or null) */
export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  const t = localStorage.getItem(TOKEN_KEY);
  if (!t || t === "null" || t === "undefined") return null;
  return t;
}

/** Get stored user info (or null) */
export function getUser(): StoredUser | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(USER_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as StoredUser;
  } catch {
    return null;
  }
}

/** Check if the user is authenticated */
export function isAuthenticated(): boolean {
  return getToken() !== null && getUser() !== null;
}

/** Clear all auth data (logout) */
export function clearAuth(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}
