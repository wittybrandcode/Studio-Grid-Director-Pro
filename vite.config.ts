import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, Plugin } from 'vite';

/**
 * Isolated dev-server guard for cloud iframe preview environments where HMR WebSockets
 * are disabled (`server.hmr = false`). Strictly `apply: 'serve'` so production builds
 * and standalone Tauri desktop bundles are completely unaffected.
 */
function previewNoHmrReloadGuard(): Plugin {
  return {
    name: 'preview-no-hmr-reload-guard',
    apply: 'serve',
    configureServer(server) {
      if (process.env.DISABLE_HMR !== 'true' && server.config.server.hmr !== false) {
        return;
      }
      server.middlewares.use((req, res, next) => {
        if (req.url && req.url.startsWith('/@vite/client')) {
          delete req.headers['if-none-match'];
          delete req.headers['if-modified-since'];
          const origEnd = res.end.bind(res);
          const chunks: Buffer[] = [];
          res.write = ((chunk: unknown) => {
            if (chunk) {
              chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
            }
            return true;
          }) as typeof res.write;
          res.end = ((chunk?: unknown) => {
            if (chunk) {
              chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
            }
            let body = Buffer.concat(chunks).toString('utf8');
            body = body.replace(
              'if (payload.event === "vite:ws:disconnect") {',
              'if (false && payload.event === "vite:ws:disconnect") {'
            );
            body = body.replace(
              'transport.connect(createHMRHandler(handleMessage));',
              '/* preview HMR transport disabled */'
            );
            res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
            res.setHeader('Content-Length', Buffer.byteLength(body, 'utf8'));
            return origEnd(body);
          }) as typeof res.end;
        }
        next();
      });
    },
  };
}

export default defineConfig(() => {
  return {
    clearScreen: false,
    envPrefix: ['VITE_', 'TAURI_ENV_', 'TAURI_'],
    plugins: [previewNoHmrReloadGuard(), react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, '.'),
      },
    },
    server: {
      port: 3000,
      strictPort: true,
      hmr: false,
      watch: process.env.DISABLE_HMR === 'true' ? null : { ignored: ['**/src-tauri/**'] },
    },
  };
});
