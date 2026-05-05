import type { DashboardStats, OutputProfile, ProxyNode, SubscriptionSource } from "@proxypanel/shared";

const TOKEN_KEY = "proxypanel.token";

export function getToken(): string | null { return localStorage.getItem(TOKEN_KEY); }
export function setToken(token: string | null): void { token ? localStorage.setItem(TOKEN_KEY, token) : localStorage.removeItem(TOKEN_KEY); }

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers = new Headers(init.headers);
  if (token) headers.set("authorization", `Bearer ${token}`);
  if (init.body != null && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }

  const response = await fetch(path, { ...init, headers });
  if (!response.ok) {
    const body = await response.text();
    let message = body || response.statusText;
    try {
      const parsed = JSON.parse(body) as { message?: string; error?: string };
      message = parsed.message || parsed.error || message;
    } catch { /* keep raw body */ }
    throw new Error(message);
  }

  const text = await response.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

export const api = {
  async login(password: string) { return request<{ token: string; expiresAt: string }>("/api/login", { method: "POST", body: JSON.stringify({ password }) }); },
  dashboard: () => request<DashboardStats>("/api/dashboard"),
  sources: () => request<SubscriptionSource[]>("/api/sources"),
  createSource: (body: Partial<SubscriptionSource>) => request<SubscriptionSource>("/api/sources", { method: "POST", body: JSON.stringify(body) }),
  patchSource: (id: string, body: Partial<SubscriptionSource>) => request<SubscriptionSource>(`/api/sources/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  deleteSource: (id: string) => request<{ ok: boolean }>(`/api/sources/${id}`, { method: "DELETE" }),
  refreshSource: (id: string) => request<{ ok: boolean; count: number; added: number; updated: number; skipped: number; protocols: Record<string, number> }>(`/api/sources/${id}/refresh`, { method: "POST" }),
  nodes: () => request<ProxyNode[]>("/api/nodes"),
  patchNode: (id: string, body: Partial<ProxyNode>) => request<ProxyNode>(`/api/nodes/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  probeNodes: () => request<{ ok: boolean; count: number }>("/api/nodes/probe", { method: "POST" }),
  outputs: () => request<OutputProfile[]>("/api/output-profiles"),
  createOutput: (body: Partial<OutputProfile>) => request<OutputProfile>("/api/output-profiles", { method: "POST", body: JSON.stringify(body) }),
  patchOutput: (id: string, body: Partial<OutputProfile> & { rotateToken?: boolean }) => request<OutputProfile>(`/api/output-profiles/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  deleteOutput: (id: string) => request<{ ok: boolean }>(`/api/output-profiles/${id}`, { method: "DELETE" })
};
