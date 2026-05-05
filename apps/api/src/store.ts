import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { DashboardStats, OutputProfile, ProbeResult, ProxyNode, SubscriptionSource } from "@proxypanel/shared";
import { randomToken, scoreNode } from "@proxypanel/shared";

interface Row { [key: string]: unknown }

function bool(value: unknown): boolean { return Number(value) === 1 || value === true; }
function jsonArray(value: unknown): string[] { if (!value) return []; try { const parsed = JSON.parse(String(value)); return Array.isArray(parsed) ? parsed.map(String) : []; } catch { return []; } }
function jsonObject(value: unknown): Record<string, unknown> { if (!value) return {}; try { const parsed = JSON.parse(String(value)); return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {}; } catch { return {}; } }
function nowIso(): string { return new Date().toISOString(); }

export class Store {
  readonly db: DatabaseSync;

  constructor(filename: string) {
    fs.mkdirSync(path.dirname(filename), { recursive: true });
    this.db = new DatabaseSync(filename);
    this.db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
    this.migrate();
  }

  close(): void { this.db.close(); }

  migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sources (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        url TEXT NOT NULL,
        type TEXT NOT NULL DEFAULT 'auto',
        enabled INTEGER NOT NULL DEFAULT 1,
        refresh_interval_minutes INTEGER NOT NULL DEFAULT 60,
        last_refresh_at TEXT,
        last_error TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS nodes (
        id TEXT PRIMARY KEY,
        source_id TEXT NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        protocol TEXT NOT NULL,
        host TEXT NOT NULL,
        port INTEGER NOT NULL,
        ip TEXT,
        region TEXT NOT NULL DEFAULT 'Unknown',
        tags_json TEXT NOT NULL DEFAULT '[]',
        enabled INTEGER NOT NULL DEFAULT 1,
        fingerprint TEXT NOT NULL,
        raw_json TEXT NOT NULL DEFAULT '{}',
        share_uri TEXT,
        last_latency_ms INTEGER,
        last_probe_at TEXT,
        success_rate REAL NOT NULL DEFAULT 0,
        fail_count INTEGER NOT NULL DEFAULT 0,
        score INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(source_id, fingerprint)
      );
      CREATE INDEX IF NOT EXISTS idx_nodes_source ON nodes(source_id);
      CREATE INDEX IF NOT EXISTS idx_nodes_region ON nodes(region);
      CREATE TABLE IF NOT EXISTS probe_results (
        id TEXT PRIMARY KEY,
        node_id TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
        success INTEGER NOT NULL,
        latency_ms INTEGER,
        error TEXT,
        probed_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_probe_node_time ON probe_results(node_id, probed_at DESC);
      CREATE TABLE IF NOT EXISTS output_profiles (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        token TEXT NOT NULL UNIQUE,
        enabled INTEGER NOT NULL DEFAULT 1,
        format TEXT NOT NULL DEFAULT 'clash',
        include_regions_json TEXT NOT NULL DEFAULT '[]',
        include_source_ids_json TEXT NOT NULL DEFAULT '[]',
        include_tags_json TEXT NOT NULL DEFAULT '[]',
        include_protocols_json TEXT NOT NULL DEFAULT '[]',
        max_latency_ms INTEGER,
        min_success_rate REAL,
        limit_count INTEGER,
        sort_strategy TEXT NOT NULL DEFAULT 'score',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);
    this.addColumnIfMissing("output_profiles", "include_protocols_json", "TEXT NOT NULL DEFAULT '[]'");
    this.addColumnIfMissing("output_profiles", "max_latency_ms", "INTEGER");
    this.addColumnIfMissing("output_profiles", "min_success_rate", "REAL");
    this.addColumnIfMissing("output_profiles", "limit_count", "INTEGER");
  }

  private addColumnIfMissing(table: string, column: string, definition: string): void {
    const rows = this.db.prepare(`PRAGMA table_info(${table})`).all() as Row[];
    if (!rows.some((row) => row.name === column)) this.db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition};`);
  }

  rowToSource(row: Row): SubscriptionSource {
    return { id: String(row.id), name: String(row.name), url: String(row.url), type: row.type as SubscriptionSource["type"], enabled: bool(row.enabled), refreshIntervalMinutes: Number(row.refresh_interval_minutes), lastRefreshAt: row.last_refresh_at as string | null, lastError: row.last_error as string | null, createdAt: String(row.created_at), updatedAt: String(row.updated_at) };
  }

  rowToNode(row: Row): ProxyNode {
    return { id: String(row.id), sourceId: String(row.source_id), name: String(row.name), protocol: row.protocol as ProxyNode["protocol"], host: String(row.host), port: Number(row.port), ip: row.ip as string | null, region: String(row.region), tags: jsonArray(row.tags_json), enabled: bool(row.enabled), fingerprint: String(row.fingerprint), raw: jsonObject(row.raw_json), shareUri: row.share_uri as string | null, lastLatencyMs: row.last_latency_ms == null ? null : Number(row.last_latency_ms), lastProbeAt: row.last_probe_at as string | null, successRate: Number(row.success_rate), failCount: Number(row.fail_count), score: Number(row.score), createdAt: String(row.created_at), updatedAt: String(row.updated_at) };
  }

  rowToOutput(row: Row): OutputProfile {
    return {
      id: String(row.id),
      name: String(row.name),
      token: String(row.token),
      enabled: bool(row.enabled),
      format: row.format as OutputProfile["format"],
      includeRegions: jsonArray(row.include_regions_json),
      includeSourceIds: jsonArray(row.include_source_ids_json),
      includeTags: jsonArray(row.include_tags_json),
      includeProtocols: jsonArray(row.include_protocols_json) as OutputProfile["includeProtocols"],
      maxLatencyMs: row.max_latency_ms == null ? null : Number(row.max_latency_ms),
      minSuccessRate: row.min_success_rate == null ? null : Number(row.min_success_rate),
      limit: row.limit_count == null ? null : Number(row.limit_count),
      sortStrategy: row.sort_strategy as OutputProfile["sortStrategy"],
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at)
    };
  }

  listSources(): SubscriptionSource[] { return this.db.prepare("SELECT * FROM sources ORDER BY created_at DESC").all().map((r) => this.rowToSource(r as Row)); }
  enabledSources(): SubscriptionSource[] { return this.db.prepare("SELECT * FROM sources WHERE enabled = 1 ORDER BY created_at DESC").all().map((r) => this.rowToSource(r as Row)); }
  getSource(id: string): SubscriptionSource | null { const row = this.db.prepare("SELECT * FROM sources WHERE id = ?").get(id); return row ? this.rowToSource(row as Row) : null; }

  createSource(input: Omit<SubscriptionSource, "createdAt" | "updatedAt" | "lastRefreshAt" | "lastError">): SubscriptionSource {
    const ts = nowIso();
    this.db.prepare("INSERT INTO sources (id,name,url,type,enabled,refresh_interval_minutes,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)").run(input.id, input.name, input.url, input.type, input.enabled ? 1 : 0, input.refreshIntervalMinutes, ts, ts);
    return this.getSource(input.id)!;
  }

  updateSource(id: string, patch: Partial<Pick<SubscriptionSource, "name" | "url" | "type" | "enabled" | "refreshIntervalMinutes" | "lastRefreshAt" | "lastError">>): SubscriptionSource | null {
    const current = this.getSource(id); if (!current) return null;
    const next = { ...current, ...patch, updatedAt: nowIso() };
    this.db.prepare("UPDATE sources SET name=?, url=?, type=?, enabled=?, refresh_interval_minutes=?, last_refresh_at=?, last_error=?, updated_at=? WHERE id=?").run(next.name, next.url, next.type, next.enabled ? 1 : 0, next.refreshIntervalMinutes, next.lastRefreshAt, next.lastError, next.updatedAt, id);
    return this.getSource(id);
  }

  deleteSource(id: string): boolean { return this.db.prepare("DELETE FROM sources WHERE id = ?").run(id).changes > 0; }

  listNodes(): ProxyNode[] { return this.db.prepare("SELECT * FROM nodes ORDER BY score DESC, region ASC, name ASC").all().map((r) => this.rowToNode(r as Row)); }
  getNode(id: string): ProxyNode | null { const row = this.db.prepare("SELECT * FROM nodes WHERE id = ?").get(id); return row ? this.rowToNode(row as Row) : null; }

  upsertNode(node: ProxyNode): ProxyNode {
    const existing = this.db.prepare("SELECT * FROM nodes WHERE source_id = ? AND fingerprint = ?").get(node.sourceId, node.fingerprint) as Row | undefined;
    const ts = nowIso();
    if (existing) {
      this.db.prepare(`UPDATE nodes SET name=?, protocol=?, host=?, port=?, ip=?, region=?, raw_json=?, share_uri=?, updated_at=? WHERE id=?`).run(node.name, node.protocol, node.host, node.port, node.ip, node.region, JSON.stringify(node.raw), node.shareUri, ts, String(existing.id));
      return this.getNode(String(existing.id))!;
    }
    this.db.prepare(`INSERT INTO nodes (id,source_id,name,protocol,host,port,ip,region,tags_json,enabled,fingerprint,raw_json,share_uri,last_latency_ms,last_probe_at,success_rate,fail_count,score,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(node.id, node.sourceId, node.name, node.protocol, node.host, node.port, node.ip, node.region, JSON.stringify(node.tags), node.enabled ? 1 : 0, node.fingerprint, JSON.stringify(node.raw), node.shareUri, node.lastLatencyMs, node.lastProbeAt, node.successRate, node.failCount, node.score, node.createdAt, node.updatedAt);
    return this.getNode(node.id)!;
  }

  updateNode(id: string, patch: Partial<Pick<ProxyNode, "enabled" | "tags" | "name" | "ip" | "region">>): ProxyNode | null {
    const current = this.getNode(id); if (!current) return null;
    const next = { ...current, ...patch, updatedAt: nowIso() };
    const score = scoreNode(next.successRate, next.lastLatencyMs, next.failCount, next.enabled);
    this.db.prepare("UPDATE nodes SET name=?, ip=?, region=?, tags_json=?, enabled=?, score=?, updated_at=? WHERE id=?").run(next.name, next.ip, next.region, JSON.stringify(next.tags), next.enabled ? 1 : 0, score, next.updatedAt, id);
    return this.getNode(id);
  }

  addProbeResult(nodeId: string, success: boolean, latencyMs: number | null, error: string | null): ProbeResult {
    const probedAt = nowIso();
    const id = `${nodeId}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    this.db.prepare("INSERT INTO probe_results (id,node_id,success,latency_ms,error,probed_at) VALUES (?,?,?,?,?,?)").run(id, nodeId, success ? 1 : 0, latencyMs, error, probedAt);
    const recent = this.db.prepare("SELECT success, latency_ms FROM probe_results WHERE node_id = ? ORDER BY probed_at DESC LIMIT 20").all(nodeId) as Row[];
    const successCount = recent.filter((r) => bool(r.success)).length;
    const latencies = recent.map((r) => r.latency_ms == null ? null : Number(r.latency_ms)).filter((v): v is number => v != null);
    const avgLatency = latencies.length ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : null;
    const current = this.getNode(nodeId);
    const failCount = success ? 0 : (current?.failCount ?? 0) + 1;
    const successRate = recent.length ? successCount / recent.length : 0;
    const score = scoreNode(successRate, avgLatency, failCount, current?.enabled ?? true);
    this.db.prepare("UPDATE nodes SET last_latency_ms=?, last_probe_at=?, success_rate=?, fail_count=?, score=?, updated_at=? WHERE id=?").run(avgLatency, probedAt, successRate, failCount, score, probedAt, nodeId);
    return { id, nodeId, success, latencyMs, error, probedAt };
  }

  listOutputs(): OutputProfile[] { return this.db.prepare("SELECT * FROM output_profiles ORDER BY created_at DESC").all().map((r) => this.rowToOutput(r as Row)); }
  getOutput(id: string): OutputProfile | null { const row = this.db.prepare("SELECT * FROM output_profiles WHERE id = ?").get(id); return row ? this.rowToOutput(row as Row) : null; }
  getOutputByToken(token: string): OutputProfile | null { const row = this.db.prepare("SELECT * FROM output_profiles WHERE token = ? AND enabled = 1").get(token); return row ? this.rowToOutput(row as Row) : null; }

  createOutput(input: Omit<OutputProfile, "createdAt" | "updatedAt" | "token"> & { token?: string }): OutputProfile {
    const ts = nowIso(); const token = input.token ?? randomToken();
    this.db.prepare(`INSERT INTO output_profiles (id,name,token,enabled,format,include_regions_json,include_source_ids_json,include_tags_json,include_protocols_json,max_latency_ms,min_success_rate,limit_count,sort_strategy,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(input.id, input.name, token, input.enabled ? 1 : 0, input.format, JSON.stringify(input.includeRegions), JSON.stringify(input.includeSourceIds), JSON.stringify(input.includeTags), JSON.stringify(input.includeProtocols), input.maxLatencyMs, input.minSuccessRate, input.limit, input.sortStrategy, ts, ts);
    return this.getOutput(input.id)!;
  }

  updateOutput(id: string, patch: Partial<Omit<OutputProfile, "id" | "createdAt" | "updatedAt">> & { rotateToken?: boolean }): OutputProfile | null {
    const current = this.getOutput(id); if (!current) return null;
    const next = { ...current, ...patch, token: patch.rotateToken ? randomToken() : (patch.token ?? current.token), updatedAt: nowIso() };
    this.db.prepare("UPDATE output_profiles SET name=?, token=?, enabled=?, format=?, include_regions_json=?, include_source_ids_json=?, include_tags_json=?, include_protocols_json=?, max_latency_ms=?, min_success_rate=?, limit_count=?, sort_strategy=?, updated_at=? WHERE id=?").run(next.name, next.token, next.enabled ? 1 : 0, next.format, JSON.stringify(next.includeRegions), JSON.stringify(next.includeSourceIds), JSON.stringify(next.includeTags), JSON.stringify(next.includeProtocols), next.maxLatencyMs, next.minSuccessRate, next.limit, next.sortStrategy, next.updatedAt, id);
    return this.getOutput(id);
  }

  deleteOutput(id: string): boolean { return this.db.prepare("DELETE FROM output_profiles WHERE id = ?").run(id).changes > 0; }

  nodesForOutput(profile: OutputProfile): ProxyNode[] {
    let nodes = this.listNodes().filter((node) => node.enabled);
    if (profile.includeRegions.length) nodes = nodes.filter((node) => profile.includeRegions.includes(node.region));
    if (profile.includeSourceIds.length) nodes = nodes.filter((node) => profile.includeSourceIds.includes(node.sourceId));
    if (profile.includeTags.length) nodes = nodes.filter((node) => node.tags.some((tag) => profile.includeTags.includes(tag)));
    if (profile.includeProtocols.length) nodes = nodes.filter((node) => profile.includeProtocols.includes(node.protocol));
    if (profile.maxLatencyMs != null) nodes = nodes.filter((node) => node.lastLatencyMs != null && node.lastLatencyMs <= profile.maxLatencyMs!);
    if (profile.minSuccessRate != null) nodes = nodes.filter((node) => node.successRate >= profile.minSuccessRate!);
    const byFingerprint = new Map<string, ProxyNode>();
    for (const node of nodes) {
      const existing = byFingerprint.get(node.fingerprint);
      if (!existing || node.score > existing.score) byFingerprint.set(node.fingerprint, node);
    }
    nodes = Array.from(byFingerprint.values());
    switch (profile.sortStrategy) {
      case "latency": nodes.sort((a, b) => (a.lastLatencyMs ?? Number.MAX_SAFE_INTEGER) - (b.lastLatencyMs ?? Number.MAX_SAFE_INTEGER)); break;
      case "region": nodes.sort((a, b) => a.region.localeCompare(b.region) || b.score - a.score); break;
      case "name": nodes.sort((a, b) => a.name.localeCompare(b.name)); break;
      case "successRate": nodes.sort((a, b) => b.successRate - a.successRate || (a.lastLatencyMs ?? 999999) - (b.lastLatencyMs ?? 999999)); break;
      case "random": nodes.sort(() => Math.random() - 0.5); break;
      default: nodes.sort((a, b) => b.score - a.score || (a.lastLatencyMs ?? 999999) - (b.lastLatencyMs ?? 999999));
    }
    return profile.limit != null ? nodes.slice(0, profile.limit) : nodes;
  }

  stats(): DashboardStats {
    const one = (sql: string) => Number((this.db.prepare(sql).get() as Row | undefined)?.value ?? 0);
    return {
      sourceCount: one("SELECT COUNT(*) value FROM sources"),
      enabledSourceCount: one("SELECT COUNT(*) value FROM sources WHERE enabled = 1"),
      nodeCount: one("SELECT COUNT(*) value FROM nodes"),
      enabledNodeCount: one("SELECT COUNT(*) value FROM nodes WHERE enabled = 1"),
      availableNodeCount: one("SELECT COUNT(*) value FROM nodes WHERE enabled = 1 AND success_rate > 0"),
      lastProbeAt: (this.db.prepare("SELECT MAX(last_probe_at) value FROM nodes").get() as Row | undefined)?.value as string | null ?? null,
      lastRefreshAt: (this.db.prepare("SELECT MAX(last_refresh_at) value FROM sources").get() as Row | undefined)?.value as string | null ?? null
    };
  }
}


