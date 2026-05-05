import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { Store } from "../store.js";
import { scoreNode } from "@proxypanel/shared";

function createStore(): Store {
  return new Store(path.join(os.tmpdir(), `proxypanel-${Date.now()}-${Math.random()}.db`));
}

describe("Store", () => {
  it("keeps token disabled after output profile is disabled", () => {
    const store = createStore();
    const profile = store.createOutput({ id: "out-1", name: "Default", enabled: true, format: "clash", includeRegions: [], includeSourceIds: [], includeTags: [], includeProtocols: [], maxLatencyMs: null, minSuccessRate: null, limit: null, sortStrategy: "score" });
    expect(store.getOutputByToken(profile.token)).not.toBeNull();
    store.updateOutput(profile.id, { enabled: false });
    expect(store.getOutputByToken(profile.token)).toBeNull();
    store.close();
  });

  it("persists output profile protocol and quality filters", () => {
    const store = createStore();
    const profile = store.createOutput({ id: "out-2", name: "Filtered", enabled: true, format: "sing-box", includeRegions: ["US"], includeSourceIds: [], includeTags: [], includeProtocols: ["vmess"], maxLatencyMs: 300, minSuccessRate: 0.8, limit: 20, sortStrategy: "successRate" });
    expect(profile.format).toBe("sing-box");
    expect(profile.includeProtocols).toEqual(["vmess"]);
    expect(profile.maxLatencyMs).toBe(300);
    expect(profile.minSuccessRate).toBe(0.8);
    expect(profile.limit).toBe(20);
    store.close();
  });

  it("scores failed nodes below reliable low-latency nodes", () => {
    expect(scoreNode(1, 80, 0, true)).toBeGreaterThan(scoreNode(0.2, 1500, 4, true));
  });
});
