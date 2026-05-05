import React from "react";
import { createRoot } from "react-dom/client";
import type { DashboardStats, OutputProfile, ProxyNode, ProxyProtocol, SubscriptionSource } from "@proxypanel/shared";
import { api, getToken, setToken } from "./api.js";
import "./styles.css";

const PROTOCOLS: ProxyProtocol[] = ["vless", "vmess", "hysteria2", "tuic", "anytls", "trojan", "ss", "http", "socks5"];

type RefreshSummary = { sourceId: string; message: string; ok: boolean };

function fmt(value: string | null | undefined): string { return value ? new Date(value).toLocaleString() : "-"; }
function baseUrl(): string { return window.location.origin; }
function pct(value: number): string { return `${Math.round(value * 100)}%`; }

function StatCard({ label, value }: { label: string; value: React.ReactNode }) {
  return <div className="card stat"><span>{label}</span><strong>{value}</strong></div>;
}

function Login({ onLogin }: { onLogin: () => void }) {
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState("");
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setError("");
    try { const res = await api.login(password); setToken(res.token); onLogin(); } catch (err) { setError(err instanceof Error ? err.message : String(err)); }
  }
  return <main className="login"><form className="card login-card" onSubmit={submit}><h1>ProxyPanel</h1><p>输入管理员密码进入面板。</p><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Admin password" autoFocus /><button>登录</button>{error && <div className="error">{error}</div>}</form></main>;
}

function Sources({ sources, reload }: { sources: SubscriptionSource[]; reload: () => void }) {
  const [form, setForm] = React.useState({ name: "", url: "", type: "auto", refreshIntervalMinutes: 60 });
  const [busy, setBusy] = React.useState("");
  const [summary, setSummary] = React.useState<RefreshSummary | null>(null);
  async function add(event: React.FormEvent) {
    event.preventDefault(); setBusy("add");
    try { await api.createSource({ ...form, enabled: true } as Partial<SubscriptionSource>); setForm({ name: "", url: "", type: "auto", refreshIntervalMinutes: 60 }); reload(); } finally { setBusy(""); }
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
  return <section className="card"><div className="section-head"><h2>订阅源</h2></div><form className="grid-form" onSubmit={add}><input placeholder="名称" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /><input placeholder="vless://、混合分享文本或 Clash 订阅 URL" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} required /><select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}><option value="auto">自动识别</option><option value="vless">仅 VLESS</option><option value="clash">Clash</option></select><input type="number" min="5" value={form.refreshIntervalMinutes} onChange={(e) => setForm({ ...form, refreshIntervalMinutes: Number(e.target.value) })} /><button disabled={busy === "add"}>添加</button></form>{summary && <div className={summary.ok ? "notice" : "error"}>{summary.message}</div>}<div className="table-wrap"><table><thead><tr><th>名称</th><th>类型</th><th>状态</th><th>最近刷新</th><th>错误详情</th><th>操作</th></tr></thead><tbody>{sources.map((source) => <tr key={source.id}><td>{source.name}<small title={source.url}>{source.url}</small></td><td>{source.type}</td><td>{source.enabled ? "启用" : "禁用"}</td><td>{fmt(source.lastRefreshAt)}</td><td className="error-cell">{source.lastError ? <span title={source.lastError}>{source.lastError}</span> : "-"}</td><td><button disabled={busy === source.id} onClick={() => refresh(source)}>{busy === source.id ? "刷新中" : "刷新"}</button><button onClick={() => api.patchSource(source.id, { enabled: !source.enabled }).then(reload)}>{source.enabled ? "禁用" : "启用"}</button><button className="danger" onClick={() => api.deleteSource(source.id).then(reload)}>删除</button></td></tr>)}</tbody></table></div></section>;
}

function Nodes({ nodes, reload }: { nodes: ProxyNode[]; reload: () => void }) {
  const regions = Array.from(new Set(nodes.map((node) => node.region))).sort();
  const protocols = Array.from(new Set(nodes.map((node) => node.protocol))).sort();
  const [region, setRegion] = React.useState("");
  const [protocol, setProtocol] = React.useState("");
  const filtered = nodes.filter((node) => (!region || node.region === region) && (!protocol || node.protocol === protocol));
  return <section className="card"><div className="section-head"><h2>节点</h2><div><select value={region} onChange={(e) => setRegion(e.target.value)}><option value="">全部地区</option>{regions.map((r) => <option key={r}>{r}</option>)}</select><select value={protocol} onChange={(e) => setProtocol(e.target.value)}><option value="">全部协议</option>{protocols.map((r) => <option key={r}>{r}</option>)}</select><button onClick={() => api.probeNodes().then(reload)}>立即探测</button></div></div><div className="table-wrap"><table><thead><tr><th>名称</th><th>地区/IP</th><th>协议</th><th>延迟</th><th>成功率</th><th>评分</th><th>状态</th></tr></thead><tbody>{filtered.map((node) => <tr key={node.id}><td>{node.name}<small>{node.host}:{node.port}</small></td><td>{node.region}<small>{node.ip ?? "-"}</small></td><td>{node.protocol}</td><td>{node.lastLatencyMs ? `${node.lastLatencyMs}ms` : "-"}</td><td>{pct(node.successRate)}</td><td><strong>{node.score}</strong></td><td><button onClick={() => api.patchNode(node.id, { enabled: !node.enabled }).then(reload)}>{node.enabled ? "启用" : "禁用"}</button></td></tr>)}</tbody></table></div></section>;
}

function CopyLink({ label, hint, url }: { label: string; hint: string; url: string }) {
  const [copied, setCopied] = React.useState(false);
  async function copy() { await navigator.clipboard.writeText(url); setCopied(true); window.setTimeout(() => setCopied(false), 1200); }
  return <div className="link-row"><label><strong>{label}</strong><small>{hint}</small></label><input readOnly value={url} onFocus={(e) => e.currentTarget.select()} /><button onClick={copy}>{copied ? "已复制" : "复制"}</button></div>;
}

function Outputs({ outputs, sources, nodes, reload }: { outputs: OutputProfile[]; sources: SubscriptionSource[]; nodes: ProxyNode[]; reload: () => void }) {
  const [name, setName] = React.useState("Default");
  const regions = Array.from(new Set(nodes.map((node) => node.region))).sort();
  async function add(event: React.FormEvent) { event.preventDefault(); await api.createOutput({ name, enabled: true, format: "clash", includeRegions: [], includeSourceIds: [], includeTags: [], includeProtocols: [], maxLatencyMs: null, minSuccessRate: null, limit: null, sortStrategy: "score" }); reload(); }
  return <section className="card"><div className="section-head"><h2>输出配置</h2></div><form className="inline-form" onSubmit={add}><input value={name} onChange={(e) => setName(e.target.value)} /><button>新建输出</button></form><div className="output-list">{outputs.map((profile) => <div className="output" key={profile.id}><div><strong>{profile.name}</strong><span>{profile.enabled ? "启用" : "禁用"} · {profile.sortStrategy} · {profile.format}</span></div><div className="links"><CopyLink label="Clash / Mihomo" hint="推荐 Clash/Mihomo 客户端" url={`${baseUrl()}/sub/${profile.token}/clash`} /><CopyLink label="通用 URI" hint="全部支持协议分享链接" url={`${baseUrl()}/sub/${profile.token}/uris`} /><CopyLink label="Sing-box" hint="Sing-box JSON 配置" url={`${baseUrl()}/sub/${profile.token}/sing-box`} /><CopyLink label="Legacy VLESS" hint="兼容旧入口；实际同 URI 输出" url={`${baseUrl()}/sub/${profile.token}/vless`} /></div><div className="actions"><button onClick={() => api.patchOutput(profile.id, { rotateToken: true }).then(reload)}>轮换 token</button><button onClick={() => api.patchOutput(profile.id, { enabled: !profile.enabled }).then(reload)}>{profile.enabled ? "禁用" : "启用"}</button><button className="danger" onClick={() => api.deleteOutput(profile.id).then(reload)}>删除</button></div><ProfileFilters profile={profile} sources={sources} regions={regions} reload={reload} /></div>)}</div></section>;
}

function ProfileFilters({ profile, sources, regions, reload }: { profile: OutputProfile; sources: SubscriptionSource[]; regions: string[]; reload: () => void }) {
  function toggle<T>(list: T[], value: T): T[] { return list.includes(value) ? list.filter((item) => item !== value) : [...list, value]; }
  const updateNumber = (key: "maxLatencyMs" | "minSuccessRate" | "limit", value: string) => api.patchOutput(profile.id, { [key]: value === "" ? null : Number(value) }).then(reload);
  return <div className="filters"><label>默认格式 <select value={profile.format} onChange={(e) => api.patchOutput(profile.id, { format: e.target.value as OutputProfile["format"] }).then(reload)}><option value="clash">Clash</option><option value="uris">URI</option><option value="sing-box">Sing-box</option><option value="vless">Legacy VLESS</option></select></label><label>排序 <select value={profile.sortStrategy} onChange={(e) => api.patchOutput(profile.id, { sortStrategy: e.target.value as OutputProfile["sortStrategy"] }).then(reload)}><option value="score">评分</option><option value="latency">延迟</option><option value="successRate">成功率</option><option value="region">地区</option><option value="name">名称</option><option value="random">随机</option></select></label><label>延迟上限(ms)<input type="number" min="1" value={profile.maxLatencyMs ?? ""} onChange={(e) => updateNumber("maxLatencyMs", e.target.value)} placeholder="不限" /></label><label>成功率下限(0-1)<input type="number" min="0" max="1" step="0.05" value={profile.minSuccessRate ?? ""} onChange={(e) => updateNumber("minSuccessRate", e.target.value)} placeholder="不限" /></label><label>节点数量上限<input type="number" min="1" value={profile.limit ?? ""} onChange={(e) => updateNumber("limit", e.target.value)} placeholder="不限" /></label><details><summary>协议过滤（空=全部）</summary>{PROTOCOLS.map((protocol) => <label key={protocol}><input type="checkbox" checked={profile.includeProtocols.includes(protocol)} onChange={() => api.patchOutput(profile.id, { includeProtocols: toggle(profile.includeProtocols, protocol) }).then(reload)} />{protocol}</label>)}</details><details><summary>地区过滤（空=全部）</summary>{regions.map((region) => <label key={region}><input type="checkbox" checked={profile.includeRegions.includes(region)} onChange={() => api.patchOutput(profile.id, { includeRegions: toggle(profile.includeRegions, region) }).then(reload)} />{region}</label>)}</details><details><summary>来源过滤（空=全部）</summary>{sources.map((source) => <label key={source.id}><input type="checkbox" checked={profile.includeSourceIds.includes(source.id)} onChange={() => api.patchOutput(profile.id, { includeSourceIds: toggle(profile.includeSourceIds, source.id) }).then(reload)} />{source.name}</label>)}</details></div>;
}

function App() {
  const [authed, setAuthed] = React.useState(Boolean(getToken()));
  const [stats, setStats] = React.useState<DashboardStats | null>(null);
  const [sources, setSources] = React.useState<SubscriptionSource[]>([]);
  const [nodes, setNodes] = React.useState<ProxyNode[]>([]);
  const [outputs, setOutputs] = React.useState<OutputProfile[]>([]);
  const [error, setError] = React.useState("");
  const reload = React.useCallback(() => { if (!getToken()) return; Promise.all([api.dashboard(), api.sources(), api.nodes(), api.outputs()]).then(([stats, sources, nodes, outputs]) => { setStats(stats); setSources(sources); setNodes(nodes); setOutputs(outputs); setError(""); }).catch((err) => { setError(err instanceof Error ? err.message : String(err)); }); }, []);
  React.useEffect(() => { if (authed) reload(); }, [authed, reload]);
  if (!authed) return <Login onLogin={() => setAuthed(true)} />;
  return <main><header><div><h1>ProxyPanel</h1><p>订阅整合、地区分类与节点优选</p></div><button onClick={() => { setToken(null); setAuthed(false); }}>退出</button></header>{error && <div className="error banner">{error}</div>}<section className="stats"><StatCard label="订阅源" value={`${stats?.enabledSourceCount ?? 0}/${stats?.sourceCount ?? 0}`} /><StatCard label="节点" value={`${stats?.enabledNodeCount ?? 0}/${stats?.nodeCount ?? 0}`} /><StatCard label="可用节点" value={stats?.availableNodeCount ?? 0} /><StatCard label="最近探测" value={fmt(stats?.lastProbeAt)} /></section><Sources sources={sources} reload={reload} /><Nodes nodes={nodes} reload={reload} /><Outputs outputs={outputs} sources={sources} nodes={nodes} reload={reload} /></main>;
}

createRoot(document.getElementById("root")!).render(<App />);
