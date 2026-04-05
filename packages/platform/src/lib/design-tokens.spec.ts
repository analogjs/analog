import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { ResolvedConfig } from 'vite';
import {
  DEFAULT_CSS_MODULE_ID,
  DEFAULT_MANIFEST_MODULE_ID,
  designTokenCss,
  designTokensPlugin,
} from './design-tokens.js';

const tempDirs: string[] = [];

async function createWorkspace(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'analog-design-tokens-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  );
});

describe('designTokensPlugin', () => {
  it('builds a TypeScript Style Dictionary config and exposes virtual CSS and manifest modules', async () => {
    const workspace = await createWorkspace();
    const helperPath = path.resolve(import.meta.dirname, './design-tokens.ts');
    const configFile = path.join(workspace, 'tokens.config.ts');

    await writeFile(
      configFile,
      `
import { defineDesignTokensConfig } from ${JSON.stringify(helperPath)};

export default defineDesignTokensConfig({
  tokens: {
    color: {
      brand: {
        primary: { value: '#3366ff' },
      },
    },
  },
  platforms: {
    css: {
      transformGroup: 'css',
      buildPath: 'css/',
      files: [
        {
          destination: 'tokens.css',
          format: 'css/variables',
          options: {
            analog: {
              framework: ['tailwind', 'mui'],
            },
          },
        },
        {
          destination: 'tailwind.css',
          format: 'css/variables',
          options: {
            analog: {
              framework: 'tailwind',
              inject: false,
            },
          },
        },
      ],
    },
    js: {
      transformGroup: 'js',
      buildPath: 'ts/',
      files: [
        {
          destination: 'tokens.js',
          format: 'javascript/es6',
        },
      ],
    },
  },
});
      `,
    );

    const [plugin] = designTokensPlugin({
      configFile: 'tokens.config.ts',
    });
    plugin.configResolved?.({
      root: workspace,
    } as ResolvedConfig);
    await plugin.buildStart?.call({} as never);

    const manifestId = plugin.resolveId?.(DEFAULT_MANIFEST_MODULE_ID);
    const cssId = plugin.resolveId?.(DEFAULT_CSS_MODULE_ID);
    const explicitCssId = plugin.resolveId?.(
      designTokenCss('css/tailwind.css'),
    );

    const manifest = await plugin.load?.call({} as never, manifestId as string);
    const css = await plugin.load?.call({} as never, cssId as string);
    const explicitCss = await plugin.load?.call(
      {} as never,
      explicitCssId as string,
    );
    const htmlTags = await plugin.transformIndexHtml?.call({} as never, '');

    expect(manifest).toContain('"platform":"css"');
    expect(manifest).toContain('"framework":["tailwind","mui"]');
    expect(manifest).toContain('"relativePath":"css/tokens.css"');
    expect(manifest).toContain('"tailwind":[');
    expect(manifest).toContain('getOutputsForFramework');
    expect(css).toContain('--color-brand-primary: #3366ff;');
    expect(css).toContain('css/tokens.css');
    expect(css).not.toContain('css/tailwind.css');
    expect(explicitCss).toContain('--color-brand-primary: #3366ff;');
    expect(htmlTags).toEqual([
      expect.objectContaining({
        tag: 'script',
        children: `import ${JSON.stringify(DEFAULT_CSS_MODULE_ID)};`,
      }),
    ]);
  });

  it('skips HTML injection when injectDefaultCss is false', async () => {
    const workspace = await createWorkspace();
    const configFile = path.join(workspace, 'tokens.config.ts');

    await writeFile(
      configFile,
      `
export default {
  tokens: {
    color: {
      brand: {
        primary: { value: '#3366ff' },
      },
    },
  },
  platforms: {
    css: {
      transformGroup: 'css',
      buildPath: 'css/',
      files: [
        {
          destination: 'tokens.css',
          format: 'css/variables',
        },
      ],
    },
  },
};
      `,
    );

    const [plugin] = designTokensPlugin({
      configFile: 'tokens.config.ts',
      injectDefaultCss: false,
    });
    plugin.configResolved?.({
      root: workspace,
    } as ResolvedConfig);
    await plugin.buildStart?.call({} as never);

    expect(await plugin.transformIndexHtml?.call({} as never, '')).toEqual([]);
  });
});
