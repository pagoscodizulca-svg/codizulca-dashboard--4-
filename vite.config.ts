import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';
import {defineConfig, type Plugin} from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

/**
 * Rewrites named imports from `lucide-react` directly to their individual ESM icon modules
 * during production builds so Rollup does not parse ~1,800 unused icon files into ASTs.
 * This reduces transformed module count by ~60% and prevents V8 OOM in 512 MB containers (Render).
 */
function optimizeLucideImportsPlugin(): Plugin {
  let iconExportMap: Map<string, string> | null = null;

  const getIconExportMap = (): Map<string, string> => {
    if (iconExportMap) return iconExportMap;
    iconExportMap = new Map<string, string>();
    const lucideEntry = path.resolve(__dirname, 'node_modules/lucide-react/dist/esm/lucide-react.js');
    if (!fs.existsSync(lucideEntry)) return iconExportMap;

    const content = fs.readFileSync(lucideEntry, 'utf8');
    const exportRegex = /export\s*\{([^}]+)\}\s*from\s*['"]\.\/([^'"]+)['"]/g;
    let match: RegExpExecArray | null;
    while ((match = exportRegex.exec(content)) !== null) {
      const specifiers = match[1].split(',');
      const targetSubpath = `lucide-react/dist/esm/${match[2]}`;
      for (const rawSpec of specifiers) {
        const asMatch = rawSpec.trim().match(/^default\s+as\s+([A-Za-z0-9_$]+)$/);
        if (asMatch) {
          iconExportMap.set(asMatch[1], targetSubpath);
        }
      }
    }
    return iconExportMap;
  };

  return {
    name: 'optimize-lucide-imports',
    apply: 'build',
    enforce: 'post',
    transform(code, id) {
      const cleanId = id.split('?')[0].replace(/\\/g, '/');
      if (cleanId.includes('/node_modules/') || !code.includes('lucide-react')) {
        return null;
      }

      const map = getIconExportMap();
      if (map.size === 0) return null;

      let mutated = false;
      const importRegex = /import\s*\{([^}]+)\}\s*from\s*['"]lucide-react['"]\s*;?/g;
      const transformed = code.replace(importRegex, (fullMatch, specifiersBlock: string) => {
        const rawSpecs = specifiersBlock
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);

        if (rawSpecs.length === 0) return fullMatch;

        const directLines: string[] = [];
        for (const spec of rawSpecs) {
          if (spec.startsWith('type ')) continue;
          const parts = spec.split(/\s+as\s+/);
          const importedName = parts[0]?.trim();
          const localName = (parts[1] || parts[0])?.trim();
          if (!importedName || !localName) return fullMatch;

          const targetPath = map.get(importedName);
          if (!targetPath) {
            return fullMatch;
          }
          directLines.push(`import ${localName} from '${targetPath}';`);
        }

        mutated = true;
        return directLines.join('\n');
      });

      return mutated ? { code: transformed, map: null } : null;
    },
  };
}

/**
 * Stubs optional `jspdf` dynamic dependencies (`html2canvas`, `canvg`, `dompurify`) that are
 * only required by `jsPDF.API.html()` (unused in this project). Prevents Rollup from parsing
 * ~250 unused modules (`core-js`, `canvg`, `html2canvas`) and saves ~400 kB of client bundle.
 */
function stubUnusedJspdfOptionalDepsPlugin(): Plugin {
  const STUB_ID = '\0jspdf-optional-stub';
  const OPTIONAL_DEPS = new Set(['html2canvas', 'canvg', 'dompurify']);

  return {
    name: 'stub-unused-jspdf-optional-deps',
    apply: 'build',
    enforce: 'pre',
    resolveId(source, importer) {
      if (OPTIONAL_DEPS.has(source) && importer && importer.replace(/\\/g, '/').includes('/jspdf/')) {
        return STUB_ID;
      }
      return null;
    },
    load(id) {
      if (id === STUB_ID) {
        return 'export default null;';
      }
      return null;
    },
  };
}

export default defineConfig(() => {
  return {
    plugins: [
      react(), 
      tailwindcss(),
      optimizeLucideImportsPlugin(),
      stubUnusedJspdfOptionalDepsPlugin(),
      VitePWA({
        selfDestroying: true,
        registerType: 'autoUpdate',
        includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'icon.svg'],
        manifest: {
          id: '/portal',
          name: 'Codizulca Campo',
          short_name: 'CodiCampo',
          description: 'App de campo PWA para Trade Marketing: asistencia biométrica, escaneo IA de góndolas y certificación en PDV.',
          theme_color: '#dc2626',
          background_color: '#000000',
          display: 'standalone',
          orientation: 'portrait',
          start_url: '/portal',
          scope: '/portal',
          icons: [
            {
              src: 'https://placehold.co/192x192/dc2626/ffffff.png?text=CZ&font=sans-serif',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: 'https://placehold.co/512x512/dc2626/ffffff.png?text=CZ&font=sans-serif',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any',
            }
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
          maximumFileSizeToCacheInBytes: 10 * 1024 * 1024,
          skipWaiting: true,
          clientsClaim: true,
          cleanupOutdatedCaches: true,
          navigateFallbackDenylist: [/^\/api\//],
        },
        devOptions: {
          enabled: false,
          type: 'module',
        },
      }),
    ],
    resolve: {
      dedupe: ['react', 'react-dom'],
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    json: {
      stringify: true,
    },
    build: {
      target: 'es2020',
      sourcemap: false,
      reportCompressedSize: false,
      chunkSizeWarningLimit: 1200,
      rollupOptions: {
        cache: false,
        output: {
          manualChunks(id) {
            const normId = id.replace(/\\/g, '/');
            if (normId.includes('jspdf-optional-stub')) return 'vendor-pdf';
            if (normId.endsWith('/src/data/surveyLocations.json')) return 'data-survey-locations';
            if (normId.endsWith('/src/data/activacionClientesSeed.json')) return 'data-activacion-seed';
            if (normId.endsWith('/src/data/carteraClientes.json')) return 'data-cartera-clientes';

            if (!normId.includes('/node_modules/')) return;
            if (normId.includes('recharts') || normId.includes('d3-')) return 'vendor-charts';
            if (normId.includes('xlsx')) return 'vendor-xlsx';
            if (normId.includes('jspdf') || normId.includes('html2canvas')) return 'vendor-pdf';
            if (normId.includes('papaparse')) return 'vendor-csv';
            if (normId.includes('leaflet')) return 'vendor-maps';
            if (normId.includes('@supabase')) return 'vendor-supabase';
            if (normId.includes('lucide-react')) return 'vendor-icons';
            if (normId.includes('motion') || normId.includes('framer-motion')) return 'vendor-motion';
            if (
              normId.includes('react-dom') ||
              normId.includes('react-router') ||
              normId.includes('/node_modules/react/') ||
              normId.includes('/node_modules/scheduler/')
            ) {
              return 'vendor-react';
            }
          },
        },
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
