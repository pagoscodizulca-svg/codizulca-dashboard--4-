import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

process.env.NODE_ENV = process.env.NODE_ENV || 'production';

const distServerPath = path.join(__dirname, 'dist', 'server.cjs');
const distIndexPath = path.join(__dirname, 'dist', 'index.html');

const getNewestSourceMtime = (targetPath) => {
  if (!fs.existsSync(targetPath)) return 0;
  const stat = fs.statSync(targetPath);
  if (!stat.isDirectory()) return stat.mtimeMs;
  let newest = stat.mtimeMs;
  for (const entry of fs.readdirSync(targetPath)) {
    if (entry === 'node_modules' || entry === 'dist' || entry === '.git' || entry === '__tests__' || entry === 'test') {
      continue;
    }
    const childTime = getNewestSourceMtime(path.join(targetPath, entry));
    if (childTime > newest) newest = childTime;
  }
  return newest;
};

const needsRebuild = () => {
  if (!fs.existsSync(distServerPath) || !fs.existsSync(distIndexPath)) return true;
  try {
    const distServerTime = fs.statSync(distServerPath).mtimeMs;
    const distIndexTime = fs.statSync(distIndexPath).mtimeMs;
    const minDistTime = Math.min(distServerTime, distIndexTime);
    const newestSrcTime = Math.max(
      getNewestSourceMtime(path.join(__dirname, 'index.html')),
      getNewestSourceMtime(path.join(__dirname, 'server.ts')),
      getNewestSourceMtime(path.join(__dirname, 'src'))
    );
    // Allow 2s tolerance for git checkout timestamps when dist/ is committed together with src/
    if (newestSrcTime > minDistTime + 2000) {
      return true;
    }
    const serverCode = fs.readFileSync(distServerPath, 'utf8');
    if (serverCode.includes('import_meta.env.')) {
      return true;
    }
  } catch {
    return true;
  }
  return false;
};

if (needsRebuild()) {
  console.log('[Render Startup] dist/ desactualizado o no encontrado. Compilando proyecto automáticamente (npm run build)...');
  try {
    execSync('npm run build', { stdio: 'inherit', cwd: __dirname });
  } catch (err) {
    console.error('[Render Startup] Error al compilar con npm run build:', err);
    process.exit(1);
  }
}

const require = createRequire(import.meta.url);
require(distServerPath);
