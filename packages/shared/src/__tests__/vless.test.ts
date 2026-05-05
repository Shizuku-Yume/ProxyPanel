import { describe, expect, it } from "vitest";
import { extractVlessUris, parseVlessUri, serializeVlessUri, vlessToNode } from "../vless.js";

const uri = "vless://550e8400-e29b-41d4-a716-446655440000@example.com:443?security=tls&type=ws&sni=example.com#Test%20Node";

describe("vless", () => {
  it("parses and serializes VLESS URI", () => {
    const parsed = parseVlessUri(uri);
    expect(parsed.id).toBe("550e8400-e29b-41d4-a716-446655440000");
    expect(parsed.host).toBe("example.com");
    expect(parsed.port).toBe(443);
    expect(parsed.params.security).toBe("tls");
    expect(serializeVlessUri(parsed)).toContain("vless://550e8400-e29b-41d4-a716-446655440000@example.com:443");
  });

  it("converts VLESS URI to normalized node", () => {
    const node = vlessToNode("source-1", uri);
    expect(node.protocol).toBe("vless");
    expect(node.raw.uuid).toBe("550e8400-e29b-41d4-a716-446655440000");
    expect(node.shareUri).toBe(uri);
  });

  it("extracts base64 encoded subscription body", () => {
    const encoded = Buffer.from(`${uri}\n`).toString("base64");
    expect(extractVlessUris(encoded)).toEqual([uri]);
  });
});
