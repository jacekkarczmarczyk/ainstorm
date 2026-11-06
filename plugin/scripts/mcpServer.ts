import { createInterface } from 'node:readline';
import type { Readable, Writable } from 'node:stream';
import type { Api } from './lib.ts';

/**
 * A minimal MCP server over stdio (newline-delimited JSON-RPC 2.0): initialize, ping, tools/list, tools/call.
 * The tools live in the daemon; this only forwards, so it needs nothing outside Node itself.
 */

const SUPPORTED_VERSIONS = ['2025-06-18', '2025-03-26', '2024-11-05'];

interface Request {
  jsonrpc: '2.0';
  id?: number | string;
  method: string;
  params?: Record<string, unknown>;
}

export interface McpOptions {
  api: Api;
  sessionId: string;
  instructions: string;
  /** Starts the daemon when it does not answer; true once it runs */
  ensureDaemon(): Promise<boolean>;
}

export class RpcError extends Error {
  readonly code: number;
  constructor(code: number, message: string) {
    super(message);
    this.code = code;
  }
}

const UNAVAILABLE = 'The ainstorm map service is not available right now. Continue the work without the map.';
// What fetch throws when nothing listens on the port (a timeout is another error: a hung daemon is not restarted)
const REFUSED = 'fetch failed';

/** A call that finds the daemon down (gone or restarted during the session) starts it and tries once more. */
async function call<T>(options: McpOptions, send: () => Promise<T>): Promise<T> {
  try {
    return await send();
  } catch (error) {
    if (!(error instanceof Error && error.message === REFUSED) || !await options.ensureDaemon()) throw error;
    return send();
  }
}

export async function handle(options: McpOptions, request: Request): Promise<unknown> {
  switch (request.method) {
    case 'initialize': {
      const requested = String(request.params?.protocolVersion ?? '');
      return {
        protocolVersion: SUPPORTED_VERSIONS.includes(requested) ? requested : SUPPORTED_VERSIONS[0],
        capabilities: { tools: {} },
        serverInfo: { name: 'ainstorm', version: '0.1.0' },
        instructions: options.instructions,
      };
    }
    case 'ping':
      return {};
    case 'tools/list':
      try {
        return await call(options, () => options.api('GET', '/api/mcp/tools'));
      } catch {
        return { tools: [] };
      }
    case 'tools/call': {
      const name = String(request.params?.name ?? '');
      if (!/^[a-z_]{1,40}$/.test(name)) throw new RpcError(-32602, `Unknown tool ${name}`);
      try {
        const result = await call(options, () => options.api<{ text: string; isError: boolean }>('POST', `/api/sessions/${options.sessionId}/tools/${name}`, request.params?.arguments ?? {}));
        return { content: [{ type: 'text', text: result.text }], isError: result.isError };
      } catch (error) {
        return { content: [{ type: 'text', text: error instanceof Error && error.message !== REFUSED ? error.message : UNAVAILABLE }], isError: true };
      }
    }
    default:
      throw new RpcError(-32601, `Method not found: ${request.method}`);
  }
}

export function serve(options: McpOptions, input: Readable, output: Writable): Promise<void> {
  const write = (message: unknown) => output.write(`${JSON.stringify(message)}\n`);
  const lines = createInterface({ input, crlfDelay: Infinity });
  lines.on('line', line => {
    if (!line.trim()) return;
    let request: Request;
    try {
      request = JSON.parse(line) as Request;
    } catch {
      write({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } });
      return;
    }
    // Notifications (no id), e.g. notifications/initialized, need no answer
    if (request.id === undefined) return;
    handle(options, request).then(
      result => write({ jsonrpc: '2.0', id: request.id, result }),
      (error: unknown) => write({
        jsonrpc: '2.0', id: request.id,
        error: { code: error instanceof RpcError ? error.code : -32603, message: error instanceof Error ? error.message : String(error) },
      }),
    );
  });
  return new Promise(resolve => lines.on('close', resolve));
}
