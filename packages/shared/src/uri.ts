import { createFingerprint } from "./utils.js";
import { vlessToNode } from "./vless.js";
import type { ProxyNode, ProxyProtocol } from "./types.js";

const SUPPORTED_URI_PROTOCOLS = ["vless", "vmess", "hysteria2", "hy2", "tuic", "anytls", "trojan", "ss"] as const;
const URI_PATTERN = /(?:vless|vmess|hysteria2|hy2|tuic|anytls|trojan|ss):\/\/[^\s<>'"]+/gi;

function nowNode(sourceId: string, protocol: ProxyProtocol, name: string, host: string, port: number, raw: Record<string, unknown>, shareUri: string, now: string): ProxyNode {
  const credential = String(raw.uuid ?? raw.password ?? raw.cipher ?? raw.username ?? "");
  const fingerprint = createFingerprint([protocol, host, port, credential, String(raw.sni ?? ""), String(raw.servername ?? ""), String(raw.network ?? ""), String(raw.type ?? "")]);
  return {
    id: fingerprint,
    sourceId,
    name,
    protocol,
    host,
    port,
    ip: null,
    region: "Unknown",
    tags: [],
    enabled: true,
    fingerprint,
    raw,
    shareUri,
    lastLatencyMs: null,
    lastProbeAt: null,
    successRate: 0,
    failCount: 0,
    score: 0,
    createdAt: now,
    updatedAt: now
  };
}

function decodeBase64(input: string): string {
  const normalized = input.trim().replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  return Buffer.from(padded, "base64").toString("utf8").trim();
}

function paramsObject(url: URL): Record<string, string> {
  return Object.fromEntries(Array.from(url.searchParams.entries()));
}

function parseSsUserInfo(userInfo: string): { method?: string; password?: string } {
  if (!userInfo) return {};
  const decoded = userInfo.includes(":") ? userInfo : decodeBase64(userInfo);
  const idx = decoded.indexOf(":");
  if (idx <= 0) return { password: decoded };
  return { method: decoded.slice(0, idx), password: decoded.slice(idx + 1) };
}

function cleanUri(uri: string): string {
  return uri.trim().replace(/[),.;，。]+$/u, "");
}

export function extractProxyUris(text: string): string[] {
  const candidates = new Set<string>();
  const addMatches = (body: string) => {
    for (const match of body.matchAll(URI_PATTERN)) candidates.add(cleanUri(match[0]));
  };

  addMatches(text);
  try { addMatches(decodeBase64(text)); } catch { /* ignore non-base64 bodies */ }

  return Array.from(candidates).filter((uri) => SUPPORTED_URI_PROTOCOLS.some((protocol) => uri.toLowerCase().startsWith(`${protocol}://`)));
}

export function vmessUriToNode(sourceId: string, uri: string, now = new Date().toISOString()): ProxyNode {
  const payload = JSON.parse(decodeBase64(uri.replace(/^vmess:\/\//i, ""))) as Record<string, unknown>;
  const host = String(payload.add ?? payload.server ?? "").trim();
  const port = Number(payload.port ?? 0);
  if (!host || !Number.isInteger(port) || port <= 0) throw new Error("Invalid VMess URI");
  const name = String(payload.ps ?? `${host}:${port}`);
  const raw: Record<string, unknown> = {
    ...payload,
    uuid: payload.id,
    alterId: Number(payload.aid ?? 0),
    network: payload.net,
    tls: payload.tls === "tls" || payload.tls === true,
    sni: payload.sni || payload.host
  };
  return nowNode(sourceId, "vmess", name, host, port, raw, uri, now);
}

export function genericUrlToNode(sourceId: string, uri: string, now = new Date().toISOString()): ProxyNode {
  const url = new URL(uri);
  const scheme = url.protocol.replace(":", "").toLowerCase();
  const protocol: ProxyProtocol = scheme === "hy2" ? "hysteria2" : scheme as ProxyProtocol;
  const host = url.hostname;
  const port = Number(url.port || (scheme === "trojan" ? 443 : 0));
  if (!host || !Number.isInteger(port) || port <= 0) throw new Error(`Invalid ${scheme} URI`);
  const params = paramsObject(url);
  const name = decodeURIComponent(url.hash.replace(/^#/, "")) || `${host}:${port}`;
  const username = decodeURIComponent(url.username || "");
  const password = decodeURIComponent(url.password || "");
  const raw: Record<string, unknown> = { ...params, username, password };

  if (protocol === "hysteria2") {
    raw.password = username;
    raw.alpn = params.alpn ? params.alpn.split(",") : undefined;
    raw.sni = params.sni;
  } else if (protocol === "tuic") {
    raw.uuid = username;
    raw.password = password;
    raw["congestion-controller"] = params.congestion_control ?? params["congestion-controller"];
    raw["udp-relay-mode"] = params.udp_relay_mode ?? params["udp-relay-mode"];
    raw.alpn = params.alpn ? params.alpn.split(",") : undefined;
    raw.sni = params.sni;
  } else if (protocol === "anytls") {
    raw.password = username;
    raw.sni = params.sni;
  } else if (protocol === "trojan") {
    raw.password = username;
    raw.sni = params.sni ?? params.peer;
    raw.network = params.type ?? params.network;
  } else if (protocol === "ss") {
    raw.userinfo = username;
    Object.assign(raw, parseSsUserInfo(username));
  }

  return nowNode(sourceId, protocol, name, host, port, raw, uri, now);
}

export function shareUriToNode(sourceId: string, uri: string, now = new Date().toISOString()): ProxyNode | null {
  const clean = cleanUri(uri);
  try {
    if (clean.toLowerCase().startsWith("vless://")) return vlessToNode(sourceId, clean, now);
    if (clean.toLowerCase().startsWith("vmess://")) return vmessUriToNode(sourceId, clean, now);
    return genericUrlToNode(sourceId, clean, now);
  } catch {
    return null;
  }
}

export function parseShareUriNodes(sourceId: string, text: string, now = new Date().toISOString()): ProxyNode[] {
  return extractProxyUris(text).map((uri) => shareUriToNode(sourceId, uri, now)).filter((node): node is ProxyNode => node != null);
}
