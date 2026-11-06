import { createApi, ensureDaemon } from './lib.ts';

// /ainstorm:open — prints a one-time link that logs the browser into the map (valid for a minute, usable once)
if (!await ensureDaemon()) {
  console.log('ainstorm is not running and could not be started. Run the daemon once by hand (see the README).');
} else {
  try {
    const { url } = await createApi()<{ url: string }>('POST', '/api/open-link', {});
    console.log(url);
  } catch (error) {
    console.log(`ainstorm: could not create a link (${error instanceof Error ? error.message : String(error)}).`);
  }
}
