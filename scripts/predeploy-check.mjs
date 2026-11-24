import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { isDistUpToDate, readBuildManifest } from './build-manifest.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const SECRET_PATTERNS = [
  { name: 'JWT token', regex: /eyJhbGci[A-Za-z0-9._-]{20,}/ },
  { name: 'Supabase secret key', regex: /sb_secret_[A-Za-z0-9._-]+/ },
  { name: 'Supabase PAT', regex: /sbp_[A-Za-z0-9._-]+/ },
  { name: 'Google API key', regex: /AIza[0-9A-Za-z_-]{20,}/ },
];

const errors = [];
const warnings = [];

// 1. Verify dist/ is compiled and matches SHA-256 sourceHash (cross-platform CRLF/LF invariant)
const manifest = readBuildManifest(rootDir);
if (!manifest || !isDistUpToDate(rootDir)) {
  errors.push('dist/ está desactualizado respecto al código fuente. Ejecuta `npm run build` antes de subir a GitHub.');
}

// 2. Verify dist/index.html received the automatic buildHash injection
const distIndexPath = path.join(rootDir, 'dist', 'index.html');
if (fs.existsSync(distIndexPath)) {
  const html = fs.readFileSync(distIndexPath, 'utf8');
  if (html.includes('__CODIZULCA_BUILD_HASH__') || html.includes('__CODIZULCA_BUILD_VERSION__')) {
    errors.push('dist/index.html conserva placeholders sin inyectar (__CODIZULCA_BUILD_HASH__).');
  } else if (manifest?.buildHash && !html.includes(manifest.buildHash)) {
    errors.push(`dist/index.html no coincide con buildHash ${manifest.buildHash} de dist/.build-manifest.json.`);
  }
} else {
  errors.push('Falta dist/index.html.');
}

// 3. Verify dist/data/ does not duplicate public/data/ (~22 MB bloat)
const distDataDir = path.join(rootDir, 'dist', 'data');
if (fs.existsSync(distDataDir)) {
  warnings.push('Existe dist/data/ duplicado; elimina dist/data/ o ejecuta una compilación limpia.');
}

// 4. DevSecOps checks: .env must never be tracked & zero hardcoded secrets in server bundle or modified code
try {
  const trackedEnv = execFileSync('git', ['ls-files', '.env', '.env.local', '.env.production'], {
    cwd: rootDir,
    encoding: 'utf8',
  }).trim();
  if (trackedEnv) {
    errors.push(`Archivo de secretos rastreado en Git: ${trackedEnv}`);
  }

  const porcelain = execFileSync('git', ['status', '--porcelain'], {
    cwd: rootDir,
    encoding: 'utf8',
  })
    .split(/\r?\n/)
    .filter(Boolean);

  for (const line of porcelain) {
    const statusCode = line.slice(0, 2);
    const relFile = line.slice(3).trim().replace(/^"|"$/g, '');
    if (statusCode.includes('D') || relFile.startsWith('dist/')) continue;
    const absFile = path.join(rootDir, relFile);
    if (!fs.existsSync(absFile) || fs.statSync(absFile).isDirectory()) continue;
    const ext = path.extname(relFile).toLowerCase();
    if (!['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.sql', '.json', '.yaml', '.yml', '.html', '.py'].includes(ext)) {
      continue;
    }
    const content = fs.readFileSync(absFile, 'utf8');
    for (const pat of SECRET_PATTERNS) {
      if (pat.regex.test(content)) {
        errors.push(`Posible secreto (${pat.name}) detectado en ${relFile}`);
      }
    }
  }
} catch (gitErr) {
  warnings.push(`No se pudo ejecutar auditoría Git: ${gitErr?.message || gitErr}`);
}

// 5. Ensure dist/server.cjs contains zero hardcoded JWT/service_role keys
const distServerPath = path.join(rootDir, 'dist', 'server.cjs');
if (fs.existsSync(distServerPath)) {
  const srv = fs.readFileSync(distServerPath, 'utf8');
  for (const pat of SECRET_PATTERNS) {
    if (pat.regex.test(srv)) {
      errors.push(`Posible secreto (${pat.name}) compilado dentro de dist/server.cjs`);
    }
  }
}

if (warnings.length > 0) {
  for (const w of warnings) {
    console.warn(`[Predeploy Warning] ${w}`);
  }
}

if (errors.length > 0) {
  for (const e of errors) {
    console.error(`[Predeploy FAIL] ${e}`);
  }
  process.exit(1);
}

console.log(
  `[Predeploy OK] Build listo para GitHub -> Render (hash: ${manifest?.buildHash}, dist/ sincronizado, 0 secretos expuestos).`
);
