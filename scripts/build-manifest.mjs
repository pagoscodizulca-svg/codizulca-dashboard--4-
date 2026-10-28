import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

const TEXT_EXTENSIONS = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.json',
  '.css',
  '.html',
]);

const IGNORED_DIRS = new Set([
  'node_modules',
  'dist',
  '.git',
  '__tests__',
  'test',
  'coverage',
]);

function collectSourceFiles(rootDir, targetRelPath, results) {
  const absPath = path.join(rootDir, targetRelPath);
  if (!fs.existsSync(absPath)) return;

  const stat = fs.statSync(absPath);
  if (!stat.isDirectory()) {
    const normalizedRel = targetRelPath.replace(/\\/g, '/');
    if (normalizedRel.includes('.test.') || normalizedRel.includes('.spec.')) {
      return;
    }
    results.push(normalizedRel);
    return;
  }

  for (const entry of fs.readdirSync(absPath)) {
    if (IGNORED_DIRS.has(entry)) continue;
    collectSourceFiles(rootDir, path.join(targetRelPath, entry), results);
  }
}

/**
 * Computes a deterministic cross-platform (Windows CRLF / Linux LF invariant)
 * SHA-256 fingerprint of all frontend & server source inputs.
 */
export function computeSourceHash(rootDir) {
  const files = [];
  collectSourceFiles(rootDir, 'package.json', files);
  collectSourceFiles(rootDir, 'vite.config.ts', files);
  collectSourceFiles(rootDir, 'index.html', files);
  collectSourceFiles(rootDir, 'server.ts', files);
  collectSourceFiles(rootDir, 'src', files);

  files.sort();

  const hash = crypto.createHash('sha256');
  for (const relPath of files) {
    const absPath = path.join(rootDir, relPath);
    const ext = path.extname(relPath).toLowerCase();
    hash.update(`file:${relPath}\n`);
    if (TEXT_EXTENSIONS.has(ext)) {
      const normalizedText = fs.readFileSync(absPath, 'utf8').replace(/\r\n/g, '\n');
      hash.update(normalizedText, 'utf8');
    } else {
      hash.update(fs.readFileSync(absPath));
    }
    hash.update('\n');
  }

  return hash.digest('hex');
}

export function getManifestPath(rootDir) {
  return path.join(rootDir, 'dist', '.build-manifest.json');
}

export function writeBuildManifest(rootDir) {
  const sourceHash = computeSourceHash(rootDir);
  const manifestPath = getManifestPath(rootDir);
  const payload = {
    version: 1,
    sourceHash,
    builtAt: new Date().toISOString(),
  };
  fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
  fs.writeFileSync(manifestPath, JSON.stringify(payload, null, 2) + '\n', 'utf8');
  return payload;
}

export function readBuildManifest(rootDir) {
  const manifestPath = getManifestPath(rootDir);
  if (!fs.existsSync(manifestPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch {
    return null;
  }
}

export function isDistUpToDate(rootDir) {
  const distServerPath = path.join(rootDir, 'dist', 'server.cjs');
  const distIndexPath = path.join(rootDir, 'dist', 'index.html');
  if (!fs.existsSync(distServerPath) || !fs.existsSync(distIndexPath)) {
    return false;
  }

  try {
    const serverCode = fs.readFileSync(distServerPath, 'utf8');
    if (serverCode.includes('import_meta.env.')) {
      return false;
    }

    const manifest = readBuildManifest(rootDir);
    if (manifest && typeof manifest.sourceHash === 'string') {
      return manifest.sourceHash === computeSourceHash(rootDir);
    }
  } catch {
    return false;
  }

  return false;
}
