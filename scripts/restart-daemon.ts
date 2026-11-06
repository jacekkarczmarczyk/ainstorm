// pnpm daemon:restart — stops the running ainstorm daemon and starts it again with the current code.
// For work on ainstorm itself. Uses the plugin's own start-up (the entry point the daemon recorded in ~/.ainstorm).
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { styleText } from 'node:util';
import { createApi, DIR, ensureDaemon, healthy, PORT, readJsonFile } from '../plugin/scripts/lib.ts';

const ok = (text: string) => console.log(styleText('green', text));
const note = (text: string) => console.log(styleText('yellow', text));
const fail = (text: string): never => { console.log(styleText('red', text)); process.exit(1); };

/** The process listening on the daemon's port; the pid the daemon recorded when the system tools give none */
function daemonPid(): number | null {
  try {
    const output = process.platform === 'win32'
      ? execFileSync('netstat', ['-ano', '-p', 'TCP'], { encoding: 'utf8' })
        .split('\n').find(line => line.includes(`127.0.0.1:${PORT} `) && line.includes('LISTENING'))?.trim().split(/\s+/).at(-1)
      : execFileSync('lsof', ['-nP', `-iTCP:${PORT}`, '-sTCP:LISTEN', '-t'], { encoding: 'utf8' }).trim().split('\n')[0];
    if (output && /^\d+$/.test(output)) return Number(output);
  } catch {
    // No such tool here: fall back to the recorded pid
  }
  return readJsonFile<{ pid?: number }>(join(DIR, 'daemon.json'))?.pid ?? null;
}

// The tools a session sees are listed once, when it starts: a change needs /reload-plugins
const tools = () => createApi()<unknown>('GET', '/api/mcp/tools').then(JSON.stringify, () => null);

const wasRunning = await healthy();
const before = wasRunning ? await tools() : null;
if (wasRunning) {
  const pid = daemonPid() ?? fail(`Could not find the process on port ${PORT}. Stop it by hand, then run pnpm daemon:restart again.`);
  process.kill(pid);
  for (let i = 0; i < 25 && await healthy(); i++) await new Promise(resolve => setTimeout(resolve, 200));
  if (await healthy()) fail(`The daemon (pid ${pid}) did not stop.`);
}

if (!await ensureDaemon()) fail('The daemon did not start. Run it in the foreground to see why: pnpm daemon');
const pid = readJsonFile<{ pid?: number }>(join(DIR, 'daemon.json'))?.pid;
ok(`ainstorm ${wasRunning ? 'restarted' : 'started'}: http://127.0.0.1:${PORT}${pid ? ` (pid ${pid})` : ''}`);
if (before !== null && before !== await tools()) {
  note('The MCP tools changed: run /reload-plugins in each open Claude Code session.');
}
