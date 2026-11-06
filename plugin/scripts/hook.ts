import { runHook, type HookInput } from './hooks.ts';
import { createApi, ensureDaemon, readStdin } from './lib.ts';

// Entry point of every ainstorm hook (hooks/hooks.json). Never fails the hook: errors end silently with exit 0.
try {
  const input = JSON.parse(await readStdin()) as HookInput;
  if (/^[0-9a-f-]{36}$/.test(input.session_id ?? '')) {
    const output = await runHook(input, { api: createApi(), ensureDaemon });
    if (output) process.stdout.write(JSON.stringify(output));
  }
} catch {
  // Fail-open: the map is a helper, it must never stop Claude's work
}
