import { describe, expect, it } from "vitest";
import { exportClash } from "../clash.js";
import { exportSingBox } from "../singbox.js";
import { extractProxyUris, parseShareUriNodes, vmessUriToNode } from "../uri.js";

const vmess = "vmess://eyJhZGQiOiJnY3Bwcm94eS5zaGl6dWt1eXVtZS5kcGRucy5vcmciLCJhaWQiOiIwIiwiaG9zdCI6ImdjcHByb3h5LnNoaXp1a3V5dW1lLmRwZG5zLm9yZyIsImlkIjoiYzU0MjEyYWYtNTgxMi00YjM3LThjODEtZTkxZDQ4YWI1NWY5IiwibmV0Ijoid3MiLCJwYXRoIjoiYzU0MjEyYWYtNTgxMi00YjM3LThjODEtZTkxZDQ4YWI1NWY5LXZtIiwicG9ydCI6IjIwODMiLCJwcyI6InZtLXdzLXRscy1wcm94eSIsInRscyI6InRscyIsInNuaSI6ImdjcHByb3h5LnNoaXp1a3V5dW1lLmRwZG5zLm9yZyIsImZwIjoiY2hyb21lIiwidHlwZSI6Im5vbmUiLCJ2IjoiMiJ9Cg==";
const hy2 = "hysteria2://c54212af-5812-4b37-8c81-e91d48ab55f9@gcpproxy.shizukuyume.dpdns.org:47730?security=tls&alpn=h3&insecure=0&allowInsecure=0&sni=gcpproxy.shizukuyume.dpdns.org#hy2-proxy";
const tuic = "tuic://c54212af-5812-4b37-8c81-e91d48ab55f9:c54212af-5812-4b37-8c81-e91d48ab55f9@gcpproxy.shizukuyume.dpdns.org:43813?congestion_control=bbr&udp_relay_mode=native&alpn=h3&sni=gcpproxy.shizukuyume.dpdns.org&insecure=0&allowInsecure=0#tu5-proxy";
const anytls = "anytls://c54212af-5812-4b37-8c81-e91d48ab55f9@gcpproxy.shizukuyume.dpdns.org:42438?&sni=gcpproxy.shizukuyume.dpdns.org&allowInsecure=0&insecure=0#anytls-proxy";

describe("mixed share URI parsing", () => {
  it("extracts vmess, hysteria2, tuic5 and anytls from aggregate text", () => {
    const text = `vl-reality-proxy ${vmess} ${hy2} ${tuic} ${anytls}`;
    expect(extractProxyUris(text)).toHaveLength(4);
    const nodes = parseShareUriNodes("source-1", text);
    expect(nodes.map((node) => node.protocol)).toEqual(["vmess", "hysteria2", "tuic", "anytls"]);
    expect(nodes.map((node) => node.name)).toEqual(["vm-ws-tls-proxy", "hy2-proxy", "tu5-proxy", "anytls-proxy"]);
  });

  it("decodes vmess payload fields", () => {
    const node = vmessUriToNode("source-1", vmess);
    expect(node.host).toBe("gcpproxy.shizukuyume.dpdns.org");
    expect(node.port).toBe(2083);
    expect(node.raw.uuid).toBe("c54212af-5812-4b37-8c81-e91d48ab55f9");
    expect(node.raw.network).toBe("ws");
  });

  it("exports parsed mixed protocols to Clash-compatible YAML", () => {
    const nodes = parseShareUriNodes("source-1", `${vmess}\n${hy2}\n${tuic}\n${anytls}`);
    const yaml = exportClash(nodes);
    expect(yaml).toContain("type: vmess");
    expect(yaml).toContain("type: hysteria2");
    expect(yaml).toContain("type: tuic");
    expect(yaml).toContain("type: anytls");
    expect(yaml).toContain("udp: true");
    expect(yaml).toContain("skip-cert-verify: false");
  });
});


describe("sing-box export", () => {
  it("exports parsed share URI nodes to sing-box JSON", () => {
    const nodes = parseShareUriNodes("source-1", `${vmess}
${hy2}
${tuic}
${anytls}`);
    const config = JSON.parse(exportSingBox(nodes)) as { outbounds: Array<{ type: string; tag: string }> };
    expect(config.outbounds.some((outbound) => outbound.type === "selector" && outbound.tag === "ProxyPanel-Select")).toBe(true);
    expect(config.outbounds.some((outbound) => outbound.type === "hysteria2")).toBe(true);
    expect(config.outbounds.some((outbound) => outbound.type === "tuic")).toBe(true);
    expect(config.outbounds.some((outbound) => outbound.type === "anytls")).toBe(true);
  });
});
