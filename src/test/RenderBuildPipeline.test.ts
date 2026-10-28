import fs from 'fs';
import os from 'os';
import path from 'path';
import { describe, expect, it } from 'vitest';
// @ts-ignore - ESM build helper script
import { computeSourceHash, isDistUpToDate, readBuildManifest } from '../../scripts/build-manifest.mjs';

describe('Render Build & Startup Pipeline Verification', () => {
  const rootDir = process.cwd();

  it('generates dist/index.html, dist/server.cjs, and dist/.build-manifest.json matching sourceHash', () => {
    const distIndex = path.join(rootDir, 'dist', 'index.html');
    const distServer = path.join(rootDir, 'dist', 'server.cjs');
    expect(fs.existsSync(distIndex)).toBe(true);
    expect(fs.existsSync(distServer)).toBe(true);

    const manifest = readBuildManifest(rootDir);
    expect(manifest).not.toBeNull();
    expect(typeof manifest.sourceHash).toBe('string');
    expect(manifest.sourceHash.length).toBe(64);
    expect(isDistUpToDate(rootDir)).toBe(true);
  });

  it('produces identical SHA-256 sourceHash across Windows CRLF and Linux LF line endings', () => {
    const tmpCrlf = fs.mkdtempSync(path.join(os.tmpdir(), 'codizulca-crlf-'));
    const tmpLf = fs.mkdtempSync(path.join(os.tmpdir(), 'codizulca-lf-'));

    try {
      for (const dir of [tmpCrlf, tmpLf]) {
        fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
      }

      const files: Record<string, string> = {
        'package.json': '{\n  "name": "codizulca"\n}\n',
        'vite.config.ts': 'export default {};\n',
        'index.html': '<!doctype html>\n<html></html>\n',
        'server.ts': 'console.log("ok");\n',
        'src/main.tsx': 'const x = 1;\nexport default x;\n',
      };

      for (const [rel, lfContent] of Object.entries(files)) {
        const crlfContent = lfContent.replace(/\n/g, '\r\n');
        fs.writeFileSync(path.join(tmpLf, rel), lfContent, 'utf8');
        fs.writeFileSync(path.join(tmpCrlf, rel), crlfContent, 'utf8');
      }

      expect(computeSourceHash(tmpCrlf)).toBe(computeSourceHash(tmpLf));
    } finally {
      fs.rmSync(tmpCrlf, { recursive: true, force: true });
      fs.rmSync(tmpLf, { recursive: true, force: true });
    }
  });
});
