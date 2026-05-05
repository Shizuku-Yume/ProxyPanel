import { describe, expect, it } from "vitest";
import { exportClash, parseClashNodes } from "../clash.js";

describe("clash", () => {
  it("parses Clash YAML proxies and exports merged YAML", () => {
    const text = `
proxies:
  - name: US-1
    type: vless
    server: 8.8.8.8
    port: 443
    uuid: 550e8400-e29b-41d4-a716-446655440000
    tls: true
`;
    const nodes = parseClashNodes("source-1", text);
    expect(nodes).toHaveLength(1);
    expect(nodes[0].host).toBe("8.8.8.8");
    const yaml = exportClash(nodes);
    expect(yaml).toContain("ProxyPanel-Auto");
    expect(yaml).toContain("US-1");
  });
});
