import { describe, expect, it, vi } from 'vitest';
import { angularVitestPlugin } from './angular-vitest-plugin';

// Exercise the Vite 6/7 fallback while the workspace itself uses Vite 8.
vi.mock(import('./utils/rolldown.js'), () => ({
  getJsTransformConfigKey: () => 'esbuild',
  isRolldown: () => false,
}));

const transform = (code: string, id: string) => {
  const hook = angularVitestPlugin().transform as {
    handler: (code: string, id: string) => Promise<{ code: string }>;
  };
  return hook.handler(code, id);
};

describe('angularVitestPlugin esbuild downleveling', () => {
  it('preserves HMR access in generated CDK CSS modules', async () => {
    const { code } = await transform(
      'export const id = "/node_modules/@angular/cdk/overlay-prebuilt.css"; import.meta.hot.accept();',
      '/node_modules/@angular/cdk/overlay-prebuilt.css',
    );

    expect(code).toContain('import.meta.hot.accept()');
  });

  it('preserves module metadata while downleveling async functions', async () => {
    const { code } = await transform(
      'export const url = import.meta.url; export async function example() { return await Promise.resolve(42); }',
      '/node_modules/@angular/core/fesm2022/core.mjs',
    );
    const moduleUrl = `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;
    const result = await import(moduleUrl);

    expect(result.url).toBe(moduleUrl);
    expect(await result.example()).toBe(42);
    expect(code).not.toMatch(/\basync\s+function\b/);
  });
});
