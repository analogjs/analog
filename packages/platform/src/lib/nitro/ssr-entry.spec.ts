import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { generateSsrServiceVirtual } from './analog-nitro-plugin';

describe('built SSR entry resolution', () => {
  let buildDir: string;
  let ssrDir: string;

  beforeEach(() => {
    buildDir = mkdtempSync(join(tmpdir(), 'analog-ssr-entry-'));
    ssrDir = join(buildDir, 'vite/services/ssr');
  });

  afterEach(() => rmSync(buildDir, { recursive: true, force: true }));

  function writeEntries(names: string[]) {
    mkdirSync(ssrDir, { recursive: true });
    for (const name of names)
      writeFileSync(join(ssrDir, name), 'export default {};');
  }

  it.each(['main.server.mjs', 'main.server.js', 'index.mjs', 'index.js'])(
    'resolves the emitted %s entry ahead of shared chunks',
    (entry) => {
      writeEntries(['a-shared.js', entry, 'entry.js.map']);
      expect(
        generateSsrServiceVirtual({ options: { dev: false, buildDir } }),
      ).toBe(`export { default } from ${JSON.stringify(join(ssrDir, entry))};`);
    },
  );

  it('supports a single custom entry name', () => {
    writeEntries(['custom.js']);
    expect(
      generateSsrServiceVirtual({ options: { dev: false, buildDir } }),
    ).toContain(JSON.stringify(join(ssrDir, 'custom.js')));
  });

  it('fails the build when the SSR directory is missing', () => {
    expect(() =>
      generateSsrServiceVirtual({ options: { dev: false, buildDir } }),
    ).toThrow('SSR service directory missing');
  });

  it('rejects a directory containing only source maps', () => {
    writeEntries(['index.js.map']);
    expect(() =>
      generateSsrServiceVirtual({ options: { dev: false, buildDir } }),
    ).toThrow('No Analog SSR entry file');
  });

  it('rejects ambiguous custom entries rather than loading an arbitrary chunk', () => {
    writeEntries(['a.js', 'b.mjs']);
    expect(() =>
      generateSsrServiceVirtual({ options: { dev: false, buildDir } }),
    ).toThrow('Ambiguous Analog SSR entry');
  });

  it('retains development dispatch without requiring build output', () => {
    expect(
      generateSsrServiceVirtual({ options: { dev: true, buildDir } }),
    ).toContain("fetchViteEnv('ssr', req)");
  });
});
