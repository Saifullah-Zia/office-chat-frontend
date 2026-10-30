import axios, { AxiosError, InternalAxiosRequestConfig } from "axios";
import { getToken, clearAuth } from "@/lib/auth";
import { showToast } from "@/lib/toast";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";

export const api = axios.create({
  baseURL: BASE_URL,
  headers: { "Content-Type": "application/json" },
  timeout: 15_000,
});

// ── Request interceptor: attach Bearer token ────────────────────────────
api.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    // Only skip auth header for the login endpoint
    const isLoginEndpoint = config.url === "/api/auth/login";
    if (!isLoginEndpoint) {
      const token = getToken();
      if (token) {
        config.headers.set("Authorization", `Bearer ${token}`);
      }
    }
    return config;
  },
  (error) => Promise.reject(error),
);

// ── Response interceptor: handle 401 ────────────────────────────────────
api.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    const url = error.config?.url ?? "";
    const isAuthEndpoint = url.includes("/api/auth/");
    const isNonCriticalEndpoint = url.includes("/read") || url.includes("/presence");

    if (error.response?.status === 401 && !isAuthEndpoint && !isNonCriticalEndpoint) {
      console.warn("[api] 401 Unauthorized from core endpoint:", url);
      clearAuth();
      if (typeof window !== "undefined") {
        window.location.href = "/login";
      }
    }

    // Rate limits and oversized uploads: tell the user instead of failing silently.
    const status = error.response?.status;
    if ((status === 429 || status === 413) && !url.includes("/link-preview")) {
      showToast(apiErrorMessage(error) ?? (status === 429 ? "Slow down a little and try again." : "That file is too large."));
    }
    return Promise.reject(error);
  },
);

/** The server's error text (GlobalExceptionHandler puts it in `error`). */
export function apiErrorMessage(err: unknown): string | null {
  const data = (err as AxiosError<{ error?: string; message?: string }>)?.response?.data;
  return data?.error ?? data?.message ?? null;
}

// ── Convenience helpers ─────────────────────────────────────────────────
export const apiGet = <T>(url: string, params?: object) =>
  api.get<T>(url, { params }).then((r) => r.data);

export const apiPost = <T>(url: string, body?: unknown) =>
  api.post<T>(url, body).then((r) => r.data);

export const apiPostForm = <T>(url: string, form: FormData) =>
  api
    .post<T>(url, form, { headers: { "Content-Type": "multipart/form-data" } })
    .then((r) => r.data);

export const apiPut = <T>(url: string, body?: unknown) =>
  api.put<T>(url, body).then((r) => r.data);

export const apiDelete = <T>(url: string) =>
  api.delete<T>(url).then((r) => r.data);
