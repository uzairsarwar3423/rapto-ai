/**
 * A real HTTP server standing in for BOTH upstreams the BFF talks to:
 *   - Express  GET /api/v1/auth/me         (resolves the caller)
 *   - AI svc   /chat/*                      (records what it receives; behaviour is injected per test)
 * Real sockets mean abort propagation and incremental delivery are observed for real, not asserted on a stub.
 */
import http from "node:http";
import type { AddressInfo } from "node:net";
import { generateKeyPairSync, createVerify, type KeyObject } from "node:crypto";

export interface RecordedRequest {
  method: string;
  url: string;
  headers: http.IncomingHttpHeaders;
  body: string;
}

export interface MockUser {
  id: string;
  teamId: string | null;
  role?: string;
  timezone?: string;
  name?: string;
  team?: { id: string; plan: string } | null;
}

export type ChatHandler = (req: http.IncomingMessage, res: http.ServerResponse, rec: RecordedRequest) => void | Promise<void>;

export class MockUpstream {
  server!: http.Server;
  baseUrl = "";
  chatCalls: RecordedRequest[] = [];
  meCalls = 0;
  users = new Map<string, MockUser | "down">();
  chatHandler: ChatHandler = (_req, res) => {
    res.writeHead(204).end();
  };
  /** Set when a client socket closes before the response ended (the abort signal we care about). */
  closedEarly: Array<() => void> = [];

  readonly keys = generateKeyPairSync("rsa", { modulusLength: 2048 });

  get privateKeyPem(): string {
    return this.keys.privateKey.export({ type: "pkcs8", format: "pem" }).toString();
  }
  get publicKey(): KeyObject {
    return this.keys.publicKey;
  }

  async start(): Promise<void> {
    this.server = http.createServer(async (req, res) => {
      const chunks: Buffer[] = [];
      for await (const c of req) chunks.push(c as Buffer);
      const rec: RecordedRequest = { method: req.method ?? "", url: req.url ?? "", headers: req.headers, body: Buffer.concat(chunks).toString("utf8") };

      if (rec.url === "/api/v1/auth/me") {
        this.meCalls++;
        const token = String(req.headers.authorization ?? "").replace(/^Bearer /i, "");
        const user = this.users.get(token);
        if (user === "down") return void res.writeHead(500).end();
        if (!user) return void res.writeHead(401, { "content-type": "application/json" }).end(JSON.stringify({ success: false }));
        res.writeHead(200, { "content-type": "application/json" });
        return void res.end(JSON.stringify({ success: true, data: { user } }));
      }

      this.chatCalls.push(rec);
      await this.chatHandler(req, res, rec);
    });
    await new Promise<void>((r) => this.server.listen(0, "127.0.0.1", r));
    this.baseUrl = `http://127.0.0.1:${(this.server.address() as AddressInfo).port}`;
  }

  async stop(): Promise<void> {
    this.server.closeAllConnections();
    await new Promise<void>((r) => this.server.close(() => r()));
  }

  reset(): void {
    this.chatCalls = [];
    this.meCalls = 0;
    this.chatHandler = (_req, res) => {
      res.writeHead(204).end();
    };
  }

  /** Verify an RS256 service JWT against the test public key; returns header + claims. */
  verifyToken(authorization: string | undefined): { header: Record<string, unknown>; claims: Record<string, unknown> } {
    const token = String(authorization ?? "").replace(/^Bearer /, "");
    const [h, p, s] = token.split(".");
    const ok = createVerify("RSA-SHA256").update(`${h}.${p}`).verify(this.publicKey, Buffer.from(s, "base64url"));
    if (!ok) throw new Error("service JWT signature invalid");
    return {
      header: JSON.parse(Buffer.from(h, "base64url").toString()),
      claims: JSON.parse(Buffer.from(p, "base64url").toString()),
    };
  }
}

export const GOOD_USER: MockUser = {
  id: "user_1",
  teamId: "team_1",
  role: "MEMBER",
  timezone: "Asia/Karachi",
  name: "Ayesha",
  team: { id: "team_1", plan: "GROWTH" },
};

export function sseHeaders(): http.OutgoingHttpHeaders {
  return { "content-type": "text/event-stream", "cache-control": "no-cache, no-transform" };
}
