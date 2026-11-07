import { createApi, ensureDaemon } from './lib.ts';

// /ainstorm:open — prints a one-time link that logs the browser into the map (valid for a minute, usable once).
// The link opens this session's view: its id comes from Claude Code (the command's argument or the environment).
// A folder that is no project yet gets a suggested project instead, for Claude to confirm with the user.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const sessionId = [process.argv[2], process.env.CLAUDE_CODE_SESSION_ID].find(id => id !== undefined && UUID.test(id));
const cwd = process.env.CLAUDE_PROJECT_DIR || process.cwd();

interface Reply {
  url?: string;
  suggestion?: { key: string; name: string; path: string };
}

if (!await ensureDaemon()) {
  console.log('ainstorm is not running and could not be started. Run the daemon once by hand (see the README).');
} else {
  try {
    const reply = await createApi()<Reply>('POST', '/api/open-link', sessionId ? { sessionId, cwd } : {});
    if (reply.suggestion) {
      const { key, name, path } = reply.suggestion;
      console.log([
        `NOT A PROJECT YET: the folder ${path} is not a project in the ainstorm map.`,
        `Suggested project: key ${key}, name "${name}", path ${path}`,
      ].join('\n'));
    } else {
      console.log(reply.url);
    }
  } catch (error) {
    console.log(`ainstorm: could not create a link (${error instanceof Error ? error.message : String(error)}).`);
  }
}
