# ProxyPanel Handover

## 项目概况

ProxyPanel 是一个 TypeScript 全栈订阅管理面板，工作区位于：

`F:\UserData\Codex\ProxyPanel`

GitHub 仓库：

https://github.com/Shizuku-Yume/ProxyPanel

当前主分支：`main`

最近提交：

- `fd907d5 Support mixed proxy share protocols`
- `5a02348 Fix empty-body API actions`
- `ebc8195 Initial ProxyPanel implementation`

## 技术栈

- Monorepo：npm workspaces
- Backend：Node.js 24 + TypeScript + Fastify
- Frontend：React + Vite
- Storage：Node 内置 `node:sqlite`
- GeoIP：`geoip-lite` + `data/geoip.json` 兜底 CIDR
- Deploy：Dockerfile + docker-compose

目录结构：

- `apps/api`：后端 API、SQLite store、订阅刷新、探测、GeoIP、订阅导出
- `apps/web`：前端管理面板
- `packages/shared`：共享类型、订阅解析、Clash/VLESS/URI 导出逻辑
- `data/geoip.json`：简易 CIDR 兜底地区库

## 当前已实现功能

### 管理面板

- 管理员密码登录
- 仪表盘：订阅源、节点、可用节点、最近探测
- 订阅源管理：添加、刷新、禁用/启用、删除
- 节点列表：地区/IP、协议、延迟、成功率、评分、启用/禁用
- 输出配置：生成 token 订阅链接、轮换 token、过滤地区/来源、排序

### 后端 API

管理 API：

- `POST /api/login`
- `GET /api/dashboard`
- `GET /api/sources`
- `POST /api/sources`
- `PATCH /api/sources/:id`
- `DELETE /api/sources/:id`
- `POST /api/sources/:id/refresh`
- `GET /api/nodes`
- `PATCH /api/nodes/:id`
- `POST /api/nodes/probe`
- `GET /api/output-profiles`
- `POST /api/output-profiles`
- `PATCH /api/output-profiles/:id`
- `DELETE /api/output-profiles/:id`

订阅输出：

- `GET /sub/:token/clash`：Clash/Mihomo YAML
- `GET /sub/:token/vless`：兼容旧入口，实际返回所有支持协议分享链接列表
- `GET /sub/:token/uris`：所有支持协议分享链接列表

## 协议解析现状

核心解析文件：

- `packages/shared/src/uri.ts`
- `packages/shared/src/vless.ts`
- `packages/shared/src/clash.ts`

目前支持：

- `vless://`
- `vmess://`
- `hysteria2://`
- `hy2://`
- `tuic://` / tuic5
- `anytls://`
- `trojan://`
- `ss://` 基础抽取
- Clash/Mihomo YAML 中的 `proxies`

支持混合聚合文本，例如一段文本中同时包含：

```text
vl-reality-proxy vmess://... hysteria2://... tuic://... anytls://...
```

相关测试：

- `packages/shared/src/__tests__/uri.test.ts`
- `apps/api/src/__tests__/app.test.ts`

用户提供的聚合样例已做回归，解析结果应为：

```text
anytls, hysteria2, tuic, vmess
```

## 地区解析现状

核心文件：

- `apps/api/src/geoip.ts`

逻辑：

1. 解析 host 到 IPv4。
2. 私网 IP 标记为 `Private`。
3. 优先用 `geoip-lite` 得到国家 / 州 / 城市。
4. 如果 `geoip-lite` 无结果，再用 `data/geoip.json` CIDR 兜底。

已验证用户样例域名：

```text
gcpproxy.shizukuyume.dpdns.org -> 35.212.175.229 -> United States / CA / Mountain View
```

## 已知注意事项

- 项目使用 Node 24 的 `node:sqlite`，运行测试或服务时会出现 ExperimentalWarning，当前不影响功能。
- `geoip-lite` 数据并非实时精确，地区只能作为近似结果；如需更准，后续可接 MaxMind GeoLite2 mmdb。
- `/sub/:token/vless` 名称历史上只表示 VLESS，但当前为了兼容客户端和旧入口，返回所有 share URI。更推荐后续在 UI 中显示 `/sub/:token/uris`。
- 探测目前只做 TCP/TLS handshake，不做完整代理链路测速；UDP 类协议如 hysteria2/tuic 的真实质量还不能准确测出。
- 用户曾在聊天里粘贴过 GitLab private_token；没有写入仓库。建议用户轮换该 token。

## 本地开发命令

```powershell
npm install
Copy-Item .env.example .env
npm run dev
```

API：

```text
http://localhost:8080
```

Web：

```text
http://localhost:5173
```

## 验证命令

每次修改后建议运行：

```powershell
npm run typecheck
npm test
npm run build
```

最近一次完整验证已通过。

## 部署

```bash
cp .env.example .env
# 修改 ADMIN_PASSWORD 和 SESSION_SECRET
docker compose up -d --build
```

访问：

```text
http://服务器IP:8080
```

## 下一步建议

优先级较高：

1. 前端输出配置中把 `/sub/:token/uris` 显示出来，避免用户误解 `/vless` 只返回 VLESS。
2. 增强 Clash/Mihomo 导出字段，尤其是 hysteria2、tuic、anytls 在不同客户端中的兼容性。
3. 用 MaxMind GeoLite2 或可配置 GeoIP provider 替换/增强 `geoip-lite`。
4. 增加“订阅刷新错误详情”在前端的可读提示，避免静默失败。
5. 增加完整代理测速插件接口实现，尤其是 UDP/QUIC 协议。

如果继续处理用户反馈，建议先复现用户提供的具体订阅源，再补测试，最后修复。
