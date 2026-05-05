import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildApp } from "../app.js";
import type { AppConfig } from "../config.js";

const apps: Array<ReturnType<typeof buildApp>> = [];
const aggregateSample = "vl-reality-proxy vmess://eyJhZGQiOiJnY3Bwcm94eS5zaGl6dWt1eXVtZS5kcGRucy5vcmciLCJhaWQiOiIwIiwiaG9zdCI6ImdjcHByb3h5LnNoaXp1a3V5dW1lLmRwZG5zLm9yZyIsImlkIjoiYzU0MjEyYWYtNTgxMi00YjM3LThjODEtZTkxZDQ4YWI1NWY5IiwibmV0Ijoid3MiLCJwYXRoIjoiYzU0MjEyYWYtNTgxMi00YjM3LThjODEtZTkxZDQ4YWI1NWY5LXZtIiwicG9ydCI6IjIwODMiLCJwcyI6InZtLXdzLXRscy1wcm94eSIsInRscyI6InRscyIsInNuaSI6ImdjcHByb3h5LnNoaXp1a3V5dW1lLmRwZG5zLm9yZyIsImZwIjoiY2hyb21lIiwidHlwZSI6Im5vbmUiLCJ2IjoiMiJ9Cg== hysteria2://c54212af-5812-4b37-8c81-e91d48ab55f9@gcpproxy.shizukuyume.dpdns.org:47730?security=tls&alpn=h3&insecure=0&allowInsecure=0&sni=gcpproxy.shizukuyume.dpdns.org#hy2-proxy tuic://c54212af-5812-4b37-8c81-e91d48ab55f9:c54212af-5812-4b37-8c81-e91d48ab55f9@gcpproxy.shizukuyume.dpdns.org:43813?congestion_control=bbr&udp_relay_mode=native&alpn=h3&sni=gcpproxy.shizukuyume.dpdns.org&insecure=0&allowInsecure=0#tu5-proxy anytls://c54212af-5812-4b37-8c81-e91d48ab55f9@gcpproxy.shizukuyume.dpdns.org:42438?&sni=gcpproxy.shizukuyume.dpdns.org&allowInsecure=0&insecure=0#anytls-proxy";

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

function testConfig(): AppConfig {
  return {
    adminPassword: "testpass",
    sessionSecret: "test-secret",
    databasePath: path.join(os.tmpdir(), `proxypanel-app-${Date.now()}-${Math.random()}.db`),
    geoipDbPath: path.resolve("data", "geoip.json"),
    host: "127.0.0.1",
    port: 0,
    corsOrigin: "*",
    subscriptionRefreshMinutes: 60,
    probeIntervalMinutes: 60,
    probeTimeoutMs: 200,
    webDistPath: path.join(os.tmpdir(), "missing-web-dist")
  };
}

async function loginToken(app: ReturnType<typeof buildApp>): Promise<string> {
  const login = await app.inject({ method: "POST", url: "/api/login", payload: { password: "testpass" } });
  return login.json<{ token: string }>().token;
}

describe("source API", () => {
  it("creates, refreshes and deletes a direct VLESS source even with empty JSON body", async () => {
    const app = buildApp(testConfig());
    apps.push(app);
    const token = await loginToken(app);

    const created = await app.inject({
      method: "POST",
      url: "/api/sources",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        name: "direct-vless",
        url: "vless://550e8400-e29b-41d4-a716-446655440000@127.0.0.1:443?security=tls&type=ws&sni=example.com#Test",
        type: "auto",
        enabled: true,
        refreshIntervalMinutes: 60
      }
    });
    expect(created.statusCode).toBe(201);
    const sourceId = created.json<{ id: string }>().id;

    const refreshed = await app.inject({
      method: "POST",
      url: `/api/sources/${sourceId}/refresh`,
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }
    });
    expect(refreshed.statusCode).toBe(200);
    expect(refreshed.json<{ count: number; added: number; protocols: Record<string, number> }>().count).toBe(1);
    expect(refreshed.json<{ protocols: Record<string, number> }>().protocols.vless).toBe(1);

    const nodes = await app.inject({ method: "GET", url: "/api/nodes", headers: { authorization: `Bearer ${token}` } });
    expect(nodes.json<unknown[]>()).toHaveLength(1);

    const deleted = await app.inject({
      method: "DELETE",
      url: `/api/sources/${sourceId}`,
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }
    });
    expect(deleted.statusCode).toBe(200);
  });

  it("refreshes pasted aggregate text containing vmess, hysteria2, tuic5 and anytls", async () => {
    const app = buildApp(testConfig());
    apps.push(app);
    const token = await loginToken(app);

    const created = await app.inject({
      method: "POST",
      url: "/api/sources",
      headers: { authorization: `Bearer ${token}` },
      payload: { name: "aggregate", url: aggregateSample, type: "auto", enabled: true, refreshIntervalMinutes: 60 }
    });
    const sourceId = created.json<{ id: string }>().id;

    const refreshed = await app.inject({ method: "POST", url: `/api/sources/${sourceId}/refresh`, headers: { authorization: `Bearer ${token}` } });
    expect(refreshed.statusCode).toBe(200);
    expect(refreshed.json<{ count: number }>().count).toBe(4);

    const nodes = await app.inject({ method: "GET", url: "/api/nodes", headers: { authorization: `Bearer ${token}` } });
    expect(nodes.json<Array<{ protocol: string }>>().map((node) => node.protocol).sort()).toEqual(["anytls", "hysteria2", "tuic", "vmess"]);
  });

  it("serves URI, legacy VLESS, Clash and sing-box subscription outputs", async () => {
    const app = buildApp(testConfig());
    apps.push(app);
    const token = await loginToken(app);

    const created = await app.inject({
      method: "POST",
      url: "/api/sources",
      headers: { authorization: `Bearer ${token}` },
      payload: { name: "aggregate", url: aggregateSample, type: "auto", enabled: true, refreshIntervalMinutes: 60 }
    });
    const sourceId = created.json<{ id: string }>().id;
    await app.inject({ method: "POST", url: `/api/sources/${sourceId}/refresh`, headers: { authorization: `Bearer ${token}` } });

    const output = await app.inject({
      method: "POST",
      url: "/api/output-profiles",
      headers: { authorization: `Bearer ${token}` },
      payload: { name: "default", enabled: true, format: "clash", includeRegions: [], includeSourceIds: [], includeTags: [], includeProtocols: ["vmess"], maxLatencyMs: null, minSuccessRate: null, limit: null, sortStrategy: "score" }
    });
    const outputToken = output.json<{ token: string }>().token;

    const uris = await app.inject({ method: "GET", url: `/sub/${outputToken}/uris` });
    expect(uris.body).toContain("vmess://");
    const legacy = await app.inject({ method: "GET", url: `/sub/${outputToken}/vless` });
    expect(legacy.body).toBe(uris.body);
    const clash = await app.inject({ method: "GET", url: `/sub/${outputToken}/clash` });
    expect(clash.body).toContain("type: vmess");
    const singbox = await app.inject({ method: "GET", url: `/sub/${outputToken}/sing-box` });
    expect(singbox.headers["content-type"]).toContain("application/json");
    expect(JSON.parse(singbox.body).outbounds.some((outbound: { type: string }) => outbound.type === "vmess")).toBe(true);
  });
});
