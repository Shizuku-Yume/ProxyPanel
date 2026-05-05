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

function rawBool(node: ProxyNode, ...keys: string[]): boolean | undefined {
  for (const key of keys) {
    const value = node.raw[key];
    if (value !== undefined && value !== "") return boolish(value);
  }
  return undefined;
}

function network(node: ProxyNode): string {
  const raw = String(rawString(node, "network", "type") ?? "tcp").toLowerCase();
  if (raw === "httpupgrade") return "http-upgrade";
  return raw || "tcp";
}

function tlsEnabled(node: ProxyNode): boolean {
  return node.raw.security === "tls" || node.raw.security === "reality" || boolish(node.raw.tls) || node.protocol === "hysteria2" || node.protocol === "tuic" || node.protocol === "anytls";
}

function wsOpts(node: ProxyNode): Record<string, unknown> | undefined {
  if (network(node) !== "ws") return undefined;
  const existing = node.raw["ws-opts"];
  if (existing && typeof existing === "object") return existing as Record<string, unknown>;
  return compact({ path: rawString(node, "path") ?? "/", headers: compact({ Host: rawString(node, "host") }) });
}

function grpcOpts(node: ProxyNode): Record<string, unknown> | undefined {
  if (network(node) !== "grpc") return undefined;
  const existing = node.raw["grpc-opts"];
  if (existing && typeof existing === "object") return existing as Record<string, unknown>;
  return compact({ "grpc-service-name": rawString(node, "serviceName", "service-name", "grpc-service-name") });
}

function h2Opts(node: ProxyNode): Record<string, unknown> | undefined {
  if (network(node) !== "h2") return undefined;
  const existing = node.raw["h2-opts"];
  if (existing && typeof existing === "object") return existing as Record<string, unknown>;
  const host = rawString(node, "host");
  return compact({ path: rawString(node, "path") ?? "/", host: typeof host === "string" ? [host] : host });
}

function httpUpgradeOpts(node: ProxyNode): Record<string, unknown> | undefined {
  if (network(node) !== "http-upgrade") return undefined;
  const existing = node.raw["http-upgrade-opts"];
  if (existing && typeof existing === "object") return existing as Record<string, unknown>;
  return compact({ path: rawString(node, "path") ?? "/", headers: compact({ Host: rawString(node, "host") }) });
}

function realityOpts(node: ProxyNode): Record<string, unknown> | undefined {
  if (node.raw.security !== "reality") return undefined;
  const existing = node.raw["reality-opts"];
  if (existing && typeof existing === "object") return existing as Record<string, unknown>;
  return compact({ "public-key": rawString(node, "pbk", "public-key"), "short-id": rawString(node, "sid", "short-id") });
}

function skipCertVerify(node: ProxyNode): boolean {
  return boolish(node.raw.insecure) || boolish(node.raw.allowInsecure) || boolish(node.raw["skip-cert-verify"]);
}

function alpn(node: ProxyNode): unknown {
  const value = rawString(node, "alpn");
  return typeof value === "string" && value.includes(",") ? value.split(",").map((item) => item.trim()).filter(Boolean) : value;
}

function commonTlsFields(node: ProxyNode): Record<string, unknown> {
  return {
    tls: tlsEnabled(node),
    servername: rawString(node, "sni", "servername"),
    alpn: alpn(node),
    "client-fingerprint": rawString(node, "fp", "client-fingerprint"),
    "skip-cert-verify": skipCertVerify(node)
  };
}

export function nodeToClashProxy(node: ProxyNode): Record<string, unknown> | null {
  if (node.protocol === "vless" && node.raw.uuid) {
    return compact({
      name: node.name,
      type: "vless",
      server: node.host,
      port: node.port,
      uuid: node.raw.uuid,
      ...commonTlsFields(node),
      network: network(node),
      udp: node.raw.udp ?? true,
      flow: node.raw.flow,
      "ws-opts": wsOpts(node),
      "grpc-opts": grpcOpts(node),
      "h2-opts": h2Opts(node),
      "http-upgrade-opts": httpUpgradeOpts(node),
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
      ...commonTlsFields(node),
      network: network(node),
      udp: node.raw.udp ?? true,
      "ws-opts": wsOpts(node),
      "grpc-opts": grpcOpts(node),
      "h2-opts": h2Opts(node),
      "http-upgrade-opts": httpUpgradeOpts(node)
    });
  }
  if (node.protocol === "trojan") {
    return compact({
      name: node.name,
      type: "trojan",
      server: node.host,
      port: node.port,
      password: node.raw.password,
      ...commonTlsFields(node),
      network: network(node),
      udp: node.raw.udp ?? true,
      "ws-opts": wsOpts(node),
      "grpc-opts": grpcOpts(node),
      "h2-opts": h2Opts(node)
    });
  }
  if (node.protocol === "ss") {
    return compact({
      name: node.name,
      type: "ss",
      server: node.host,
      port: node.port,
      cipher: node.raw.method ?? node.raw.cipher,
      password: node.raw.password,
      udp: node.raw.udp ?? true,
      plugin: node.raw.plugin,
      "plugin-opts": node.raw["plugin-opts"]
    });
  }
  if (node.protocol === "hysteria2") {
    return compact({
      name: node.name,
      type: "hysteria2",
      server: node.host,
      port: node.port,
      password: node.raw.password,
      sni: rawString(node, "sni", "servername"),
      alpn: alpn(node),
      obfs: node.raw.obfs,
      "obfs-password": rawString(node, "obfs-password", "obfs_password"),
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
      sni: rawString(node, "sni", "servername"),
      alpn: alpn(node),
      udp: node.raw.udp ?? true,
      "congestion-controller": rawString(node, "congestion-controller", "congestion_control") ?? "bbr",
      "udp-relay-mode": rawString(node, "udp-relay-mode", "udp_relay_mode") ?? "native",
      "disable-sni": rawBool(node, "disable-sni", "disable_sni"),
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
      sni: rawString(node, "sni", "servername"),
      alpn: alpn(node),
      udp: node.raw.udp ?? true,
      "skip-cert-verify": skipCertVerify(node)
    });
  }
  if (node.protocol === "http" || node.protocol === "socks5") {
    return compact({
      name: node.name,
      type: node.protocol,
      server: node.host,
      port: node.port,
      username: rawString(node, "username"),
      password: rawString(node, "password"),
      tls: tlsEnabled(node) || undefined,
      "skip-cert-verify": skipCertVerify(node) || undefined
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
  const names = proxies.map((p) => String(p.name));
  return yaml.dump({
    port: 7890,
    "socks-port": 7891,
    "allow-lan": false,
    mode: "rule",
    "log-level": "info",
    proxies,
    "proxy-groups": [
      { name: "ProxyPanel-Auto", type: "url-test", proxies: names, url: "https://www.gstatic.com/generate_204", interval: 300 },
      { name: "ProxyPanel-Select", type: "select", proxies: ["ProxyPanel-Auto", ...names] }
    ],
    rules: ["MATCH,ProxyPanel-Select"]
  }, { lineWidth: 160 });
}
