const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000/api/v1";

function requestId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

function handleUnauthorized() {
  clearStoredToken();
  window.dispatchEvent(new Event("jar-auth-expired"));
}

export function getStoredToken(): string | null {
  return localStorage.getItem("jar_token") || sessionStorage.getItem("jar_token");
}

export function storeToken(token: string, remember = true): void {
  localStorage.removeItem("jar_token");
  sessionStorage.removeItem("jar_token");
  (remember ? localStorage : sessionStorage).setItem("jar_token", token);
}

export function clearStoredToken(): void {
  localStorage.removeItem("jar_token");
  sessionStorage.removeItem("jar_token");
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set("X-Request-ID", requestId());
  const token = getStoredToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (options.body && !(options.body instanceof FormData)) headers.set("Content-Type", "application/json");
  const method = (options.method || "GET").toUpperCase();
  let response: Response;
  for (let attempt = 0; ; attempt += 1) {
    response = await fetch(`${API_URL}${path}`, { ...options, headers });
    const canRetry = method === "GET" && [502, 503, 504].includes(response.status) && attempt < 2;
    if (!canRetry) break;
    await new Promise((resolve) => window.setTimeout(resolve, 300 * (attempt + 1)));
  }
  if (response.status === 401) handleUnauthorized();
  if (!response.ok) {
    const detail = await response.json().catch(() => ({}));
    throw new ApiError(detail.detail || (response.status === 401 ? "Your session expired. Please sign in again." : `Request failed (${response.status})`), response.status);
  }

  if (response.status === 204 || response.headers.get("Content-Length") === "0") {
    return undefined as T;
  }

  const text = await response.text();
  if (!text) {
    return undefined as T;
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    return undefined as T;
  }
}

export async function apiBlob(path: string, options: RequestInit = {}): Promise<Blob> {
  const headers = new Headers(options.headers);
  headers.set("X-Request-ID", requestId());
  const token = getStoredToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const method = (options.method || "GET").toUpperCase();
  let response: Response;
  for (let attempt = 0; ; attempt += 1) {
    response = await fetch(`${API_URL}${path}`, { ...options, headers });
    const canRetry = method === "GET" && [502, 503, 504].includes(response.status) && attempt < 2;
    if (!canRetry) break;
    await new Promise((resolve) => window.setTimeout(resolve, 300 * (attempt + 1)));
  }
  if (response.status === 401) handleUnauthorized();
  if (!response.ok) {
    const detail = await response.json().catch(() => ({}));
    throw new ApiError(detail.detail || (response.status === 401 ? "Your session expired. Please sign in again." : `Request failed (${response.status})`), response.status);
  }
  return response.blob();
}

export async function upload<T>(path: string, file: File): Promise<T> {
  const form = new FormData();
  form.append("file", file);
  return api<T>(path, { method: "POST", body: form });
}

export async function download(path: string, filename: string, method: "GET" | "POST" = "GET") {
  const headers = new Headers();
  headers.set("X-Request-ID", requestId());
  const token = getStoredToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const response = await fetch(`${API_URL}${path}`, { method, headers });
  if (!response.ok) {
    const detail = await response.json().catch(() => ({}));
    throw new Error(detail.detail || `Download failed (${response.status})`);
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export { API_URL };
