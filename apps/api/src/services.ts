import type { SubscriptionSource } from "@proxypanel/shared";
import { parseClashNodes, parseShareUriNodes, stableId, type ProxyNode } from "@proxypanel/shared";
import { GeoIpService } from "./geoip.js";
import { Store } from "./store.js";

const DIRECT_URI_PATTERN = /^(?:vless|vmess|hysteria2|hy2|tuic|anytls|trojan|ss):\/\//i;

async function loadSourceText(source: SubscriptionSource): Promise<string> {
  const input = source.url.trim();
  if (DIRECT_URI_PATTERN.test(input) || !/^https?:\/\//i.test(input)) return input;
  const response = await fetch(input, { headers: { "user-agent": "ProxyPanel/0.1" } });
  if (!response.ok) throw new Error(`Fetch failed: ${response.status} ${response.statusText}`);
  return response.text();
}

function parseNodes(source: SubscriptionSource, text: string, now: string): ProxyNode[] {
  if (source.type === "clash") return parseClashNodes(source.id, text, now);
  if (source.type === "vless") return parseShareUriNodes(source.id, text, now).filter((node) => node.protocol === "vless");

  const shareNodes = parseShareUriNodes(source.id, text, now);
  if (shareNodes.length > 0) return shareNodes;
  return parseClashNodes(source.id, text, now);
}

export async function refreshSource(store: Store, geo: GeoIpService, source: SubscriptionSource): Promise<{ count: number }> {
  try {
    const text = await loadSourceText(source);
    const now = new Date().toISOString();
    const nodes = parseNodes(source, text, now);
    for (const node of nodes) {
      const resolved = await geo.resolveHost(node.host);
      node.ip = resolved.ip;
      node.region = resolved.region;
      node.id = stableId(`${source.id}:${node.fingerprint}`);
      store.upsertNode(node);
    }
    store.updateSource(source.id, { lastRefreshAt: now, lastError: null });
    return { count: nodes.length };
  } catch (error) {
    store.updateSource(source.id, { lastError: error instanceof Error ? error.message : String(error) });
    throw error;
  }
}

export async function refreshDueSources(store: Store, geo: GeoIpService): Promise<void> {
  const sources = store.enabledSources();
  const now = Date.now();
  for (const source of sources) {
    const last = source.lastRefreshAt ? Date.parse(source.lastRefreshAt) : 0;
    if (!last || now - last >= source.refreshIntervalMinutes * 60_000) {
      await refreshSource(store, geo, source).catch(() => undefined);
    }
  }
}
