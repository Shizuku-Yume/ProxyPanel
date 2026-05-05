import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildApp } from "../app.js";
import type { AppConfig } from "../config.js";

const apps: Array<ReturnType<typeof buildApp>> = [];

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

describe("source API", () => {
  it("creates, refreshes and deletes a direct VLESS source even with empty JSON body", async () => {
    const app = buildApp(testConfig());
    apps.push(app);

    const login = await app.inject({ method: "POST", url: "/api/login", payload: { password: "testpass" } });
    const token = login.json<{ token: string }>().token;

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
    expect(refreshed.json<{ count: number }>().count).toBe(1);

    const nodes = await app.inject({ method: "GET", url: "/api/nodes", headers: { authorization: `Bearer ${token}` } });
    expect(nodes.json<unknown[]>()).toHaveLength(1);

    const deleted = await app.inject({
      method: "DELETE",
      url: `/api/sources/${sourceId}`,
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }
    });
    expect(deleted.statusCode).toBe(200);
  });
});
