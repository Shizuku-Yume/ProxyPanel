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

export const outputProfileInputSchema = z.object({
  name: z.string().min(1).max(120),
  enabled: z.boolean().default(true),
  format: z.enum(["clash", "vless"]).default("clash"),
  includeRegions: z.array(z.string()).default([]),
  includeSourceIds: z.array(z.string()).default([]),
  includeTags: z.array(z.string()).default([]),
  sortStrategy: z.enum(["score", "latency", "region", "name"]).default("score")
});

export const outputProfilePatchSchema = outputProfileInputSchema.partial().extend({
  rotateToken: z.boolean().optional()
});
