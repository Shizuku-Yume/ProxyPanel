import type { ProxyNode } from "./types.js";

function compact<T extends Record<string, unknown>>(input: T): T {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined && value !== "" && value !== null)) as T;
}

function boolish(value: unknown): boolean {
  return value === true || value === "1" || value === 1 || value === "true";
}

function tlsConfig(node: ProxyNode): Record<string, unknown> | undefined {
  const tlsEnabled = node.raw.security === "tls" || node.raw.security === "reality" || node.raw.tls === true || node.protocol === "hysteria2" || node.protocol === "tuic" || node.protocol === "anytls";
  if (!tlsEnabled) return undefined;
  const realityOpts = node.raw["reality-opts"] && typeof node.raw["reality-opts"] === "object" ? node.raw["reality-opts"] as Record<string, unknown> : {};
  return compact({
    enabled: true,
    server_name: node.raw.sni ?? node.raw.servername,
    insecure: boolish(node.raw.insecure) || boolish(node.raw.allowInsecure) || boolish(node.raw["skip-cert-verify"]),
    alpn: node.raw.alpn,
    utls: node.raw.fp || node.raw["client-fingerprint"] ? { enabled: true, fingerprint: node.raw.fp ?? node.raw["client-fingerprint"] } : undefined,
    reality: node.raw.security === "reality" ? compact({
      enabled: true,
      public_key: node.raw.pbk ?? realityOpts["public-key"],
      short_id: node.raw.sid ?? realityOpts["short-id"]
    }) : undefined
  });
}

function transportConfig(node: ProxyNode): Record<string, unknown> | undefined {
  const network = String(node.raw.network ?? node.raw.type ?? "tcp");
  if (network === "tcp") return undefined;
  if (network === "ws") return compact({ type: "ws", path: node.raw.path ?? "/", headers: compact({ Host: node.raw.host }) });
  if (network === "grpc") return compact({ type: "grpc", service_name: node.raw.serviceName ?? node.raw["service-name"] });
  return { type: network };
}

function nodeToOutbound(node: ProxyNode): Record<string, unknown> | null {
  const base = { tag: node.name, server: node.host, server_port: node.port };
  if (node.protocol === "vless" && node.raw.uuid) return compact({ ...base, type: "vless", uuid: node.raw.uuid, flow: node.raw.flow, tls: tlsConfig(node), transport: transportConfig(node) });
  if (node.protocol === "vmess" && node.raw.uuid) return compact({ ...base, type: "vmess", uuid: node.raw.uuid, security: node.raw.cipher ?? "auto", alter_id: node.raw.alterId ?? 0, tls: tlsConfig(node), transport: transportConfig(node) });
  if (node.protocol === "trojan" && node.raw.password) return compact({ ...base, type: "trojan", password: node.raw.password, tls: tlsConfig(node), transport: transportConfig(node) });
  if (node.protocol === "ss") return compact({ ...base, type: "shadowsocks", method: node.raw.method ?? node.raw.cipher, password: node.raw.password ?? node.raw.userinfo });
  if (node.protocol === "hysteria2") return compact({ ...base, type: "hysteria2", password: node.raw.password, tls: tlsConfig(node) });
  if (node.protocol === "tuic") return compact({ ...base, type: "tuic", uuid: node.raw.uuid, password: node.raw.password, congestion_control: node.raw["congestion-controller"] ?? "bbr", udp_relay_mode: node.raw["udp-relay-mode"] ?? "native", tls: tlsConfig(node) });
  if (node.protocol === "anytls") return compact({ ...base, type: "anytls", password: node.raw.password, tls: tlsConfig(node) });
  return null;
}

export function exportSingBox(nodes: ProxyNode[]): string {
  const outbounds = nodes.map(nodeToOutbound).filter((outbound): outbound is Record<string, unknown> => outbound != null);
  const tags = outbounds.map((outbound) => String(outbound.tag));
  return JSON.stringify({
    log: { level: "info" },
    dns: { servers: [{ tag: "local", address: "local" }] },
    inbounds: [
      { type: "mixed", tag: "mixed-in", listen: "127.0.0.1", listen_port: 7890 }
    ],
    outbounds: [
      { type: "selector", tag: "ProxyPanel-Select", outbounds: ["ProxyPanel-Auto", ...tags] },
      { type: "urltest", tag: "ProxyPanel-Auto", outbounds: tags, url: "https://www.gstatic.com/generate_204", interval: "5m" },
      ...outbounds,
      { type: "direct", tag: "direct" },
      { type: "block", tag: "block" }
    ],
    route: { final: "ProxyPanel-Select" }
  }, null, 2);
}
