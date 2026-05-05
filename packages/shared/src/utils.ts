import crypto from "node:crypto";

export function stableId(input: string): string {
  return crypto.createHash("sha256").update(input).digest("hex").slice(0, 24);
}

export function createFingerprint(parts: Array<string | number | null | undefined>): string {
  return stableId(parts.map((p) => String(p ?? "")).join("|"));
}

export function randomToken(bytes = 24): string {
  return crypto.randomBytes(bytes).toString("base64url");
}

export function scoreNode(successRate: number, latencyMs: number | null, failCount: number, enabled: boolean): number {
  if (!enabled) return 0;
  const latencyScore = latencyMs == null ? 35 : Math.max(0, 100 - Math.min(latencyMs, 3000) / 30);
  const reliabilityScore = Math.max(0, Math.min(100, successRate * 100));
  const penalty = Math.min(40, failCount * 8);
  return Math.round(Math.max(0, reliabilityScore * 0.65 + latencyScore * 0.35 - penalty));
}

export function normalizeTag(tag: string): string {
  return tag.trim().replace(/\s+/g, "-").slice(0, 40);
}
