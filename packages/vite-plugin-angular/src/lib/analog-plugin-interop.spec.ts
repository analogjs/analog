import { describe, expect, it, vi } from 'vitest';
import type { ResolvedConfig } from 'vite';
import {
  type AnalogIntegrationPlugin,
  discoverAnalogIntegrations,
  runAnalogSetupHooks,
} from './analog-plugin-interop.js';

const context = { filename: '/project/demo.css', inline: false };

describe('analog plugin interop', () => {
  it('returns no preprocessor when no plugin exposes analog.setup', async () => {
    const integrations = await runAnalogSetupHooks([
      { name: 'plain' },
      { name: 'analog-without-setup', analog: {} } as AnalogIntegrationPlugin,
    ]);

    expect(integrations.stylePreprocessor).toBeUndefined();
    expect(integrations.configureStylesheetRegistry).toBeUndefined();
    expect(integrations.transformFilter).toBeUndefined();
    expect(integrations.componentRegistries).toEqual([]);
    expect(integrations.externalizeStyles).toBe(false);
  });

  it('transforms a module only when every registered filter accepts it', async () => {
    const { transformFilter } = await runAnalogSetupHooks([
      {
        name: 'plugin-a',
        analog: {
          setup(ctx) {
            ctx.registerTransformFilter((_code, id) => id.includes('src/'));
          },
        },
      },
      {
        name: 'plugin-b',
        analog: {
          setup(ctx) {
            ctx.registerTransformFilter(
              (_code, id) => !id.endsWith('.spec.ts'),
            );
          },
        },
      },
    ] as AnalogIntegrationPlugin[]);

    expect(transformFilter?.('', '/project/src/app.component.ts')).toBe(true);
    expect(transformFilter?.('', '/project/src/app.component.spec.ts')).toBe(
      false,
    );
    expect(transformFilter?.('', '/project/lib/app.component.ts')).toBe(false);
  });

  it('collects component registries in Vite plugin order', async () => {
    const first = new Map([['A', { className: 'A' }]]);
    const second = new Map([['B', { className: 'B' }]]);
    const { componentRegistries } = await runAnalogSetupHooks([
      {
        name: 'plugin-a',
        analog: {
          setup(ctx) {
            ctx.registerComponentRegistry(first as any);
          },
        },
      },
      {
        name: 'plugin-b',
        analog: {
          setup(ctx) {
            ctx.registerComponentRegistry(second as any);
          },
        },
      },
    ] as AnalogIntegrationPlugin[]);

    expect(componentRegistries).toEqual([first, second]);
  });

  it('runs registered stylesheet registry configurators in Vite plugin order', async () => {
    const calls: string[] = [];
    const registry = { getRequestIdsForSource: () => [] } as any;
    const { configureStylesheetRegistry } = await runAnalogSetupHooks([
      {
        name: 'plugin-a',
        analog: {
          setup(ctx) {
            ctx.configureStylesheetRegistry((reg, { workspaceRoot }) => {
              calls.push(`a:${workspaceRoot}:${reg === registry}`);
            });
          },
        },
      },
      {
        name: 'plugin-b',
        analog: {
          setup(ctx) {
            ctx.configureStylesheetRegistry(() => {
              calls.push('b');
            });
          },
        },
      },
    ] as AnalogIntegrationPlugin[]);

    configureStylesheetRegistry?.(registry, { workspaceRoot: '/workspace' });

    expect(calls).toEqual(['a:/workspace:true', 'b']);
  });

  it('names the failing plugin when a registry configurator throws', async () => {
    const { configureStylesheetRegistry } = await runAnalogSetupHooks([
      {
        name: 'vite-plugin-xyz',
        analog: {
          setup(ctx) {
            ctx.configureStylesheetRegistry(() => {
              throw new Error('boom');
            });
          },
        },
      } as AnalogIntegrationPlugin,
    ]);

    expect(() =>
      configureStylesheetRegistry?.({} as any, { workspaceRoot: '/workspace' }),
    ).toThrow(
      '[analog] Stylesheet registry configurator from plugin "vite-plugin-xyz" failed: boom',
    );
  });

  it('records a request to externalize component styles', async () => {
    const integrations = await runAnalogSetupHooks([
      {
        name: 'plugin-a',
        analog: {
          setup(ctx) {
            ctx.externalizeComponentStyles();
          },
        },
      } as AnalogIntegrationPlugin,
    ]);

    expect(integrations.externalizeStyles).toBe(true);
  });

  it('composes registered preprocessors in Vite plugin order', async () => {
    const plugins: AnalogIntegrationPlugin[] = [
      {
        name: 'plugin-a',
        analog: {
          async setup(ctx) {
            await Promise.resolve();
            ctx.registerStylePreprocessor((code) => `${code}\n/* a */`);
          },
        },
      },
      { name: 'plain' },
      {
        name: 'plugin-b',
        analog: {
          setup(ctx) {
            ctx.registerStylePreprocessor((code, filename) => ({
              code: `${code}\n/* ${filename} */`,
              tags: ['b'],
            }));
          },
        },
      },
    ];

    const { stylePreprocessor } = await runAnalogSetupHooks(plugins);

    expect(
      stylePreprocessor?.('.demo {}', '/project/demo.css', context),
    ).toEqual({
      code: '.demo {}\n/* a */\n/* /project/demo.css */',
      dependencies: [],
      diagnostics: [],
      tags: ['b'],
    });
  });

  it('names the failing plugin and stylesheet when a preprocessor throws', async () => {
    const { stylePreprocessor } = await runAnalogSetupHooks([
      {
        name: 'vite-plugin-xyz',
        analog: {
          setup(ctx) {
            ctx.registerStylePreprocessor(() => {
              throw new Error('boom');
            });
          },
        },
      } as AnalogIntegrationPlugin,
    ]);

    expect(() =>
      stylePreprocessor?.('.demo {}', 'app.component.scss', context),
    ).toThrow(
      '[analog] Style preprocessor from plugin "vite-plugin-xyz" failed for "app.component.scss": boom',
    );
  });

  it('names the failing plugin when analog.setup throws', async () => {
    await expect(
      runAnalogSetupHooks([
        {
          name: 'vite-plugin-xyz',
          analog: {
            setup() {
              throw new Error('bad config');
            },
          },
        } as AnalogIntegrationPlugin,
      ]),
    ).rejects.toThrow(
      '[analog] analog.setup() from plugin "vite-plugin-xyz" failed: bad config',
    );
  });

  it('runs setup hooks once per resolved config', async () => {
    const setup = vi.fn();
    const config = {
      plugins: [{ name: 'plugin-a', analog: { setup } }],
    } as unknown as ResolvedConfig;

    await discoverAnalogIntegrations(config);
    await discoverAnalogIntegrations(config);

    expect(setup).toHaveBeenCalledTimes(1);
  });
});
