import { z } from "zod";

export const subscriptionSourceInputSchema = z.object({
  name: z.string().min(1).max(120),
  url: z.string().min(1),
  type: z.enum(["auto", "vless", "clash"]).default("auto"),
  enabled: z.boolean().default(true),
  refreshIntervalMinutes: z.number().int().min(5).max(10080).default(60)
});

export const subscriptionSourcePatchSchema = subscriptionSourceInputSchema.partial();

export const nodePatchSchema = z.object({
  enabled: z.boolean().optional(),
  tags: z.array(z.string().min(1).max(40)).optional(),
  name: z.string().min(1).max(160).optional()
});

const proxyProtocolSchema = z.enum(["vless", "trojan", "vmess", "ss", "http", "socks5", "hysteria2", "tuic", "anytls", "unknown"]);

export const outputProfileInputSchema = z.object({
  name: z.string().min(1).max(120),
  enabled: z.boolean().default(true),
  format: z.enum(["clash", "uris", "vless", "sing-box"]).default("clash"),
  includeRegions: z.array(z.string()).default([]),
  includeSourceIds: z.array(z.string()).default([]),
  includeTags: z.array(z.string()).default([]),
  includeProtocols: z.array(proxyProtocolSchema).default([]),
  maxLatencyMs: z.number().int().positive().nullable().default(null),
  minSuccessRate: z.number().min(0).max(1).nullable().default(null),
  limit: z.number().int().positive().max(5000).nullable().default(null),
  sortStrategy: z.enum(["score", "latency", "region", "name", "successRate", "random"]).default("score")
});

export const outputProfilePatchSchema = outputProfileInputSchema.partial().extend({
  rotateToken: z.boolean().optional()
});
