import { createFingerprint } from "./utils.js";
import type { ProxyNode } from "./types.js";

export interface ParsedVless {
  id: string;
  name: string;
  host: string;
  port: number;
  params: Record<string, string>;
  uri: string;
}

export function parseVlessUri(uri: string): ParsedVless {
  const trimmed = uri.trim();
  if (!trimmed.startsWith("vless://")) {
    throw new Error("Not a vless:// URI");
  }
  const url = new URL(trimmed);
  const id = decodeURIComponent(url.username);
  const name = decodeURIComponent(url.hash.replace(/^#/, "")) || `${url.hostname}:${url.port}`;
  const params = Object.fromEntries(Array.from(url.searchParams.entries()));
  const port = Number(url.port || params.port || 443);
  if (!id || !url.hostname || !Number.isInteger(port)) {
    throw new Error("Invalid VLESS URI");
  }
  return { id, name, host: url.hostname, port, params, uri: trimmed };
}

export function serializeVlessUri(vless: ParsedVless): string {
  const url = new URL(`vless://${encodeURIComponent(vless.id)}@${vless.host}:${vless.port}`);
  for (const [key, value] of Object.entries(vless.params)) {
    if (value != null && value !== "") url.searchParams.set(key, value);
  }
  url.hash = encodeURIComponent(vless.name);
  return url.toString();
}

export function vlessToNode(sourceId: string, uri: string, now = new Date().toISOString()): ProxyNode {
  const parsed = parseVlessUri(uri);
  const fingerprint = createFingerprint(["vless", parsed.id, parsed.host, parsed.port, parsed.params.security, parsed.params.type, parsed.params.sni]);
  return {
    id: fingerprint,
    sourceId,
    name: parsed.name,
    protocol: "vless",
    host: parsed.host,
    port: parsed.port,
    ip: null,
    region: "Unknown",
    tags: [],
    enabled: true,
    fingerprint,
    raw: { ...parsed.params, uuid: parsed.id },
    shareUri: parsed.uri,
    lastLatencyMs: null,
    lastProbeAt: null,
    successRate: 0,
    failCount: 0,
    score: 0,
    createdAt: now,
    updatedAt: now
  };
}

export function extractVlessUris(text: string): string[] {
  const direct = text.split(/\r?\n/).map((line) => line.trim()).filter((line) => line.startsWith("vless://"));
  if (direct.length > 0) return direct;

  try {
    const decoded = Buffer.from(text.trim(), "base64").toString("utf8");
    return decoded.split(/\r?\n/).map((line) => line.trim()).filter((line) => line.startsWith("vless://"));
  } catch {
    return [];
  }
}
