import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { BuilderContext, BuilderOutput } from '@angular-devkit/architect';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@angular-devkit/architect', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@angular-devkit/architect')>();
  return {
    ...actual,
    createBuilder: (fn: unknown) => fn,
  };
});

import viteBuilderDefault from './vite-build.impl';
import type { ViteBuildSchema } from './schema';

const viteBuilder = viteBuilderDefault as (
  options: ViteBuildSchema,
  context: BuilderContext,
) => Promise<BuilderOutput>;

function createMockContext(workspaceRoot: string): BuilderContext {
  return {
    workspaceRoot,
    target: {
      project: 'test-app',
      target: 'build',
      configuration: 'production',
    },
    logger: {
      warn: vi.fn(),
      info: vi.fn(),
      error: vi.fn(),
    },
    getProjectMetadata: vi.fn().mockResolvedValue({ root: workspaceRoot }),
    getBuilderNameForTarget: vi
      .fn()
      .mockResolvedValue('@analogjs/vite-plugin-angular:build'),
    getTargetOptions: vi.fn().mockResolvedValue({}),
    validateOptions: vi.fn().mockResolvedValue({}),
  } as unknown as BuilderContext;
}

describe('viteBuilder', () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('builds a client-only Vite config without failing on an unconfigured ssr environment', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'analog-vite-builder-client-'));
    tempDirs.push(dir);

    writeFileSync(
      join(dir, 'index.html'),
      '<!doctype html><html><body><script type="module" src="/main.js"></script></body></html>\n',
    );
    writeFileSync(join(dir, 'main.js'), 'console.log("client-only");\n');
    writeFileSync(
      join(dir, 'vite.config.mjs'),
      `export default { logLevel: 'silent' };\n`,
    );

    const outDir = join(dir, 'dist', 'client');
    const result = await viteBuilder(
      {
        configFile: join(dir, 'vite.config.mjs'),
        outputPath: outDir,
      },
      createMockContext(dir),
    );

    expect(result.success).toBe(true);
    expect(existsSync(join(outDir, 'index.html'))).toBe(true);
  });

  it('runs custom builder.buildApp when a plugin configures config.builder', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'analog-vite-builder-app-'));
    tempDirs.push(dir);

    const markerFile = join(dir, 'build-app-ran.txt');
    writeFileSync(
      join(dir, 'index.html'),
      '<!doctype html><html><body><script type="module" src="/main.js"></script></body></html>\n',
    );
    writeFileSync(join(dir, 'main.js'), 'console.log("multi-env");\n');
    writeFileSync(
      join(dir, 'vite.config.mjs'),
      `import { writeFileSync } from 'node:fs';
export default {
  logLevel: 'silent',
  builder: {
    async buildApp(builder) {
      await builder.build(builder.environments.client);
      writeFileSync(${JSON.stringify(markerFile)}, 'ok');
    },
  },
};
`,
    );

    const outDir = join(dir, 'dist', 'client');
    const result = await viteBuilder(
      {
        configFile: join(dir, 'vite.config.mjs'),
        outputPath: outDir,
      },
      createMockContext(dir),
    );

    expect(result.success).toBe(true);
    expect(existsSync(join(outDir, 'index.html'))).toBe(true);
    expect(existsSync(markerFile)).toBe(true);
  });
});
