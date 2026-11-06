import { createApi, ensureDaemon } from './lib.ts';

// /ainstorm:open — prints a one-time link that logs the browser into the map (valid for a minute, usable once).
// The link opens this session's view: its id comes from Claude Code (the command's argument or the environment).
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const sessionId = [process.argv[2], process.env.CLAUDE_CODE_SESSION_ID].find(id => id !== undefined && UUID.test(id));

if (!await ensureDaemon()) {
  console.log('ainstorm is not running and could not be started. Run the daemon once by hand (see the README).');
} else {
  try {
    const { url } = await createApi()<{ url: string }>('POST', '/api/open-link', sessionId ? { sessionId } : {});
    console.log(url);
  } catch (error) {
    console.log(`ainstorm: could not create a link (${error instanceof Error ? error.message : String(error)}).`);
  }
}
