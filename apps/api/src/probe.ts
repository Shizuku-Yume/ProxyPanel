import net from "node:net";
import tls from "node:tls";
import type { ProxyNode } from "@proxypanel/shared";

export interface ProbeOutcome { success: boolean; latencyMs: number | null; error: string | null }
export interface ProbeProvider { probe(node: ProxyNode): Promise<ProbeOutcome> }

function isTlsLike(node: ProxyNode): boolean {
  return node.port === 443 || node.raw.security === "tls" || node.raw.security === "reality" || node.raw.tls === true;
}

export class TcpTlsProbeProvider implements ProbeProvider {
  constructor(private readonly timeoutMs = 4000) {}

  async probe(node: ProxyNode): Promise<ProbeOutcome> {
    const started = performance.now();
    if (isTlsLike(node)) return this.tlsProbe(node, started);
    return this.tcpProbe(node, started);
  }

  private tcpProbe(node: ProxyNode, started: number): Promise<ProbeOutcome> {
    return new Promise((resolve) => {
      const socket = net.createConnection({ host: node.host, port: node.port });
      const finish = (outcome: ProbeOutcome) => { socket.destroy(); resolve(outcome); };
      socket.setTimeout(this.timeoutMs);
      socket.once("connect", () => finish({ success: true, latencyMs: Math.round(performance.now() - started), error: null }));
      socket.once("timeout", () => finish({ success: false, latencyMs: null, error: "TCP timeout" }));
      socket.once("error", (error) => finish({ success: false, latencyMs: null, error: error.message }));
    });
  }

  private tlsProbe(node: ProxyNode, started: number): Promise<ProbeOutcome> {
    return new Promise((resolve) => {
      const servername = String(node.raw.sni ?? node.raw.servername ?? node.host);
      const socket = tls.connect({ host: node.host, port: node.port, servername, rejectUnauthorized: false });
      const finish = (outcome: ProbeOutcome) => { socket.destroy(); resolve(outcome); };
      socket.setTimeout(this.timeoutMs);
      socket.once("secureConnect", () => finish({ success: true, latencyMs: Math.round(performance.now() - started), error: null }));
      socket.once("timeout", () => finish({ success: false, latencyMs: null, error: "TLS timeout" }));
      socket.once("error", (error) => finish({ success: false, latencyMs: null, error: error.message }));
    });
  }
}
