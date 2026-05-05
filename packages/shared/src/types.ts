export type SubscriptionSourceType = "auto" | "vless" | "clash";
export type ProxyProtocol = "vless" | "trojan" | "vmess" | "ss" | "http" | "socks5" | "unknown";
export type OutputFormat = "clash" | "vless";
export type SortStrategy = "score" | "latency" | "region" | "name";

export interface SubscriptionSource {
  id: string;
  name: string;
  url: string;
  type: SubscriptionSourceType;
  enabled: boolean;
  refreshIntervalMinutes: number;
  lastRefreshAt: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProxyNode {
  id: string;
  sourceId: string;
  name: string;
  protocol: ProxyProtocol;
  host: string;
  port: number;
  ip: string | null;
  region: string;
  tags: string[];
  enabled: boolean;
  fingerprint: string;
  raw: Record<string, unknown>;
  shareUri: string | null;
  lastLatencyMs: number | null;
  lastProbeAt: string | null;
  successRate: number;
  failCount: number;
  score: number;
  createdAt: string;
  updatedAt: string;
}

export interface ProbeResult {
  id: string;
  nodeId: string;
  success: boolean;
  latencyMs: number | null;
  error: string | null;
  probedAt: string;
}

export interface OutputProfile {
  id: string;
  name: string;
  token: string;
  enabled: boolean;
  format: OutputFormat;
  includeRegions: string[];
  includeSourceIds: string[];
  includeTags: string[];
  sortStrategy: SortStrategy;
  createdAt: string;
  updatedAt: string;
}

export interface DashboardStats {
  sourceCount: number;
  enabledSourceCount: number;
  nodeCount: number;
  enabledNodeCount: number;
  availableNodeCount: number;
  lastProbeAt: string | null;
  lastRefreshAt: string | null;
}

export interface LoginResponse {
  token: string;
  expiresAt: string;
}

export interface ApiError {
  error: string;
  message: string;
}
