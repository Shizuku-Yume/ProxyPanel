import React from "react";
import { createRoot } from "react-dom/client";
import type { DashboardStats, OutputProfile, ProxyNode, ProxyProtocol, SubscriptionSource } from "@proxypanel/shared";
import { api, getToken, setToken } from "./api.js";
import "./styles.css";

const PROTOCOLS: ProxyProtocol[] = ["vless", "vmess", "hysteria2", "tuic", "anytls", "trojan", "ss", "http", "socks5"];

type RefreshSummary = { sourceId: string; message: string; ok: boolean };
type IconName = "activity" | "database" | "globe" | "layers" | "link" | "lock" | "logOut" | "nodes" | "refresh" | "search" | "settings" | "shield" | "spark" | "copy" | "plus" | "sun" | "moon";

function fmt(value: string | null | undefined): string { return value ? new Date(value).toLocaleString() : "-"; }
function baseUrl(): string { return window.location.origin; }
function pct(value: number): string { return `${Math.round(value * 100)}%`; }

function Icon({ name }: { name: IconName }) {
  const paths: Record<IconName, React.ReactNode> = {
    activity: <><path d="M22 12h-4l-3 8-6-16-3 8H2" /></>,
    database: <><ellipse cx="12" cy="5" rx="8" ry="3" /><path d="M4 5v14c0 1.66 3.58 3 8 3s8-1.34 8-3V5" /><path d="M4 12c0 1.66 3.58 3 8 3s8-1.34 8-3" /></>,
    globe: <><circle cx="12" cy="12" r="10" /><path d="M2 12h20" /><path d="M12 2a15.3 15.3 0 0 1 0 20" /><path d="M12 2a15.3 15.3 0 0 0 0 20" /></>,
    layers: <><path d="m12 2 9 5-9 5-9-5 9-5Z" /><path d="m3 12 9 5 9-5" /><path d="m3 17 9 5 9-5" /></>,
    link: <><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" /></>,
    lock: <><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></>,
    logOut: <><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="m16 17 5-5-5-5" /><path d="M21 12H9" /></>,
    nodes: <><circle cx="6" cy="6" r="3" /><circle cx="18" cy="6" r="3" /><circle cx="12" cy="18" r="3" /><path d="m8.6 8 2.8 7" /><path d="m15.4 8-2.8 7" /><path d="M9 6h6" /></>,
    refresh: <><path d="M21 12a9 9 0 0 1-15.4 6.4L3 16" /><path d="M3 21v-5h5" /><path d="M3 12A9 9 0 0 1 18.4 5.6L21 8" /><path d="M21 3v5h-5" /></>,
    search: <><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></>,
    settings: <><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.52a2 2 0 0 1-1 1.72l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.38a2 2 0 0 0-.73-2.73l-.15-.09a2 2 0 0 1-1-1.72v-.52a2 2 0 0 1 1-1.72l.15-.1a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2Z" /><circle cx="12" cy="12" r="3" /></>,
    shield: <><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.68 0C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1Z" /></>,
    spark: <><path d="M12 3 9.7 9.7 3 12l6.7 2.3L12 21l2.3-6.7L21 12l-6.7-2.3L12 3Z" /></>,
    copy: <><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></>,
    plus: <><path d="M12 5v14" /><path d="M5 12h14" /></>,
    sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2" /><path d="M12 20v2" /><path d="m4.93 4.93 1.41 1.41" /><path d="m17.66 17.66 1.41 1.41" /><path d="M2 12h2" /><path d="M20 12h2" /><path d="m6.34 17.66-1.41 1.41" /><path d="m19.07 4.93-1.41 1.41" /></>,
    moon: <><path d="M20.99 12.36A9 9 0 1 1 11.64 3a7 7 0 0 0 9.35 9.36Z" /></>
  };
  return <svg className="icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}

function IconBox({ name, tone = "raised" }: { name: IconName; tone?: "raised" | "inset" }) {
  return <span className={`icon-box ${tone}`}><Icon name={name} /></span>;
}

function StatusBadge({ tone, children }: { tone: "success" | "warning" | "error" | "info" | "muted"; children: React.ReactNode }) {
  return <span className={`status-badge ${tone}`}>{children}</span>;
}

function StatCard({ label, value, icon, hint }: { label: string; value: React.ReactNode; icon: IconName; hint?: string }) {
  return <article className="neo-card stat-card"><IconBox name={icon} tone="inset" /><div><span>{label}</span><strong>{value}</strong>{hint && <small>{hint}</small>}</div></article>;
}

function Login({ onLogin }: { onLogin: () => void }) {
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState("");
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    try {
      const res = await api.login(password);
      setToken(res.token);
      onLogin();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }
  return <main className="login-shell"><form className="neo-card login-card" onSubmit={submit}>
    <div className="login-brand"><IconBox name="shield" /><div><h1>ProxyPanel</h1><p>管理员控制台</p></div></div>
    <div className="neo-inset login-copy"><strong>安全入口</strong><span>输入管理员密码进入订阅整合、节点优选与输出配置面板。</span></div>
    <label className="field"><span>Admin password</span><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="输入管理员密码" autoFocus /></label>
    <button className="btn primary" type="submit"><Icon name="lock" />登录</button>
    {error && <div className="alert error"><Icon name="shield" />{error}</div>}
  </form></main>;
}

function Sources({ sources, reload }: { sources: SubscriptionSource[]; reload: () => void }) {
  const [form, setForm] = React.useState({ name: "", url: "", type: "auto", refreshIntervalMinutes: 60 });
  const [busy, setBusy] = React.useState("");
  const [summary, setSummary] = React.useState<RefreshSummary | null>(null);
  async function add(event: React.FormEvent) {
    event.preventDefault();
    setBusy("add");
    try {
      await api.createSource({ ...form, enabled: true } as Partial<SubscriptionSource>);
      setForm({ name: "", url: "", type: "auto", refreshIntervalMinutes: 60 });
      reload();
    } finally { setBusy(""); }
  }
  async function refresh(source: SubscriptionSource) {
    setBusy(source.id); setSummary(null);
    try {
      const result = await api.refreshSource(source.id);
      const protocolText = result.protocols ? Object.entries(result.protocols).map(([k, v]) => `${k}:${v}`).join(" / ") : "";
      setSummary({ sourceId: source.id, ok: true, message: `刷新成功：总 ${result.count}，新增 ${result.added ?? 0}，更新 ${result.updated ?? 0}${protocolText ? `，协议 ${protocolText}` : ""}` });
      reload();
    } catch (err) {
      setSummary({ sourceId: source.id, ok: false, message: err instanceof Error ? err.message : String(err) });
      reload();
    } finally { setBusy(""); }
  }
  return <section className="neo-card panel-section" id="sources">
    <div className="section-head"><div className="section-title"><IconBox name="database" tone="inset" /><div><h2>订阅源</h2><p>统一收集分享链接、Clash 订阅与混合文本。</p></div></div><StatusBadge tone="info">{sources.length} sources</StatusBadge></div>
    <form className="neo-inset source-form" onSubmit={add}>
      <label className="field"><span>名称</span><input placeholder="例如：Primary" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></label>
      <label className="field wide"><span>订阅 URL / 分享文本</span><input placeholder="vless://、混合分享文本或 Clash 订阅 URL" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} required /></label>
      <label className="field"><span>类型</span><select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}><option value="auto">自动识别</option><option value="vless">仅 VLESS</option><option value="clash">Clash</option></select></label>
      <label className="field compact"><span>刷新间隔</span><input type="number" min="5" value={form.refreshIntervalMinutes} onChange={(e) => setForm({ ...form, refreshIntervalMinutes: Number(e.target.value) })} /></label>
      <button className="btn primary form-action" disabled={busy === "add"} type="submit"><Icon name="plus" />{busy === "add" ? "添加中" : "添加"}</button>
    </form>
    {summary && <div className={summary.ok ? "alert success" : "alert error"}><Icon name={summary.ok ? "spark" : "shield"} />{summary.message}</div>}
    <div className="table-shell"><table><thead><tr><th>名称</th><th>类型</th><th>状态</th><th>最近刷新</th><th>错误详情</th><th>操作</th></tr></thead><tbody>{sources.map((source) => <tr key={source.id}><td><strong>{source.name}</strong><small title={source.url}>{source.url}</small></td><td><StatusBadge tone="muted">{source.type}</StatusBadge></td><td>{source.enabled ? <StatusBadge tone="success">启用</StatusBadge> : <StatusBadge tone="warning">禁用</StatusBadge>}</td><td>{fmt(source.lastRefreshAt)}</td><td className="error-cell">{source.lastError ? <span title={source.lastError}>{source.lastError}</span> : "-"}</td><td><div className="row-actions"><button className="btn secondary sm" type="button" disabled={busy === source.id} onClick={() => refresh(source)}>{busy === source.id ? "刷新中" : "刷新"}</button><button className="btn secondary sm" type="button" onClick={() => api.patchSource(source.id, { enabled: !source.enabled }).then(reload)}>{source.enabled ? "禁用" : "启用"}</button><button className="btn danger sm" type="button" onClick={() => api.deleteSource(source.id).then(reload)}>删除</button></div></td></tr>)}</tbody></table></div>
  </section>;
}

function nodeSearchText(node: ProxyNode): string {
  return [node.name, node.host, node.ip, node.region, node.protocol, ...node.tags].filter(Boolean).join(" ").toLowerCase();
}

function Nodes({ nodes, sources, reload }: { nodes: ProxyNode[]; sources: SubscriptionSource[]; reload: () => void }) {
  const regions = Array.from(new Set(nodes.map((node) => node.region))).sort();
  const protocols = Array.from(new Set(nodes.map((node) => node.protocol))).sort();
  const sourceName = React.useMemo(() => Object.fromEntries(sources.map((source) => [source.id, source.name])), [sources]);
  const [region, setRegion] = React.useState("");
  const [protocol, setProtocol] = React.useState("");
  const [sourceId, setSourceId] = React.useState("");
  const [status, setStatus] = React.useState("");
  const [query, setQuery] = React.useState("");
  const [selected, setSelected] = React.useState<string[]>([]);
  const filtered = nodes.filter((node) => {
    const matchesStatus = !status || (status === "enabled" ? node.enabled : !node.enabled);
    const matchesQuery = !query.trim() || nodeSearchText(node).includes(query.trim().toLowerCase());
    return (!region || node.region === region) && (!protocol || node.protocol === protocol) && (!sourceId || node.sourceId === sourceId) && matchesStatus && matchesQuery;
  });
  const selectedSet = new Set(selected);
  const visibleIds = filtered.map((node) => node.id);
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedSet.has(id));
  React.useEffect(() => { setSelected((ids) => ids.filter((id) => nodes.some((node) => node.id === id))); }, [nodes]);
  function toggleSelected(id: string) { setSelected((ids) => ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id]); }
  function toggleVisible() { setSelected((ids) => allVisibleSelected ? ids.filter((id) => !visibleIds.includes(id)) : Array.from(new Set([...ids, ...visibleIds]))); }
  async function bulk(enabled: boolean) { if (!selected.length) return; await api.bulkPatchNodes(selected, enabled); setSelected([]); reload(); }
  async function setTag(node: ProxyNode, value: string) {
    const tags = value.split(/[,，\s]+/).map((tag) => tag.trim()).filter(Boolean);
    await api.patchNode(node.id, { tags });
    reload();
  }
  return <section className="neo-card panel-section" id="nodes">
    <div className="section-head"><div className="section-title"><IconBox name="nodes" tone="inset" /><div><h2>节点</h2><p>筛选、探测并批量管理候选节点。</p></div></div><button className="btn secondary" type="button" onClick={() => api.probeNodes().then(reload)}><Icon name="refresh" />立即探测</button></div>
    <div className="neo-inset node-toolbar"><label className="field search-field"><span>搜索</span><div className="control-with-icon"><Icon name="search" /><input placeholder="名称、域名、IP、地区、标签" value={query} onChange={(e) => setQuery(e.target.value)} /></div></label><label className="field"><span>地区</span><select value={region} onChange={(e) => setRegion(e.target.value)}><option value="">全部地区</option>{regions.map((r) => <option key={r}>{r}</option>)}</select></label><label className="field"><span>协议</span><select value={protocol} onChange={(e) => setProtocol(e.target.value)}><option value="">全部协议</option>{protocols.map((r) => <option key={r}>{r}</option>)}</select></label><label className="field"><span>来源</span><select value={sourceId} onChange={(e) => setSourceId(e.target.value)}><option value="">全部来源</option>{sources.map((source) => <option key={source.id} value={source.id}>{source.name}</option>)}</select></label><label className="field"><span>状态</span><select value={status} onChange={(e) => setStatus(e.target.value)}><option value="">全部状态</option><option value="enabled">仅启用</option><option value="disabled">仅禁用</option></select></label></div>
    <div className="bulk-bar"><span>显示 <strong>{filtered.length}</strong> / {nodes.length} 个节点，已选 <strong>{selected.length}</strong> 个</span><button className="btn secondary sm" type="button" disabled={!selected.length} onClick={() => bulk(true)}>批量启用</button><button className="btn secondary sm" type="button" disabled={!selected.length} onClick={() => bulk(false)}>批量禁用</button><button className="btn ghost sm" type="button" disabled={!selected.length} onClick={() => setSelected([])}>清空选择</button></div>
    <div className="table-shell"><table><thead><tr><th><input type="checkbox" checked={allVisibleSelected} onChange={toggleVisible} /></th><th>名称</th><th>地区/IP</th><th>协议</th><th>来源</th><th>延迟</th><th>成功率</th><th>评分</th><th>状态</th></tr></thead><tbody>{filtered.map((node) => <tr key={node.id}><td><input type="checkbox" checked={selectedSet.has(node.id)} onChange={() => toggleSelected(node.id)} /></td><td><strong>{node.name}</strong><small>{node.host}:{node.port}</small><small>{node.tags.length ? `标签：${node.tags.join(" / ")}` : "无标签"}</small><details className="node-details"><summary>详情 / Raw</summary><div className="detail-actions"><label className="field">标签<input defaultValue={node.tags.join(", ")} onBlur={(e) => setTag(node, e.currentTarget.value)} placeholder="tag1, tag2" /></label>{node.shareUri && <CopyLink label="Share URI" hint="原始分享链接" url={node.shareUri} />}</div><pre>{JSON.stringify(node.raw, null, 2)}</pre></details></td><td>{node.region}<small>{node.ip ?? "-"}</small></td><td><StatusBadge tone="muted">{node.protocol}</StatusBadge></td><td>{sourceName[node.sourceId] ?? node.sourceId}</td><td>{node.lastLatencyMs != null ? `${node.lastLatencyMs}ms` : "-"}</td><td>{pct(node.successRate)}</td><td><strong>{node.score}</strong><small>{node.lastProbeAt ? `探测：${fmt(node.lastProbeAt)}` : "未探测"}</small></td><td><button className={node.enabled ? "btn secondary sm" : "btn ghost sm"} type="button" onClick={() => api.patchNode(node.id, { enabled: !node.enabled }).then(reload)}>{node.enabled ? "启用" : "禁用"}</button></td></tr>)}</tbody></table></div>
  </section>;
}

function CopyLink({ label, hint, url }: { label: string; hint: string; url: string }) {
  const [copied, setCopied] = React.useState(false);
  async function copy() { await navigator.clipboard.writeText(url); setCopied(true); window.setTimeout(() => setCopied(false), 1200); }
  return <div className="copy-row"><div className="copy-label"><IconBox name="link" tone="inset" /><label><strong>{label}</strong><small>{hint}</small></label></div><input readOnly value={url} onFocus={(e) => e.currentTarget.select()} /><button className="btn secondary sm" type="button" onClick={copy}><Icon name="copy" />{copied ? "已复制" : "复制"}</button></div>;
}

function previewOutput(profile: OutputProfile, nodes: ProxyNode[]): { total: number; enabled: number; protocols: string } {
  let result = nodes.filter((node) => node.enabled);
  if (profile.includeRegions.length) result = result.filter((node) => profile.includeRegions.includes(node.region));
  if (profile.includeSourceIds.length) result = result.filter((node) => profile.includeSourceIds.includes(node.sourceId));
  if (profile.includeTags.length) result = result.filter((node) => node.tags.some((tag) => profile.includeTags.includes(tag)));
  if (profile.includeProtocols.length) result = result.filter((node) => profile.includeProtocols.includes(node.protocol));
  const maxLatencyMs = profile.maxLatencyMs;
  const minSuccessRate = profile.minSuccessRate;
  if (maxLatencyMs != null) result = result.filter((node) => node.lastLatencyMs != null && node.lastLatencyMs <= maxLatencyMs);
  if (minSuccessRate != null) result = result.filter((node) => node.successRate >= minSuccessRate);
  const byFingerprint = new Map<string, ProxyNode>();
  for (const node of result) {
    const existing = byFingerprint.get(node.fingerprint);
    if (!existing || node.score > existing.score) byFingerprint.set(node.fingerprint, node);
  }
  result = Array.from(byFingerprint.values());
  const total = profile.limit != null ? Math.min(result.length, profile.limit) : result.length;
  const protocolCounts = result.slice(0, total).reduce<Record<string, number>>((acc, node) => { acc[node.protocol] = (acc[node.protocol] ?? 0) + 1; return acc; }, {});
  return { total, enabled: result.length, protocols: Object.entries(protocolCounts).map(([key, value]) => `${key}:${value}`).join(" / ") || "-" };
}

function Outputs({ outputs, sources, nodes, reload }: { outputs: OutputProfile[]; sources: SubscriptionSource[]; nodes: ProxyNode[]; reload: () => void }) {
  const [name, setName] = React.useState("Default");
  const regions = Array.from(new Set(nodes.map((node) => node.region))).sort();
  async function add(event: React.FormEvent) { event.preventDefault(); await api.createOutput({ name, enabled: true, format: "clash", includeRegions: [], includeSourceIds: [], includeTags: [], includeProtocols: [], maxLatencyMs: null, minSuccessRate: null, limit: null, sortStrategy: "score" }); reload(); }
  return <section className="neo-card panel-section" id="outputs">
    <div className="section-head"><div className="section-title"><IconBox name="settings" tone="inset" /><div><h2>输出配置</h2><p>为不同客户端生成稳定、可复制的订阅入口。</p></div></div><StatusBadge tone="info">{outputs.length} profiles</StatusBadge></div>
    <form className="neo-inset output-create" onSubmit={add}><label className="field"><span>配置名称</span><input value={name} onChange={(e) => setName(e.target.value)} /></label><button className="btn primary" type="submit"><Icon name="plus" />新建输出</button></form>
    <div className="output-list">{outputs.map((profile) => {
      const preview = previewOutput(profile, nodes);
      return <article className="output-card" key={profile.id}><div className="output-head"><div><strong>{profile.name}</strong><span>{profile.enabled ? "启用" : "禁用"} · {profile.sortStrategy} · {profile.format}</span></div><div className="preview-pill"><span>预计输出</span><strong>{preview.total}</strong><small>{preview.protocols}</small></div></div><div className="links"><CopyLink label="Clash / Mihomo" hint="推荐 Clash/Mihomo 客户端" url={`${baseUrl()}/sub/${profile.token}/clash`} /><CopyLink label="通用 URI" hint="全部支持协议分享链接" url={`${baseUrl()}/sub/${profile.token}/uris`} /><CopyLink label="Sing-box" hint="Sing-box JSON 配置" url={`${baseUrl()}/sub/${profile.token}/sing-box`} /><CopyLink label="Legacy VLESS" hint="兼容旧入口；实际同 URI 输出" url={`${baseUrl()}/sub/${profile.token}/vless`} /></div><div className="actions"><button className="btn secondary sm" type="button" onClick={() => api.patchOutput(profile.id, { rotateToken: true }).then(reload)}>轮换 token</button><button className="btn secondary sm" type="button" onClick={() => api.patchOutput(profile.id, { enabled: !profile.enabled }).then(reload)}>{profile.enabled ? "禁用" : "启用"}</button><button className="btn danger sm" type="button" onClick={() => api.deleteOutput(profile.id).then(reload)}>删除</button></div><ProfileFilters profile={profile} sources={sources} regions={regions} reload={reload} /></article>;
    })}</div>
  </section>;
}

function ProfileFilters({ profile, sources, regions, reload }: { profile: OutputProfile; sources: SubscriptionSource[]; regions: string[]; reload: () => void }) {
  function toggle<T>(list: T[], value: T): T[] { return list.includes(value) ? list.filter((item) => item !== value) : [...list, value]; }
  const updateNumber = (key: "maxLatencyMs" | "minSuccessRate" | "limit", value: string) => api.patchOutput(profile.id, { [key]: value === "" ? null : Number(value) }).then(reload);
  return <div className="filters"><label className="field">默认格式<select value={profile.format} onChange={(e) => api.patchOutput(profile.id, { format: e.target.value as OutputProfile["format"] }).then(reload)}><option value="clash">Clash</option><option value="uris">URI</option><option value="sing-box">Sing-box</option><option value="vless">Legacy VLESS</option></select></label><label className="field">排序<select value={profile.sortStrategy} onChange={(e) => api.patchOutput(profile.id, { sortStrategy: e.target.value as OutputProfile["sortStrategy"] }).then(reload)}><option value="score">评分</option><option value="latency">延迟</option><option value="successRate">成功率</option><option value="region">地区</option><option value="name">名称</option><option value="random">随机</option></select></label><label className="field">延迟上限(ms)<input type="number" min="1" value={profile.maxLatencyMs ?? ""} onChange={(e) => updateNumber("maxLatencyMs", e.target.value)} placeholder="不限" /></label><label className="field">成功率下限(0-1)<input type="number" min="0" max="1" step="0.05" value={profile.minSuccessRate ?? ""} onChange={(e) => updateNumber("minSuccessRate", e.target.value)} placeholder="不限" /></label><label className="field">节点数量上限<input type="number" min="1" value={profile.limit ?? ""} onChange={(e) => updateNumber("limit", e.target.value)} placeholder="不限" /></label><details><summary>协议过滤（空=全部）</summary>{PROTOCOLS.map((protocol) => <label key={protocol} className="check-row"><input type="checkbox" checked={profile.includeProtocols.includes(protocol)} onChange={() => api.patchOutput(profile.id, { includeProtocols: toggle(profile.includeProtocols, protocol) }).then(reload)} />{protocol}</label>)}</details><details><summary>地区过滤（空=全部）</summary>{regions.map((region) => <label key={region} className="check-row"><input type="checkbox" checked={profile.includeRegions.includes(region)} onChange={() => api.patchOutput(profile.id, { includeRegions: toggle(profile.includeRegions, region) }).then(reload)} />{region}</label>)}</details><details><summary>来源过滤（空=全部）</summary>{sources.map((source) => <label key={source.id} className="check-row"><input type="checkbox" checked={profile.includeSourceIds.includes(source.id)} onChange={() => api.patchOutput(profile.id, { includeSourceIds: toggle(profile.includeSourceIds, source.id) }).then(reload)} />{source.name}</label>)}</details></div>;
}

type Theme = "light" | "dark";
const THEME_KEY = "proxypanel.theme";

function initialTheme(): Theme {
  return localStorage.getItem(THEME_KEY) === "dark" ? "dark" : "light";
}

function App() {
  const [authed, setAuthed] = React.useState(Boolean(getToken()));
  const [stats, setStats] = React.useState<DashboardStats | null>(null);
  const [sources, setSources] = React.useState<SubscriptionSource[]>([]);
  const [nodes, setNodes] = React.useState<ProxyNode[]>([]);
  const [outputs, setOutputs] = React.useState<OutputProfile[]>([]);
  const [error, setError] = React.useState("");
  const [theme, setTheme] = React.useState<Theme>(initialTheme);
  React.useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem(THEME_KEY, theme);
  }, [theme]);
  const reload = React.useCallback(() => { if (!getToken()) return; Promise.all([api.dashboard(), api.sources(), api.nodes(), api.outputs()]).then(([stats, sources, nodes, outputs]) => { setStats(stats); setSources(sources); setNodes(nodes); setOutputs(outputs); setError(""); }).catch((err) => { setError(err instanceof Error ? err.message : String(err)); }); }, []);
  React.useEffect(() => { if (authed) reload(); }, [authed, reload]);
  if (!authed) return <Login onLogin={() => setAuthed(true)} />;
  return <main className="app-shell"><header className="app-header"><div className="brand"><IconBox name="shield" /><div><h1>ProxyPanel</h1><p>订阅整合、地区分类与节点优选</p></div></div><nav className="quick-nav"><a href="#sources">订阅源</a><a href="#nodes">节点</a><a href="#outputs">输出</a></nav><div className="header-actions"><button className="btn secondary" type="button" onClick={() => setTheme(theme === "light" ? "dark" : "light")}><Icon name={theme === "light" ? "moon" : "sun"} />{theme === "light" ? "暗色" : "浅色"}</button><button className="btn secondary" type="button" onClick={() => { setToken(null); setAuthed(false); }}><Icon name="logOut" />退出</button></div></header>{error && <div className="alert error banner"><Icon name="shield" />{error}</div>}<section className="stats"><StatCard icon="database" label="订阅源" value={`${stats?.enabledSourceCount ?? 0}/${stats?.sourceCount ?? 0}`} hint="enabled / total" /><StatCard icon="nodes" label="节点" value={`${stats?.enabledNodeCount ?? 0}/${stats?.nodeCount ?? 0}`} hint="enabled / total" /><StatCard icon="activity" label="可用节点" value={stats?.availableNodeCount ?? 0} hint="probe passed" /><StatCard icon="globe" label="最近探测" value={fmt(stats?.lastProbeAt)} /></section><Sources sources={sources} reload={reload} /><Nodes nodes={nodes} sources={sources} reload={reload} /><Outputs outputs={outputs} sources={sources} nodes={nodes} reload={reload} /></main>;
}

createRoot(document.getElementById("root")!).render(<App />);
