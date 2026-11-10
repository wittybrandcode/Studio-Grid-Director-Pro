import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, Plugin} from 'vite';

function preventViteHmrReloadLoop(): Plugin {
  return {
    name: 'prevent-vite-hmr-reload-loop',
    configureServer(server) {
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
            // Prevent Vite 8 client from polling and calling location.reload() when HMR is disabled
            body = body.replace(
              'if (payload.event === "vite:ws:disconnect") {',
              'if (false && payload.event === "vite:ws:disconnect") {'
            );
            body = body.replace(
              'transport.connect(createHMRHandler(handleMessage));',
              '/* transport.connect disabled */'
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
    plugins: [preventViteHmrReloadLoop(), react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      hmr: false,
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
