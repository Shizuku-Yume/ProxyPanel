import type { SubscriptionSource } from "@proxypanel/shared";
import { extractVlessUris, parseClashNodes, stableId, vlessToNode, type ProxyNode } from "@proxypanel/shared";
import { GeoIpService } from "./geoip.js";
import { Store } from "./store.js";

async function loadSourceText(source: SubscriptionSource): Promise<string> {
  if (source.url.trim().startsWith("vless://")) return source.url.trim();
  const response = await fetch(source.url, { headers: { "user-agent": "ProxyPanel/0.1" } });
  if (!response.ok) throw new Error(`Fetch failed: ${response.status} ${response.statusText}`);
  return response.text();
}

function inferType(source: SubscriptionSource, text: string): "vless" | "clash" {
  if (source.type === "vless" || source.type === "clash") return source.type;
  if (source.url.trim().startsWith("vless://") || text.includes("vless://")) return "vless";
  return "clash";
}

export async function refreshSource(store: Store, geo: GeoIpService, source: SubscriptionSource): Promise<{ count: number }> {
  try {
    const text = await loadSourceText(source);
    const type = inferType(source, text);
    const now = new Date().toISOString();
    let nodes: ProxyNode[] = [];
    if (type === "vless") {
      nodes = extractVlessUris(text).map((uri) => vlessToNode(source.id, uri, now));
    } else {
      nodes = parseClashNodes(source.id, text, now);
    }
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
