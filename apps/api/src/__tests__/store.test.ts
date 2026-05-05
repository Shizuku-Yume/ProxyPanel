import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { Store } from "../store.js";
import { scoreNode } from "@proxypanel/shared";

describe("Store", () => {
  it("keeps token disabled after output profile is disabled", () => {
    const store = new Store(path.join(os.tmpdir(), `proxypanel-${Date.now()}.db`));
    const profile = store.createOutput({ id: "out-1", name: "Default", enabled: true, format: "clash", includeRegions: [], includeSourceIds: [], includeTags: [], sortStrategy: "score" });
    expect(store.getOutputByToken(profile.token)).not.toBeNull();
    store.updateOutput(profile.id, { enabled: false });
    expect(store.getOutputByToken(profile.token)).toBeNull();
    store.close();
  });

  it("scores failed nodes below reliable low-latency nodes", () => {
    expect(scoreNode(1, 80, 0, true)).toBeGreaterThan(scoreNode(0.2, 1500, 4, true));
  });
});
