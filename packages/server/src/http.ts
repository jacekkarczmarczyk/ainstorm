import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { extname, join, normalize, sep } from 'node:path';
import { z, ZodError } from 'zod';
import { EngineError, type Daemon } from './daemon.ts';
import { callTool, toolDefinitions } from './mcpTools.ts';
import { allowedHost, allowedOrigin, bearer, COOKIE, readCookie, sameSecret, SECURITY_HEADERS, UiSessions } from './security.ts';

export interface HttpOptions {
  daemon: Daemon;
  token: string;
  /** Built web UI (packages/web/dist); null serves the API only */
  staticDir: string | null;
  sessions?: UiSessions;
}

const MAX_BODY = 1024 * 1024;
const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.woff': 'font/woff', '.json': 'application/json',
};

class HttpError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

type Caller = 'token' | 'ui';

// Plain pages for the one-time link; no scripts (CSP), the code is hex so it needs no escaping
const page = (body: string) => `<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>ainstorm</title><style>body{font:16px system-ui,sans-serif;display:grid;place-items:center;min-height:90vh;margin:0;background:#f2f4f8;color:#141a24}
main{text-align:center;display:grid;gap:12px}button{font:inherit;font-weight:600;padding:10px 22px;border-radius:8px;border:0;background:#2c56c9;color:#fff;cursor:pointer}
@media (prefers-color-scheme:dark){body{background:#0f131a;color:#e4e9f1}button{background:#7f9cff;color:#10131a}}</style></head><body><main>${body}</main></body></html>`;
const openPage = (code: string) => page(`<h1>ainstorm</h1><form method="post" action="/open"><input type="hidden" name="code" value="${code.replace(/[^0-9a-f]/g, '')}"><button type="submit" autofocus>Open the map</button></form>`);
const EXPIRED_PAGE = page('<h1>This link is used or expired</h1><p>Run <code>/ainstorm:open</code> again in a Claude Code session.</p>');

function sendHtml(res: ServerResponse, status: number, html: string) {
  res.writeHead(status, { ...SECURITY_HEADERS, 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(html);
}

const ChangeBody = z.object({ command: z.unknown(), changeId: z.number().int().positive().optional() });
const PromptBody = z.object({ prompt: z.string().max(200_000) });

/**
 * HTTP API, SSE and the static UI. Every request passes the Host check; API calls need either the bearer
 * token (plugin, hooks, MCP proxy) or the UI cookie plus a same-origin Origin header for changes.
 */
export function createHttpServer(options: HttpOptions): Server {
  const sessions = options.sessions ?? new UiSessions();
  let port = 0;

  const send = (res: ServerResponse, status: number, body: unknown) => {
    res.writeHead(status, { ...SECURITY_HEADERS, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(body));
  };

  async function readJson(req: IncomingMessage): Promise<unknown> {
    if (!(req.headers['content-type'] ?? '').startsWith('application/json')) throw new HttpError(415, 'JSON body expected');
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of req as AsyncIterable<Buffer>) {
      size += chunk.length;
      if (size > MAX_BODY) throw new HttpError(413, 'Body too large');
      chunks.push(chunk);
    }
    try {
      return JSON.parse(Buffer.concat(chunks).toString('utf8') || 'null');
    } catch {
      throw new HttpError(400, 'Invalid JSON');
    }
  }

  /** The code from the form of the open page (application/x-www-form-urlencoded). */
  async function readCode(req: IncomingMessage): Promise<string> {
    if (!(req.headers['content-type'] ?? '').startsWith('application/x-www-form-urlencoded')) throw new HttpError(415, 'Form body expected');
    let body = '';
    for await (const chunk of req as AsyncIterable<Buffer>) {
      body += chunk.toString('utf8');
      if (body.length > 1000) throw new HttpError(413, 'Body too large');
    }
    return new URLSearchParams(body).get('code') ?? '';
  }

  function authenticate(req: IncomingMessage): Caller {
    const token = bearer(req.headers.authorization);
    if (token !== null && sameSecret(token, options.token)) return 'token';
    if (sessions.valid(readCookie(req.headers.cookie, COOKIE))) {
      // Browsers send Origin on POST; a UI change from another site (CSRF) is refused even with the cookie
      if (req.method !== 'GET' && !allowedOrigin(req.headers.origin, port)) throw new HttpError(403, 'Foreign origin');
      return 'ui';
    }
    throw new HttpError(401, 'Not authenticated');
  }

  function serveEvents(req: IncomingMessage, res: ServerResponse) {
    res.writeHead(200, { ...SECURITY_HEADERS, 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' });
    const push = (snapshot: unknown) => res.write(`event: snapshot\ndata: ${JSON.stringify(snapshot)}\n\n`);
    push(options.daemon.snapshot());
    const unsubscribe = options.daemon.subscribe(push);
    const ping = setInterval(() => res.write(': ping\n\n'), 25_000);
    req.on('close', () => {
      clearInterval(ping);
      unsubscribe();
    });
  }

  function serveStatic(pathname: string, res: ServerResponse) {
    const root = options.staticDir;
    if (root === null) throw new HttpError(404, 'Not found');
    // Paths are resolved inside the static root only; anything else falls back to the SPA entry
    let decoded: string;
    try {
      decoded = decodeURIComponent(pathname);
    } catch {
      throw new HttpError(400, 'Malformed path');
    }
    const candidate = normalize(join(root, decoded));
    const inside = candidate.startsWith(root.endsWith(sep) ? root : root + sep);
    const file = inside && existsSync(candidate) && statSync(candidate).isFile() ? candidate : join(root, 'index.html');
    if (!existsSync(file)) throw new HttpError(404, 'Not found');
    const immutable = file.includes(`${sep}assets${sep}`);
    res.writeHead(200, {
      ...SECURITY_HEADERS, 'Content-Type': MIME[extname(file)] ?? 'application/octet-stream',
      'Cache-Control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
    });
    createReadStream(file).pipe(res);
  }

  async function route(req: IncomingMessage, res: ServerResponse) {
    if (!allowedHost(req.headers.host, port)) throw new HttpError(403, 'Host not allowed');
    const url = new URL(req.url ?? '/', `http://127.0.0.1:${port}`);
    const { pathname } = url;
    const method = req.method ?? 'GET';

    if (pathname === '/health' && method === 'GET') return send(res, 200, { name: 'ainstorm', ok: true });

    // One-time link from the plugin. Opening it only shows a button: browsers prefetch links (address bar, hover),
    // and a prefetch must not use the code. The button posts it back; only that sets the UI cookie.
    if (pathname === '/open' && method === 'GET') {
      const code = url.searchParams.get('code') ?? '';
      return sendHtml(res, sessions.usable(code) ? 200 : 403, sessions.usable(code) ? openPage(code) : EXPIRED_PAGE);
    }
    if (pathname === '/open' && method === 'POST') {
      if (!allowedOrigin(req.headers.origin, port)) throw new HttpError(403, 'Foreign origin');
      const session = sessions.redeem(await readCode(req));
      if (session === null) return sendHtml(res, 403, EXPIRED_PAGE);
      res.writeHead(303, {
        ...SECURITY_HEADERS, Location: '/', 'Cache-Control': 'no-store',
        'Set-Cookie': `${COOKIE}=${session}; HttpOnly; SameSite=Strict; Path=/`,
      });
      return res.end();
    }

    if (pathname === '/events' && method === 'GET') {
      authenticate(req);
      return serveEvents(req, res);
    }

    if (pathname.startsWith('/api/')) {
      const caller = authenticate(req);
      if (pathname === '/api/snapshot' && method === 'GET') return send(res, 200, options.daemon.snapshot());
      if (pathname === '/api/mcp/tools' && method === 'GET') {
        if (caller !== 'token') throw new HttpError(403, 'Only Claude sessions can call this');
        return send(res, 200, { tools: toolDefinitions() });
      }
      // Calls of Claude sessions (MCP proxy and hooks): token only, never the UI
      const session = /^\/api\/sessions\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/(ops|context|deliveries|prompt|tools\/[a-z_]{1,40})$/.exec(pathname);
      if (session) {
        if (caller !== 'token') throw new HttpError(403, 'Only Claude sessions can call this');
        const [, sessionId, action] = session as unknown as [string, string, string];
        if (action.startsWith('tools/')) {
          if (method !== 'POST') throw new HttpError(405, 'Method not allowed');
          return send(res, 200, callTool(options.daemon, sessionId, action.slice('tools/'.length), await readJson(req)));
        }
        if (action === 'context') {
          if (method !== 'GET') throw new HttpError(405, 'Method not allowed');
          return send(res, 200, { context: options.daemon.context(sessionId) });
        }
        if (method !== 'POST') throw new HttpError(405, 'Method not allowed');
        if (action === 'ops') return send(res, 200, options.daemon.sessionOp(sessionId, await readJson(req)));
        if (action === 'deliveries') return send(res, 200, { context: options.daemon.takeDeliveries(sessionId) });
        const { prompt } = PromptBody.parse(await readJson(req));
        return send(res, 200, { block: options.daemon.checkPrompt(sessionId, prompt) });
      }
      if (method !== 'POST') throw new HttpError(405, 'Method not allowed');
      if (pathname === '/api/open-link') {
        if (caller !== 'token') throw new HttpError(403, 'Only the plugin can issue links');
        return send(res, 200, { url: `http://127.0.0.1:${port}/open?code=${sessions.issueCode()}` });
      }
      if (pathname === '/api/reserve') return send(res, 200, { changeId: options.daemon.reserveChangeId() });
      if (pathname === '/api/commands') {
        const body = ChangeBody.parse(await readJson(req));
        return send(res, 200, { changeId: options.daemon.execute(body.command, body.changeId).changeId });
      }
      const change = /^\/api\/changes\/(\d{1,12})\/(revert|copied)$/.exec(pathname);
      if (change) {
        const id = Number(change[1]);
        if (change[2] === 'revert') options.daemon.revert(id);
        else options.daemon.markCopied(id);
        return send(res, 200, { ok: true });
      }
      throw new HttpError(404, 'Not found');
    }

    if (method !== 'GET') throw new HttpError(405, 'Method not allowed');
    return serveStatic(pathname, res);
  }

  const server = createServer((req, res) => {
    route(req, res).catch((error: unknown) => {
      const status = error instanceof HttpError ? error.status
        : error instanceof ZodError ? 400
          : error instanceof EngineError ? (error.code === 'not_found' ? 404 : 409)
            : 500;
      // Internal errors are not described to the client
      const message = status === 500 ? 'Internal error' : error instanceof ZodError ? 'Invalid input' : (error as Error).message;
      if (status === 500) console.error(error);
      if (!res.headersSent) send(res, status, { error: message });
      else res.end();
    });
  });
  server.on('listening', () => {
    const address = server.address();
    port = typeof address === 'object' && address ? address.port : 0;
  });
  return server;
}
