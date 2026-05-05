import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { GeoIpService } from "../geoip.js";

describe("GeoIpService", () => {
  it("classifies IPv4 by local CIDR database", () => {
    const file = path.join(os.tmpdir(), `geoip-${Date.now()}.json`);
    fs.writeFileSync(file, JSON.stringify({ ranges: [{ cidr: "8.8.8.0/24", region: "United States" }] }));
    const geo = new GeoIpService(file);
    expect(geo.lookupIp("8.8.8.8")).toBe("United States");
    expect(geo.lookupIp("10.0.0.1")).toBe("Private");
  });
});
