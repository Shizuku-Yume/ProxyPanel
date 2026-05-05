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
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined && value !== "")) as T;
}

export function nodeToClashProxy(node: ProxyNode): Record<string, unknown> | null {
  if (node.protocol === "vless" && node.raw.uuid) {
    return compact({
      name: node.name,
      type: "vless",
      server: node.host,
      port: node.port,
      uuid: node.raw.uuid,
      tls: node.raw.security === "tls" || node.raw.security === "reality" || Boolean(node.raw.tls),
      servername: node.raw.sni ?? node.raw.servername,
      network: node.raw.type ?? node.raw.network ?? "tcp",
      "skip-cert-verify": Boolean(node.raw["skip-cert-verify"] ?? false)
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
      tls: Boolean(node.raw.tls),
      servername: node.raw.sni ?? node.raw.servername,
      network: node.raw.network ?? "tcp",
      "ws-opts": node.raw.network === "ws" ? { path: node.raw.path ?? "/", headers: compact({ Host: node.raw.host }) } : undefined
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
      "skip-cert-verify": node.raw.insecure === "1" || node.raw.allowInsecure === "1" || node.raw["skip-cert-verify"] === true
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
      "congestion-controller": node.raw["congestion-controller"] ?? "bbr",
      "udp-relay-mode": node.raw["udp-relay-mode"] ?? "native",
      "skip-cert-verify": node.raw.insecure === "1" || node.raw.allowInsecure === "1" || node.raw["skip-cert-verify"] === true
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
      "skip-cert-verify": node.raw.insecure === "1" || node.raw.allowInsecure === "1" || node.raw["skip-cert-verify"] === true
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

