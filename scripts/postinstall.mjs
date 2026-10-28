import { execFileSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import { isDistUpToDate } from './build-manifest.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const isRenderEnv =
  process.env.RENDER === 'true' ||
  Boolean(process.env.RENDER_SERVICE_ID) ||
  Boolean(process.env.RENDER_GIT_COMMIT);

if (isRenderEnv && process.env.SKIP_POSTINSTALL_BUILD !== '1') {
  if (isDistUpToDate(rootDir)) {
    console.log('[Render Postinstall] dist/ ya está compilado y verificado por hash SHA-256.');
  } else {
    console.log('[Render Postinstall] Ejecutando compilación durante la fase de Build de Render...');
    execFileSync(process.execPath, [path.join(__dirname, 'build.mjs'), '--force'], {
      cwd: rootDir,
      stdio: 'inherit',
      env: {
        ...process.env,
        NODE_ENV: 'production',
      },
    });
  }
}
