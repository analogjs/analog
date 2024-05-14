import { describe, it, expect } from 'vitest';
import { angularVitestPlugin } from './angular-vitest-plugin';
import { defineConfig, resolveConfig } from 'vite';

describe(angularVitestPlugin.name, () => {
  /* Setting the pool to vmThreads by default to avoid issues related to global conflicts when using JSDOM.
   * This also aligns with the default pool setting in Jest.
   * This is not ideal as vmThreads comes with its own set of issues, but it's the best option we have for now.
   * Cf. https://github.com/vitest-dev/vitest/issues/4685
   * Cf. https://vitest.dev/config/#vmthreads */
  it('should set pool to vmThreads', async () => {
    const config = await resolveConfig(
      defineConfig({
        plugins: [angularVitestPlugin()],
      }),
      'serve'
    );
    expect(config.test?.pool).toBe('vmThreads');
  });

  it('should not override pool option if already set by user', async () => {
    const config = await resolveConfig(
      defineConfig({
        plugins: [angularVitestPlugin()],
        test: {
          pool: 'threads',
        },
      }),
      'serve'
    );
    expect(config.test?.pool).toBe('threads');
  });
});
