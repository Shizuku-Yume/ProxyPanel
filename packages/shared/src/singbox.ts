import type { ProxyNode } from "./types.js";

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

function alpn(node: ProxyNode): unknown {
  const value = rawString(node, "alpn");
  return typeof value === "string" && value.includes(",") ? value.split(",").map((item) => item.trim()).filter(Boolean) : value;
}

function skipCertVerify(node: ProxyNode): boolean {
  return boolish(node.raw.insecure) || boolish(node.raw.allowInsecure) || boolish(node.raw["skip-cert-verify"]);
}

function tlsEnabled(node: ProxyNode): boolean {
  return node.raw.security === "tls" || node.raw.security === "reality" || boolish(node.raw.tls) || node.protocol === "hysteria2" || node.protocol === "tuic" || node.protocol === "anytls" || node.protocol === "trojan";
}

function tlsConfig(node: ProxyNode): Record<string, unknown> | undefined {
  if (!tlsEnabled(node)) return undefined;
  const realityOpts = node.raw["reality-opts"] && typeof node.raw["reality-opts"] === "object" ? node.raw["reality-opts"] as Record<string, unknown> : {};
  return compact({
    enabled: true,
    server_name: rawString(node, "sni", "servername"),
    insecure: skipCertVerify(node),
    alpn: alpn(node),
    utls: rawString(node, "fp", "client-fingerprint") ? { enabled: true, fingerprint: rawString(node, "fp", "client-fingerprint") } : undefined,
    reality: node.raw.security === "reality" ? compact({
      enabled: true,
      public_key: rawString(node, "pbk", "public-key") ?? realityOpts["public-key"],
      short_id: rawString(node, "sid", "short-id") ?? realityOpts["short-id"]
    }) : undefined
  });
}

function transportConfig(node: ProxyNode): Record<string, unknown> | undefined {
  const network = String(rawString(node, "network", "type") ?? "tcp").toLowerCase();
  if (!network || network === "tcp") return undefined;
  if (network === "ws") return compact({ type: "ws", path: rawString(node, "path") ?? "/", headers: compact({ Host: rawString(node, "host") }) });
  if (network === "grpc") return compact({ type: "grpc", service_name: rawString(node, "serviceName", "service-name", "grpc-service-name") });
  if (network === "h2") return compact({ type: "http", path: rawString(node, "path") ?? "/", host: rawString(node, "host") });
  if (network === "httpupgrade" || network === "http-upgrade") return compact({ type: "httpupgrade", path: rawString(node, "path") ?? "/", headers: compact({ Host: rawString(node, "host") }) });
  return { type: network };
}

function nodeToOutbound(node: ProxyNode): Record<string, unknown> | null {
  const base = { tag: node.name, server: node.host, server_port: node.port };
  if (node.protocol === "vless" && node.raw.uuid) return compact({ ...base, type: "vless", uuid: node.raw.uuid, flow: node.raw.flow, packet_encoding: node.raw.packetEncoding ?? node.raw["packet-encoding"], tls: tlsConfig(node), transport: transportConfig(node) });
  if (node.protocol === "vmess" && node.raw.uuid) return compact({ ...base, type: "vmess", uuid: node.raw.uuid, security: node.raw.cipher ?? "auto", alter_id: node.raw.alterId ?? 0, tls: tlsConfig(node), transport: transportConfig(node) });
  if (node.protocol === "trojan" && node.raw.password) return compact({ ...base, type: "trojan", password: node.raw.password, tls: tlsConfig(node), transport: transportConfig(node) });
  if (node.protocol === "ss") return compact({ ...base, type: "shadowsocks", method: node.raw.method ?? node.raw.cipher, password: node.raw.password ?? node.raw.userinfo, plugin: node.raw.plugin, plugin_opts: node.raw["plugin-opts"] });
  if (node.protocol === "hysteria2") return compact({ ...base, type: "hysteria2", password: node.raw.password, obfs: node.raw.obfs ? { type: node.raw.obfs, password: rawString(node, "obfs-password", "obfs_password") } : undefined, tls: tlsConfig(node) });
  if (node.protocol === "tuic") return compact({ ...base, type: "tuic", uuid: node.raw.uuid, password: node.raw.password, congestion_control: rawString(node, "congestion-controller", "congestion_control") ?? "bbr", udp_relay_mode: rawString(node, "udp-relay-mode", "udp_relay_mode") ?? "native", zero_rtt_handshake: boolish(node.raw["zero-rtt-handshake"] ?? node.raw.zero_rtt_handshake), tls: tlsConfig(node) });
  if (node.protocol === "anytls") return compact({ ...base, type: "anytls", password: node.raw.password, tls: tlsConfig(node) });
  if (node.protocol === "http" || node.protocol === "socks5") return compact({ ...base, type: node.protocol, username: node.raw.username, password: node.raw.password, tls: tlsConfig(node) });
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
