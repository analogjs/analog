/// <reference types="vitest" />

import analog from '@analogjs/platform';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';
import tailwindcss from '@tailwindcss/vite';
import fs from 'node:fs';
import path from 'node:path';
import { createLogger, defineConfig, type Plugin } from 'vite';

const DEBUG_DIR = path.resolve(__dirname, '../../tmp/debug');
const HMR_LOG_PATH = path.join(DEBUG_DIR, 'tailwind-debug-app.vite-hmr.log');
const WS_LOG_PATH = path.join(DEBUG_DIR, 'tailwind-debug-app.vite-ws.log');

function writeDebugLog(filePath: string, payload: unknown) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.appendFileSync(
    filePath,
    `${new Date().toISOString()} ${JSON.stringify(payload)}\n`,
    'utf8',
  );
}

function hmrWiretapPlugin(): Plugin {
  return {
    apply: 'serve',
    name: 'tailwind-debug-app-hmr-wiretap',
    configureServer(server) {
      const originalSend = server.ws.send.bind(server.ws);
      server.ws.send = ((payload: unknown, ...args: unknown[]) => {
        writeDebugLog(WS_LOG_PATH, payload);
        return (originalSend as (...inner: unknown[]) => unknown)(
          payload,
          ...args,
        );
      }) as typeof server.ws.send;
    },
    handleHotUpdate(ctx) {
      writeDebugLog(HMR_LOG_PATH, {
        file: ctx.file,
        modules: ctx.modules.map((module) => ({
          file: module.file,
          id: module.id,
          type: module.type,
          url: module.url,
        })),
        timestamp: ctx.timestamp,
      });
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  return {
    root: __dirname,
    publicDir: 'public',
    cacheDir: '../../node_modules/.vite',
    build: {
      outDir: '../../dist/apps/tailwind-debug-app/client',
      reportCompressedSize: true,
      target: ['es2020'],
    },
    optimizeDeps: {
      include: ['@angular/forms'],
      noDiscovery: true,
    },
    customLogger: (() => {
      const logger = createLogger();
      const warn = logger.warn.bind(logger);
      logger.warn = (msg, options) => {
        if (
          typeof msg === 'string' &&
          msg.includes('ɵɵgetReplaceMetadataURL')
        ) {
          return;
        }
        warn(msg, options);
      };
      return logger;
    })(),
    plugins: [
      analog({
        apiPrefix: 'api',
        hmr: true,
        ssr: false,
        experimental: {
          useAngularCompilationAPI: true,
        },
        nitro: {
          experimental: {
            websocket: true,
          },
        },
        tailwindCss: {
          prefixes: ['tdbg:'],
          rootStylesheet: 'apps/tailwind-debug-app/src/styles.css',
        },
      }),
      tailwindcss(),
      nxViteTsPaths(),
      hmrWiretapPlugin(),
    ],
    test: {
      reporters: ['default'],
      coverage: {
        reportsDirectory: '../../coverage/apps/tailwind-debug-app',
        provider: 'v8',
      },
      globals: true,
      environment: 'jsdom',
      setupFiles: ['src/test-setup.ts'],
      include: ['**/*.spec.ts'],
    },
    define: {
      'import.meta.vitest': mode !== 'production',
    },
    server: {
      port: 43040,
      fs: {
        allow: ['.'],
      },
      hmr: {
        clientPort: 4201,
        path: 'vite-hmr',
        port: 4201,
      },
    },
  };
});
