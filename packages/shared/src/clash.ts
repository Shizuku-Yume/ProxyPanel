import yaml from "js-yaml";
import { createFingerprint } from "./utils.js";
import type { ProxyNode } from "./types.js";

interface ClashProxy {
  name?: string;
  type?: string;
  server?: string;
  port?: number | string;
  uuid?: string;
  password?: string;
  cipher?: string;
  tls?: boolean;
  network?: string;
  sni?: string;
  servername?: string;
  udp?: boolean;
  flow?: string;
  alpn?: string | string[];
  [key: string]: unknown;
}

export function parseClashYaml(text: string): ClashProxy[] {
  const doc = yaml.load(text) as { proxies?: ClashProxy[] } | ClashProxy[] | null;
  if (Array.isArray(doc)) return doc;
  if (doc && Array.isArray(doc.proxies)) return doc.proxies;
  return [];
}

export function clashProxyToNode(sourceId: string, proxy: ClashProxy, now = new Date().toISOString()): ProxyNode | null {
  const rawProtocol = String(proxy.type ?? "unknown").toLowerCase();
  const protocol = (rawProtocol === "hy2" ? "hysteria2" : rawProtocol) as ProxyNode["protocol"];
  const host = String(proxy.server ?? "").trim();
  const port = Number(proxy.port ?? 0);
  if (!host || !Number.isInteger(port) || port <= 0) return null;
  const name = String(proxy.name ?? `${host}:${port}`);
  const credential = String(proxy.uuid ?? proxy.password ?? proxy.cipher ?? proxy.username ?? "");
  const fingerprint = createFingerprint([protocol, host, port, credential, proxy.sni ?? proxy.servername, proxy.network]);
  return {
    id: fingerprint,
    sourceId,
    name,
    protocol: ["vless", "trojan", "vmess", "ss", "http", "socks5", "hysteria2", "tuic", "anytls"].includes(protocol) ? protocol : "unknown",
    host,
    port,
    ip: null,
    region: "Unknown",
    tags: [],
    enabled: true,
    fingerprint,
    raw: proxy as Record<string, unknown>,
    shareUri: null,
    lastLatencyMs: null,
    lastProbeAt: null,
    successRate: 0,
    failCount: 0,
    score: 0,
    createdAt: now,
    updatedAt: now
  };
}

export function parseClashNodes(sourceId: string, text: string, now = new Date().toISOString()): ProxyNode[] {
  return parseClashYaml(text).map((proxy) => clashProxyToNode(sourceId, proxy, now)).filter((node): node is ProxyNode => node != null);
}


function compact<T extends Record<string, unknown>>(input: T): T {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined && value !== "" && value !== null)) as T;
}

function boolish(value: unknown): boolean {
  return value === true || value === "1" || value === 1 || value === "true";
}

function rawString(node: ProxyNode, ...keys: string[]): unknown {
  for (const key of keys) {
    const value = node.raw[key];
    if (value !== undefined && value !== "") return value;
  }
  return undefined;
}

function network(node: ProxyNode): string {
  return String(rawString(node, "network", "type") ?? "tcp");
}

function tlsEnabled(node: ProxyNode): boolean {
  return node.raw.security === "tls" || node.raw.security === "reality" || boolish(node.raw.tls);
}

function wsOpts(node: ProxyNode): Record<string, unknown> | undefined {
  return network(node) === "ws" ? { path: rawString(node, "path") ?? "/", headers: compact({ Host: rawString(node, "host") }) } : undefined;
}

function grpcOpts(node: ProxyNode): Record<string, unknown> | undefined {
  return network(node) === "grpc" ? compact({ "grpc-service-name": rawString(node, "serviceName", "service-name") }) : undefined;
}

function realityOpts(node: ProxyNode): Record<string, unknown> | undefined {
  if (node.raw.security !== "reality") return undefined;
  const existing = node.raw["reality-opts"];
  if (existing && typeof existing === "object") return existing as Record<string, unknown>;
  return compact({ "public-key": rawString(node, "pbk"), "short-id": rawString(node, "sid") });
}

function skipCertVerify(node: ProxyNode): boolean {
  return boolish(node.raw.insecure) || boolish(node.raw.allowInsecure) || boolish(node.raw["skip-cert-verify"]);
}

export function nodeToClashProxy(node: ProxyNode): Record<string, unknown> | null {
  if (node.protocol === "vless" && node.raw.uuid) {
    return compact({
      name: node.name,
      type: "vless",
      server: node.host,
      port: node.port,
      uuid: node.raw.uuid,
      tls: tlsEnabled(node),
      servername: rawString(node, "sni", "servername"),
      network: network(node),
      udp: node.raw.udp ?? true,
      flow: node.raw.flow,
      alpn: node.raw.alpn,
      "client-fingerprint": rawString(node, "fp", "client-fingerprint"),
      "skip-cert-verify": skipCertVerify(node),
      "ws-opts": wsOpts(node),
      "grpc-opts": grpcOpts(node),
      "reality-opts": realityOpts(node)
    });
  }
  if (node.protocol === "vmess" && node.raw.uuid) {
    return compact({
      name: node.name,
      type: "vmess",
      server: node.host,
      port: node.port,
      uuid: node.raw.uuid,
      alterId: node.raw.alterId ?? 0,
      cipher: node.raw.cipher ?? "auto",
      tls: tlsEnabled(node),
      servername: rawString(node, "sni", "servername"),
      network: network(node),
      udp: node.raw.udp ?? true,
      alpn: node.raw.alpn,
      "client-fingerprint": rawString(node, "fp", "client-fingerprint"),
      "skip-cert-verify": skipCertVerify(node),
      "ws-opts": wsOpts(node),
      "grpc-opts": grpcOpts(node)
    });
  }
  if (node.protocol === "hysteria2") {
    return compact({
      name: node.name,
      type: "hysteria2",
      server: node.host,
      port: node.port,
      password: node.raw.password,
      sni: node.raw.sni,
      alpn: node.raw.alpn,
      udp: node.raw.udp ?? true,
      "skip-cert-verify": skipCertVerify(node)
    });
  }
  if (node.protocol === "tuic") {
    return compact({
      name: node.name,
      type: "tuic",
      server: node.host,
      port: node.port,
      uuid: node.raw.uuid,
      password: node.raw.password,
      sni: node.raw.sni,
      alpn: node.raw.alpn,
      udp: node.raw.udp ?? true,
      "congestion-controller": node.raw["congestion-controller"] ?? "bbr",
      "udp-relay-mode": node.raw["udp-relay-mode"] ?? "native",
      "skip-cert-verify": skipCertVerify(node)
    });
  }
  if (node.protocol === "anytls") {
    return compact({
      name: node.name,
      type: "anytls",
      server: node.host,
      port: node.port,
      password: node.raw.password,
      sni: node.raw.sni,
      alpn: node.raw.alpn,
      udp: node.raw.udp ?? true,
      "skip-cert-verify": skipCertVerify(node)
    });
  }
  const raw = { ...node.raw };
  return {
    ...raw,
    name: node.name,
    type: node.protocol,
    server: node.host,
    port: node.port
  };
}

export function exportClash(nodes: ProxyNode[]): string {
  const proxies = nodes.map(nodeToClashProxy).filter((proxy): proxy is Record<string, unknown> => proxy != null);
  return yaml.dump({
    port: 7890,
    "socks-port": 7891,
    "allow-lan": false,
    mode: "rule",
    "log-level": "info",
    proxies,
    "proxy-groups": [
      { name: "ProxyPanel-Auto", type: "url-test", proxies: proxies.map((p) => p.name), url: "https://www.gstatic.com/generate_204", interval: 300 },
      { name: "ProxyPanel-Select", type: "select", proxies: ["ProxyPanel-Auto", ...proxies.map((p) => p.name)] }
    ],
    rules: ["MATCH,ProxyPanel-Select"]
  }, { lineWidth: 160 });
}

