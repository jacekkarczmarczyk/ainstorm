import type { Server } from 'node:http';
import { HOST } from './config.ts';

export { defaultPaths, DEFAULT_PORT, HOST, loadConfig } from './config.ts';
export { Daemon } from './daemon.ts';
export { openDatabase } from './db.ts';
export { createHttpServer } from './http.ts';
export { callTool, toolDefinitions } from './mcpTools.ts';
export { loadSnapshot, saveSnapshot } from './store.ts';

/** Listen on the loopback address only, and refuse to run if the socket ended up anywhere else. */
export async function listenLoopback(server: Server, port: number): Promise<number> {
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, HOST, () => resolve());
  });
  const address = server.address();
  if (typeof address !== 'object' || address === null || address.address !== HOST) {
    server.close();
    throw new Error(`Refusing to run: bound to ${JSON.stringify(address)} instead of ${HOST}`);
  }
  return address.port;
}
