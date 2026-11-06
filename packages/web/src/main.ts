import '@fontsource/ibm-plex-sans/400.css';
import '@fontsource/ibm-plex-sans/500.css';
import '@fontsource/ibm-plex-sans/600.css';
import '@fontsource/ibm-plex-sans/700.css';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';
import '@fontsource/ibm-plex-mono/600.css';
import './styles/tokens.css';
import './styles/base.css';

import { MapSnapshot } from '@ainstorm/core';
import { createPinia } from 'pinia';
import { createApp } from 'vue';
import { createHttpApi } from './api/httpApi.ts';
import { MAP_API } from './api/inject.ts';
import type { MapApi } from './api/types.ts';
import App from './App.vue';
import { i18n } from './i18n/index.ts';
import { router } from './router.ts';

// Served by the daemon: its HTTP API. Vite dev server and e2e tests: the fixture rebuilt from real sessions
// (imported dynamically, so it never ends up in the production bundle).
async function createApi(): Promise<MapApi> {
  if (import.meta.env.PROD) return createHttpApi();
  const [{ createFixtureApi }, fixture] = await Promise.all([import('./api/fixtureApi.ts'), import('./fixtures/map.json')]);
  return createFixtureApi(MapSnapshot.parse(fixture.default));
}

const api = await createApi();

createApp(App)
  .provide(MAP_API, api)
  .use(createPinia())
  .use(router)
  .use(i18n)
  .mount('#app');
