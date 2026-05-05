import crypto from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { AppConfig } from "./config.js";

interface SessionPayload { exp: number; sub: "admin" }

function b64(input: Buffer | string): string { return Buffer.from(input).toString("base64url"); }
function sign(data: string, secret: string): string { return crypto.createHmac("sha256", secret).update(data).digest("base64url"); }

export function createSession(secret: string): { token: string; expiresAt: string } {
  const exp = Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60;
  const payload: SessionPayload = { sub: "admin", exp };
  const body = b64(JSON.stringify(payload));
  return { token: `${body}.${sign(body, secret)}`, expiresAt: new Date(exp * 1000).toISOString() };
}

export function verifySession(token: string, secret: string): boolean {
  try {
    const [body, sig] = token.split(".");
    if (!body || !sig) return false;
    const expected = sign(body, secret);
    if (sig.length !== expected.length) return false;
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return false;
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as SessionPayload;
    return payload.sub === "admin" && payload.exp > Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
}

export function authPreHandler(config: AppConfig) {
  return async function authenticate(request: FastifyRequest, reply: FastifyReply) {
    const auth = request.headers.authorization;
    const token = auth?.startsWith("Bearer ") ? auth.slice(7) : null;
    if (!token || !verifySession(token, config.sessionSecret)) {
      await reply.code(401).send({ error: "unauthorized", message: "Authentication required" });
    }
  };
}

export function safePasswordEquals(input: string, expected: string): boolean {
  const a = Buffer.from(input);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
