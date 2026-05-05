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
  [key: string]: unknown;
}

export function parseClashYaml(text: string): ClashProxy[] {
  const doc = yaml.load(text) as { proxies?: ClashProxy[] } | ClashProxy[] | null;
  if (Array.isArray(doc)) return doc;
  if (doc && Array.isArray(doc.proxies)) return doc.proxies;
  return [];
}

export function clashProxyToNode(sourceId: string, proxy: ClashProxy, now = new Date().toISOString()): ProxyNode | null {
  const protocol = String(proxy.type ?? "unknown").toLowerCase() as ProxyNode["protocol"];
  const host = String(proxy.server ?? "").trim();
  const port = Number(proxy.port ?? 0);
  if (!host || !Number.isInteger(port) || port <= 0) return null;
  const name = String(proxy.name ?? `${host}:${port}`);
  const credential = String(proxy.uuid ?? proxy.password ?? proxy.cipher ?? "");
  const fingerprint = createFingerprint([protocol, host, port, credential, proxy.sni, proxy.network]);
  return {
    id: fingerprint,
    sourceId,
    name,
    protocol: ["vless", "trojan", "vmess", "ss", "http", "socks5"].includes(protocol) ? protocol : "unknown",
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

export function nodeToClashProxy(node: ProxyNode): Record<string, unknown> | null {
  if (node.protocol === "vless" && node.raw.uuid) {
    return {
      name: node.name,
      type: "vless",
      server: node.host,
      port: node.port,
      uuid: node.raw.uuid,
      tls: node.raw.security === "tls" || node.raw.security === "reality" || Boolean(node.raw.tls),
      servername: node.raw.sni ?? node.raw.servername,
      network: node.raw.type ?? node.raw.network ?? "tcp",
      "skip-cert-verify": Boolean(node.raw["skip-cert-verify"] ?? false)
    };
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
