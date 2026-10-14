import { describe, expect, it } from 'vitest';
import { build, type Plugin } from 'vite';
import { platformPlugin } from '../platform-plugin';

const entry = '\0analog-streaming-fixture';
const fixture: Plugin = {
  name: 'analog-streaming-fixture',
  resolveId(id) {
    if (id === entry) return id;
  },
  load(id) {
    if (id === entry) return `export { ɵɵdefer } from '@angular/core';`;
  },
};

function chunks(result: Awaited<ReturnType<typeof build>>): string {
  if (Array.isArray(result)) return result.map(chunks).join('\n');
  if (!('output' in result))
    throw new Error('Expected an in-memory build result');
  return result.output
    .flatMap((output) => (output.type === 'chunk' ? [output.code] : []))
    .join('\n');
}

describe('streaming transform in a real Angular build', () => {
  it('patches Angular in SSR and leaves the browser bundle untouched', async () => {
    const streaming = platformPlugin({
      experimental: { streaming: true },
    }).filter((plugin) => plugin.name === 'analogjs-defer-streaming');
    expect(streaming).toHaveLength(1);
    const options = {
      configFile: false as const,
      plugins: [fixture, ...streaming],
      logLevel: 'silent' as const,
      build: {
        write: false,
        minify: false as const,
        rollupOptions: { input: entry },
      },
    };
    const browser = chunks(await build(options));
    expect(browser).not.toContain('__analogSsrDeferCapture');
    expect(browser).not.toContain('__analogSsrInternals');
    const server = chunks(
      await build({ ...options, build: { ...options.build, ssr: true } }),
    );
    expect(server).toContain('__analogSsrDeferCapture');
    expect(server).toContain('__analogSsrInternals');
  });
});
