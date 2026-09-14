import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { analogNitroPlugin } from './analog-nitro-plugin';

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});

describe('Cloudflare output boundaries', () => {
  it.each(['cloudflare-module', 'cloudflare-durable', 'cloudflare-pages'])(
    'preserves the %s deployment layout',
    async (preset) => {
      const root = mkdtempSync(join(tmpdir(), 'analog-cloudflare-output-'));
      roots.push(root);
      writeFileSync(join(root, 'index.html'), '<html><body></body></html>');
      const plugin: any = analogNitroPlugin({
        workspaceRoot: root,
        ssr: false,
      });
      const config =
        typeof plugin.config === 'function'
          ? plugin.config
          : plugin.config.handler;
      config({ root }, { command: 'build', mode: 'production' });
      const output = {
        dir: join(root, '.output'),
        publicDir: join(root, '.output/public'),
        serverDir: join(root, '.output/server'),
      };
      const nitro = {
        options: {
          rootDir: root,
          buildDir: join(root, '.nitro'),
          preset,
          dev: false,
          handlers: [],
          scanDirs: [],
          virtual: {},
          output,
        },
        hooks: { hook: vi.fn() },
      };
      await plugin.nitro.setup(nitro);
      expect(nitro.options.output).toEqual(
        preset === 'cloudflare-pages'
          ? {
              dir: join(root, 'dist'),
              publicDir: join(root, 'dist'),
              serverDir: join(root, 'dist/_worker.js'),
            }
          : output,
      );
    },
  );
});
