import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { isDistUpToDate } from './scripts/build-manifest.mjs';
import { detectMemoryLimitMB } from './scripts/build.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

process.env.NODE_ENV = process.env.NODE_ENV || 'production';

const distServerPath = path.join(__dirname, 'dist', 'server.cjs');
const distIndexPath = path.join(__dirname, 'dist', 'index.html');

function hasValidDistArtifacts() {
  if (!fs.existsSync(distServerPath) || !fs.existsSync(distIndexPath)) {
    return false;
  }
  try {
    const serverCode = fs.readFileSync(distServerPath, 'utf8');
    return !serverCode.includes('import_meta.env.');
  } catch {
    return false;
  }
}

if (!isDistUpToDate(__dirname)) {
  const memLimitMB = detectMemoryLimitMB();
  const hasArtifacts = hasValidDistArtifacts();

  if (hasArtifacts && memLimitMB <= 600 && process.env.FORCE_RUNTIME_BUILD !== '1') {
    console.warn(
      `[Render Startup] Contenedor de memoria limitada (${memLimitMB} MB) detectado con dist/ válido disponible. ` +
        'Omitiendo recompilación en arranque para evitar saturación de memoria (OOM) e iniciando servidor inmediatamente.'
    );
  } else {
    console.log('[Render Startup] dist/ no encontrado o desactualizado. Compilando proyecto (scripts/build.mjs)...');
    try {
      execFileSync(process.execPath, [path.join(__dirname, 'scripts', 'build.mjs'), '--force'], {
        stdio: 'inherit',
        cwd: __dirname,
      });
    } catch (err) {
      console.error('[Render Startup] Error al compilar proyecto:', err);
      if (!hasArtifacts) {
        process.exit(1);
      }
      console.warn('[Render Startup] Continuando con artefactos previos existentes en dist/.');
    }
  }
}

const require = createRequire(import.meta.url);
require(distServerPath);
