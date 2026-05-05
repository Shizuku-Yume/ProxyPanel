import dns from "node:dns/promises";
import fs from "node:fs";
import net from "node:net";

interface GeoEntry { cidr: string; region: string }
interface ParsedGeoEntry extends GeoEntry { base: number; mask: number }

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((p) => !Number.isInteger(p) || p < 0 || p > 255)) return null;
  return (((parts[0] * 256 + parts[1]) * 256 + parts[2]) * 256 + parts[3]) >>> 0;
}

function parseCidr(cidr: string): { base: number; mask: number } | null {
  const [ip, bitsRaw] = cidr.split("/");
  const bits = Number(bitsRaw ?? 32);
  const base = ipv4ToInt(ip);
  if (base == null || !Number.isInteger(bits) || bits < 0 || bits > 32) return null;
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  return { base: base & mask, mask };
}

export class GeoIpService {
  private entries: ParsedGeoEntry[] = [];

  constructor(filename: string) {
    this.load(filename);
  }

  load(filename: string): void {
    try {
      const text = fs.readFileSync(filename, "utf8");
      const raw = JSON.parse(text) as { ranges?: GeoEntry[] } | GeoEntry[];
      const ranges = Array.isArray(raw) ? raw : raw.ranges ?? [];
      this.entries = ranges.flatMap((entry) => {
        const parsed = parseCidr(entry.cidr);
        return parsed ? [{ ...entry, ...parsed }] : [];
      });
    } catch {
      this.entries = [];
    }
  }

  lookupIp(ip: string | null): string {
    if (!ip) return "Unknown";
    if (net.isIP(ip) !== 4) return "Unknown";
    if (ip.startsWith("10.") || ip.startsWith("192.168.") || /^172\.(1[6-9]|2\d|3[0-1])\./.test(ip) || ip.startsWith("127.")) return "Private";
    const value = ipv4ToInt(ip);
    if (value == null) return "Unknown";
    const match = this.entries.find((entry) => (value & entry.mask) === entry.base);
    return match?.region ?? "Unknown";
  }

  async resolveHost(host: string): Promise<{ ip: string | null; region: string }> {
    if (net.isIP(host)) {
      const region = this.lookupIp(host);
      return { ip: host, region };
    }
    try {
      const records = await dns.lookup(host, { family: 4 });
      const ip = records.address;
      return { ip, region: this.lookupIp(ip) };
    } catch {
      return { ip: null, region: "Unknown" };
    }
  }
}
