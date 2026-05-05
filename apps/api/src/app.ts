import fs from "node:fs";
import path from "node:path";
import cors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import Fastify from "fastify";
import { exportClash, exportSingBox, outputProfileInputSchema, outputProfilePatchSchema, randomToken, subscriptionSourceInputSchema, subscriptionSourcePatchSchema, nodePatchSchema, stableId } from "@proxypanel/shared";
import type { ProxyNode } from "@proxypanel/shared";
import { authPreHandler, createSession, safePasswordEquals } from "./auth.js";
import type { AppConfig } from "./config.js";
import { GeoIpService } from "./geoip.js";
import { TcpTlsProbeProvider } from "./probe.js";
import { refreshDueSources, refreshSource } from "./services.js";
import { Store } from "./store.js";

export function buildApp(config: AppConfig, store = new Store(config.databasePath), geo = new GeoIpService(config.geoipDbPath)) {
  const app = Fastify({ logger: true });
  app.removeContentTypeParser("application/json");
  app.addContentTypeParser("application/json", { parseAs: "string" }, (_request, body, done) => {
    const text = String(body ?? "").trim();
    if (!text) return done(null, {});
    try { return done(null, JSON.parse(text) as unknown); } catch (error) { return done(error as Error); }
  });
  app.addContentTypeParser("application/x-www-form-urlencoded", { parseAs: "string" }, (_request, body, done) => {
    const text = String(body ?? "");
    return done(null, Object.fromEntries(new URLSearchParams(text)));
  });
  const probeProvider = new TcpTlsProbeProvider(config.probeTimeoutMs);
  const authenticate = authPreHandler(config);

  app.register(cors, { origin: config.corsOrigin === "*" ? true : config.corsOrigin });

  app.get("/health", async () => ({ ok: true }));

  app.post<{ Body: { password?: string } }>("/api/login", async (request, reply) => {
    if (!safePasswordEquals(String(request.body?.password ?? ""), config.adminPassword)) {
      return reply.code(401).send({ error: "invalid_credentials", message: "Invalid password" });
    }
    return createSession(config.sessionSecret);
  });

  app.get("/api/dashboard", { preHandler: authenticate }, async () => store.stats());

  app.get("/api/sources", { preHandler: authenticate }, async () => store.listSources());
  app.post("/api/sources", { preHandler: authenticate }, async (request, reply) => {
    const input = subscriptionSourceInputSchema.parse(request.body);
    const source = store.createSource({ id: stableId(`${input.name}:${input.url}:${Date.now()}`), ...input });
    return reply.code(201).send(source);
  });
  app.patch<{ Params: { id: string } }>("/api/sources/:id", { preHandler: authenticate }, async (request, reply) => {
    const input = subscriptionSourcePatchSchema.parse(request.body);
    const source = store.updateSource(request.params.id, input);
    return source ?? reply.code(404).send({ error: "not_found", message: "Source not found" });
  });
  app.delete<{ Params: { id: string } }>("/api/sources/:id", { preHandler: authenticate }, async (request, reply) => {
    return store.deleteSource(request.params.id) ? { ok: true } : reply.code(404).send({ error: "not_found", message: "Source not found" });
  });
  app.post<{ Params: { id: string } }>("/api/sources/:id/refresh", { preHandler: authenticate }, async (request, reply) => {
    const source = store.getSource(request.params.id);
    if (!source) return reply.code(404).send({ error: "not_found", message: "Source not found" });
    try {
      const result = await refreshSource(store, geo, source);
      return { ok: true, ...result };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return reply.code(400).send({ error: "refresh_failed", message, sourceId: source.id, sourceName: source.name });
    }
  });

  app.get("/api/nodes", { preHandler: authenticate }, async () => store.listNodes());
  app.patch<{ Params: { id: string } }>("/api/nodes/:id", { preHandler: authenticate }, async (request, reply) => {
    const input = nodePatchSchema.parse(request.body);
    const node = store.updateNode(request.params.id, input);
    return node ?? reply.code(404).send({ error: "not_found", message: "Node not found" });
  });
  app.post("/api/nodes/probe", { preHandler: authenticate }, async () => {
    const nodes = store.listNodes().filter((node) => node.enabled);
    const results = [];
    for (const node of nodes) {
      const result = await probeProvider.probe(node);
      results.push(store.addProbeResult(node.id, result.success, result.latencyMs, result.error));
    }
    return { ok: true, count: results.length, results };
  });

  app.get("/api/output-profiles", { preHandler: authenticate }, async () => store.listOutputs());
  app.post("/api/output-profiles", { preHandler: authenticate }, async (request, reply) => {
    const input = outputProfileInputSchema.parse(request.body);
    const profile = store.createOutput({ id: stableId(`${input.name}:${Date.now()}`), token: randomToken(), ...input });
    return reply.code(201).send(profile);
  });
  app.patch<{ Params: { id: string } }>("/api/output-profiles/:id", { preHandler: authenticate }, async (request, reply) => {
    const input = outputProfilePatchSchema.parse(request.body);
    const profile = store.updateOutput(request.params.id, input);
    return profile ?? reply.code(404).send({ error: "not_found", message: "Output profile not found" });
  });
  app.delete<{ Params: { id: string } }>("/api/output-profiles/:id", { preHandler: authenticate }, async (request, reply) => {
    return store.deleteOutput(request.params.id) ? { ok: true } : reply.code(404).send({ error: "not_found", message: "Output profile not found" });
  });

  function outputNodes(token: string): { profileFormat: string; nodes: ProxyNode[] } | null {
    const profile = store.getOutputByToken(token);
    if (!profile) return null;
    return { profileFormat: profile.format, nodes: store.nodesForOutput(profile) };
  }

  app.get<{ Params: { token: string } }>("/sub/:token/clash", async (request, reply) => {
    const result = outputNodes(request.params.token);
    if (!result) return reply.code(404).send("invalid token");
    return reply.header("content-type", "text/yaml; charset=utf-8").send(exportClash(result.nodes));
  });
  app.get<{ Params: { token: string } }>("/sub/:token/sing-box", async (request, reply) => {
    const result = outputNodes(request.params.token);
    if (!result) return reply.code(404).send("invalid token");
    return reply.header("content-type", "application/json; charset=utf-8").send(exportSingBox(result.nodes));
  });
  const sendUriList = async (token: string, reply: import("fastify").FastifyReply) => {
    const result = outputNodes(token);
    if (!result) return reply.code(404).send("invalid token");
    const body = result.nodes.filter((node) => node.shareUri).map((node) => node.shareUri).join("\n");
    return reply.header("content-type", "text/plain; charset=utf-8").send(body);
  };
  app.get<{ Params: { token: string } }>("/sub/:token/vless", async (request, reply) => sendUriList(request.params.token, reply));
  app.get<{ Params: { token: string } }>("/sub/:token/uris", async (request, reply) => sendUriList(request.params.token, reply));

  if (fs.existsSync(config.webDistPath)) {
    app.register(fastifyStatic, { root: config.webDistPath, prefix: "/" });
    app.setNotFoundHandler(async (request, reply) => {
      if (request.raw.url?.startsWith("/api/") || request.raw.url?.startsWith("/sub/")) return reply.code(404).send({ error: "not_found", message: "Not found" });
      return reply.type("text/html").send(fs.readFileSync(path.join(config.webDistPath, "index.html"), "utf8"));
    });
  }

  const refreshTimer = setInterval(() => refreshDueSources(store, geo).catch((error) => app.log.error(error)), Math.max(1, config.subscriptionRefreshMinutes) * 60_000);
  const probeTimer = setInterval(async () => {
    const nodes = store.listNodes().filter((node) => node.enabled);
    for (const node of nodes) {
      const result = await probeProvider.probe(node).catch((error) => ({ success: false, latencyMs: null, error: error instanceof Error ? error.message : String(error) }));
      store.addProbeResult(node.id, result.success, result.latencyMs, result.error);
    }
  }, Math.max(1, config.probeIntervalMinutes) * 60_000);

  app.addHook("onClose", async () => { clearInterval(refreshTimer); clearInterval(probeTimer); store.close(); });
  return app;
}
