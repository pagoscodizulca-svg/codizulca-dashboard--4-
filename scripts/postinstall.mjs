import path from 'path';
import { fileURLToPath } from 'url';
import { isDistUpToDate } from './build-manifest.mjs';
import { runBuild } from './build.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const isRenderEnv =
  process.env.RENDER === 'true' ||
  Boolean(process.env.RENDER_SERVICE_ID) ||
  Boolean(process.env.RENDER_GIT_COMMIT);

async function runPostinstall() {
  if (!isRenderEnv || process.env.SKIP_POSTINSTALL_BUILD === '1') {
    return;
  }

  if (isDistUpToDate(rootDir)) {
    console.log('[Render Postinstall] dist/ ya está compilado y verificado por hash SHA-256.');
    return;
  }

  console.log('[Render Postinstall] Ejecutando compilación durante la fase de Build de Render...');
  process.env.NODE_ENV = 'production';
  await runBuild({ force: true });
}

runPostinstall().catch((err) => {
  console.error('[Render Postinstall] Error durante la compilación:', err?.message || err);
  process.exit(1);
});
