import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import * as esbuild from 'esbuild';
import { computeSourceHash, isDistUpToDate, writeBuildManifest } from './build-manifest.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

export function detectMemoryLimitMB() {
  const cgroupCandidates = [
    '/sys/fs/cgroup/memory.max',
    '/sys/fs/cgroup/memory/memory.limit_in_bytes',
  ];

  for (const candidate of cgroupCandidates) {
    try {
      if (!fs.existsSync(candidate)) continue;
      const raw = fs.readFileSync(candidate, 'utf8').trim();
      if (!raw || raw === 'max') continue;
      const bytes = Number(raw);
      if (Number.isFinite(bytes) && bytes > 0 && bytes < 1024 * 1024 * 1024 * 64) {
        return Math.floor(bytes / (1024 * 1024));
      }
    } catch {
      // ignore cgroup read errors on non-Linux hosts
    }
  }

  return Math.floor(os.totalmem() / (1024 * 1024));
}

function buildViteEnv(buildHash) {
  const env = {
    ...process.env,
    NODE_ENV: 'production',
    CODIZULCA_BUILD_HASH: buildHash,
  };

  // Render runtime free plan sets NODE_OPTIONS=--max-old-space-size=384, which can starve Vite
  // during builds on Render's larger build container (~2 GB+). Compute a safe build heap based
  // on actual container RAM instead of inheriting the tight runtime cap.
  const memLimitMB = detectMemoryLimitMB();
  const safeBuildHeapMB =
    memLimitMB >= 2500
      ? 2048
      : memLimitMB >= 1024
        ? Math.floor(memLimitMB * 0.78)
        : Math.max(384, Math.floor(memLimitMB * 0.8));

  const cleanedNodeOpts = (env.NODE_OPTIONS || '')
    .replace(/--max-old-space-size=\d+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  env.NODE_OPTIONS = `${cleanedNodeOpts} --max-old-space-size=${safeBuildHeapMB}`.trim();

  return env;
}

export async function runBuild(options = {}) {
  const args = new Set(process.argv.slice(2));
  const force = Boolean(options.force || args.has('--force'));
  const ifNeeded = Boolean(options.ifNeeded || args.has('--if-needed') || (process.env.RENDER === 'true' && !force));

  if (ifNeeded && isDistUpToDate(rootDir)) {
    console.log('[Build] dist/ ya está sincronizado con el código fuente (SHA-256 verificado). Omitiendo recompilación.');
    return;
  }

  const t0 = Date.now();
  const sourceHash = computeSourceHash(rootDir);
  const buildHash = sourceHash.slice(0, 12);
  const viteBin = path.join(rootDir, 'node_modules', 'vite', 'bin', 'vite.js');
  const viteEnv = buildViteEnv(buildHash);

  console.log(`[Build] Compilando frontend con Vite (hash: ${buildHash}, ${viteEnv.NODE_OPTIONS || 'default heap'})...`);
  execFileSync(process.execPath, [viteBin, 'build'], {
    cwd: rootDir,
    stdio: 'inherit',
    env: viteEnv,
  });

  console.log('[Build] Empaquetando servidor Express (server.ts -> dist/server.cjs)...');
  await esbuild.build({
    entryPoints: [path.join(rootDir, 'server.ts')],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    packages: 'external',
    minify: true,
    define: {
      'import.meta.env': 'process.env',
    },
    outfile: path.join(rootDir, 'dist', 'server.cjs'),
  });

  const manifest = writeBuildManifest(rootDir, sourceHash);
  const elapsedSec = ((Date.now() - t0) / 1000).toFixed(2);
  console.log(`[Build] Compilación completada en ${elapsedSec}s (hash: ${manifest.buildHash}).`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  runBuild().catch((err) => {
    console.error('[Build] Error durante la compilación:', err);
    process.exit(1);
  });
}
