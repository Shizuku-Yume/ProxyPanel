# ProxyPanel

个人自用的 VLESS / Clash 订阅统一管理面板：订阅源管理、节点地区分类、TCP/TLS 探测评分，以及 Clash/VLESS 整合订阅输出。

## 本地开发

```powershell
npm install
Copy-Item .env.example .env
npm run dev
```

- API: http://localhost:8080
- Web: http://localhost:5173
- 默认密码来自 `.env` 的 `ADMIN_PASSWORD`。

## VPS 部署

```bash
cp .env.example .env
# 修改 ADMIN_PASSWORD 和 SESSION_SECRET
docker compose up -d --build
```

部署后访问 `http://服务器IP:8080`。

## 功能说明

- 添加订阅源：支持直接填入或粘贴聚合文本中的 `vless://`、`vmess://`、`hysteria2://`/`hy2://`、`tuic://`、`anytls://` 等分享链接，也支持 Clash/Mihomo YAML 订阅 URL。
- 节点分类：后端会解析域名到 IPv4，优先使用内置 GeoIP 数据标记国家/州/城市，并以 `data/geoip.json` 的本地 CIDR 数据库作为兜底。
- 节点探测：首版执行 TCP connect 或 TLS handshake，记录延迟、成功率、连续失败次数并生成评分。
- 输出订阅：后台创建输出配置后复制：
  - `/sub/:token/clash`
  - `/sub/:token/vless`（兼容旧入口，实际返回所有支持协议的分享链接列表）
  - `/sub/:token/uris`（分享链接列表）

## 后续扩展点

`apps/api/src/probe.ts` 中的 `ProbeProvider` 可扩展为完整代理测速，例如通过实际 VLESS/Clash 节点访问指定测试 URL 后再更新评分。
