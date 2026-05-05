import path from "node:path";

export interface AppConfig {
  adminPassword: string;
  sessionSecret: string;
  databasePath: string;
  geoipDbPath: string;
  host: string;
  port: number;
  corsOrigin: string;
  subscriptionRefreshMinutes: number;
  probeIntervalMinutes: number;
  probeTimeoutMs: number;
  webDistPath: string;
}

export function loadConfig(): AppConfig {
  const root = process.cwd();
  return {
    adminPassword: process.env.ADMIN_PASSWORD ?? "change-me-now",
    sessionSecret: process.env.SESSION_SECRET ?? "dev-secret-change-me",
    databasePath: process.env.DATABASE_PATH ?? path.resolve(root, "data", "proxypanel.db"),
    geoipDbPath: process.env.GEOIP_DB_PATH ?? path.resolve(root, "data", "geoip.json"),
    host: process.env.HOST ?? "0.0.0.0",
    port: Number(process.env.PORT ?? 8080),
    corsOrigin: process.env.CORS_ORIGIN ?? "http://localhost:5173",
    subscriptionRefreshMinutes: Number(process.env.SUBSCRIPTION_REFRESH_MINUTES ?? 60),
    probeIntervalMinutes: Number(process.env.PROBE_INTERVAL_MINUTES ?? 30),
    probeTimeoutMs: Number(process.env.PROBE_TIMEOUT_MS ?? 4000),
    webDistPath: process.env.WEB_DIST_PATH ?? path.resolve(root, "apps", "web", "dist")
  };
}
