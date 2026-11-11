import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createServer, normalizePath, resolveConfig, type Plugin } from 'vite';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { angular, angularCompilationPlugin } from '../index.js';
import {
  createAngularBuildContext,
  getAngularCompilerApi,
  isAngularBuildContext,
  isAngularCompilerPlugin,
} from './angular-build-context.js';
import { buildOptimizerPlugin } from './angular-build-optimizer-plugin.js';
import { jitPlugin } from './angular-jit-plugin.js';
import { angularVitestSourcemapPlugin } from './angular-vitest-plugin.js';
import { compilationApiPlugin } from './compilation-api/compilation-api-plugin.js';
import {
  componentStylesPlugin,
  diagnoseComponentStylesheetPipeline,
  handleDirectComponentStyleHmr,
} from './component-styles-plugin.js';
import { composeAngularPlugins } from './compose-angular-plugins.js';
import { devServerModePlugin } from './dev-server-mode-plugin.js';
import { encapsulationPlugin } from './encapsulation-plugin.js';
import { fastCompilePlugin } from './fast-compile-plugin.js';
import { liveReloadPlugin } from './live-reload-plugin.js';
import { ngpCompilePlugin } from './ngp-compile-plugin.js';
import { ngtscCompilePlugin } from './ngtsc-compile-plugin.js';
import { nxFolderPlugin } from './nx-folder-plugin.js';
import { fileReplacementsPlugin } from './plugins/file-replacements.plugin.js';
import { routerPlugin } from './router-plugin.js';
import { AnalogStylesheetRegistry } from './stylesheet-registry.js';
import { debugHmrV } from './utils/debug.js';
import { angularFullVersion } from './utils/devkit.js';
import { createDepOptimizerConfig } from './utils/plugin-config.js';
import * as rolldownUtils from './utils/rolldown.js';
import { virtualModulesPlugin } from './virtual-modules-plugin.js';

describe('composable Angular Vite plugins', () => {
  const tempDirs: string[] = [];

  function makeTempDir(prefix: string): string {
    const dir = mkdtempSync(join(tmpdir(), prefix));
    tempDirs.push(dir);
    return normalizePath(dir);
  }

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    while (tempDirs.length > 0) {
      const dir = tempDirs.pop()!;
      rmSync(dir, { recursive: true, force: true });
    }
  });

  describe('AngularBuildContext & plugin registration', () => {
    it('identifies AngularBuildContext instances and registers compiler capabilities', async () => {
      const root = makeTempDir('analog-composable-ctx-');
      const tsconfig = join(root, 'tsconfig.json');
      writeFileSync(tsconfig, JSON.stringify({ compilerOptions: {} }), 'utf-8');

      const ctx = createAngularBuildContext({
        tsconfig,
        workspaceRoot: root,
        jit: false,
      });

      expect(isAngularBuildContext(ctx)).toBe(true);
      expect(isAngularBuildContext({})).toBe(false);
      expect(ctx.compiler).toBeUndefined();

      const compiler = fastCompilePlugin(ctx);
      expect(isAngularCompilerPlugin(compiler)).toBe(true);
      expect(ctx.compiler?.name).toBe(
        '@analogjs/vite-plugin-angular-fast-compile',
      );

      await (compiler.config as any)(
        { root, mode: 'development' },
        { command: 'serve', mode: 'development' },
      );

      const api = getAngularCompilerApi([virtualModulesPlugin(ctx), compiler]);
      expect(api?.name).toBe('@analogjs/vite-plugin-angular-fast-compile');
      expect(api?.getTsConfigPath()).toBe(tsconfig);
    });

    it('isolates HMR state across multiple concurrent context instances (no module-global classNames leak)', () => {
      const rootA = makeTempDir('analog-hmr-iso-a-');
      const rootB = makeTempDir('analog-hmr-iso-b-');
      const fileA = normalizePath(join(rootA, 'a.component.ts'));
      const fileB = normalizePath(join(rootB, 'b.component.ts'));

      const ctxA = createAngularBuildContext({
        workspaceRoot: rootA,
        jit: false,
        liveReload: true,
      });
      const ctxB = createAngularBuildContext({
        workspaceRoot: rootB,
        jit: false,
        liveReload: true,
      });

      ctxA.hmr.classNames.set(fileA, 'AComponent');
      ctxA.hmr.setFileEmitter((file) =>
        file === fileA ? { hmrUpdateCode: 'export const a = 1;' } : undefined,
      );

      ctxB.hmr.classNames.set(fileB, 'BComponent');
      ctxB.hmr.setFileEmitter((file) =>
        file === fileB ? { hmrUpdateCode: 'export const b = 2;' } : undefined,
      );

      const reloadA = liveReloadPlugin(ctxA);
      const reloadB = liveReloadPlugin(ctxB);

      const reqA = `\0file:///@ng/component?c=${encodeURIComponent(`${fileA}@AComponent`)}`;
      const reqB = `\0file:///@ng/component?c=${encodeURIComponent(`${fileB}@BComponent`)}`;

      expect((reloadA.load as any)(reqA, { ssr: true })).toBe(
        'export const a = 1;',
      );
      expect((reloadA.load as any)(reqB, { ssr: true })).toBe('');
      expect((reloadB.load as any)(reqB, { ssr: true })).toBe(
        'export const b = 2;',
      );
      expect((reloadB.load as any)(reqA, { ssr: true })).toBe('');

      // Clearing ctxA must not wipe ctxB's HMR registry
      ctxA.hmr.clear();
      expect(ctxA.hmr.classNames.size).toBe(0);
      expect(ctxB.hmr.classNames.get(fileB)).toBe('BComponent');
    });

    it('mounts analogjs-live-reload-plugin at most once across all compilation backends', () => {
      vi.stubEnv('NODE_ENV', 'development');
      vi.stubEnv('VITEST', '');

      const ngtscNames = angular({ jit: false, liveReload: true }).map(
        (p) => p.name,
      );
      const fastNames = angular({
        jit: false,
        fastCompile: true,
        liveReload: true,
      }).map((p) => p.name);
      const ngpNames = angular({
        jit: false,
        compilation: 'ngp',
        liveReload: true,
      }).map((p) => p.name);

      expect(
        ngtscNames.filter((n) => n === 'analogjs-live-reload-plugin'),
      ).toHaveLength(1);
      expect(
        fastNames.filter((n) => n === 'analogjs-live-reload-plugin'),
      ).toHaveLength(1);
      expect(
        ngpNames.filter((n) => n === 'analogjs-live-reload-plugin'),
      ).toHaveLength(1);
    });

    it('applies test-mode liveReload defaults and overrides per backend when VITEST=1', () => {
      vi.stubEnv('VITEST', '1');

      // ngtsc suppresses liveReloadPlugin in test mode even when liveReload: true
      expect(
        angular({ jit: false, liveReload: true }).map((p) => p.name),
      ).not.toContain('analogjs-live-reload-plugin');

      // fastCompile retains liveReloadPlugin when enabled
      expect(
        angular({ jit: false, fastCompile: true, liveReload: true }).map(
          (p) => p.name,
        ),
      ).toContain('analogjs-live-reload-plugin');

      // ngp defaults liveReload to false, and honors explicit liveReload: true
      expect(
        angular({ jit: false, compilation: 'ngp' }).map((p) => p.name),
      ).not.toContain('analogjs-live-reload-plugin');
      expect(
        angular({ jit: false, compilation: 'ngp', liveReload: true }).map(
          (p) => p.name,
        ),
      ).toContain('analogjs-live-reload-plugin');

      if (angularFullVersion >= 200100) {
        expect(
          angularCompilationPlugin({ jit: false, liveReload: true }).map(
            (p) => p.name,
          ),
        ).toContain('analogjs-live-reload-plugin');
      }
    });

    it('registers NGP compiler capabilities on the shared context', () => {
      const ctx = createAngularBuildContext({ jit: false, compilation: 'ngp' });
      const compiler = ngpCompilePlugin(ctx);

      expect(isAngularCompilerPlugin(compiler)).toBe(true);
      expect(ctx.compiler?.name).toBe('@analogjs/vite-plugin-angular-ngp');
      expect(ctx.compiler?.getSourceMap).toBe(compiler.api.getSourceMap);
    });

    it('warns on stylesheet errors during serve and throws during build', async () => {
      const ctx = createAngularBuildContext();
      const logger = { warn: vi.fn() };
      const input = {
        data: '.a {}',
        containingFile: '/project/src/app/demo.component.ts',
        resourceFile: '/project/src/app/demo.component.css',
        eagerTransform: vi.fn().mockRejectedValue(new Error('Unknown utility')),
      };

      ctx.resolvedConfig = { command: 'serve', logger } as any;
      await expect(ctx.styles.transformStylesheet(input)).resolves.toBeNull();
      expect(logger.warn).toHaveBeenCalledOnce();

      ctx.resolvedConfig = { command: 'build', logger } as any;
      await expect(ctx.styles.transformStylesheet(input)).rejects.toThrow(
        /demo\.component\.css.*Unknown utility/s,
      );
    });

    it('registers /.nx/ ignore filter onto ctx.hmr when nxFolderPlugin is composed with context', () => {
      const ctx = createAngularBuildContext();
      expect(
        ctx.hmr.isIgnoredFile('/workspace/.nx/workspace-data/file-map.json'),
      ).toBe(false);
      expect(ctx.hmr.isIgnoredFile('/workspace/tsconfig.tsbuildinfo')).toBe(
        true,
      );

      nxFolderPlugin(ctx);

      expect(
        ctx.hmr.isIgnoredFile('/workspace/.nx/workspace-data/file-map.json'),
      ).toBe(true);
    });
  });

  describe('standalone sub-plugins without AngularBuildContext', () => {
    it('virtualModulesPlugin resolves and loads .html?raw and angular:jit:* resources standalone', async () => {
      const root = makeTempDir('analog-standalone-virtual-');
      const htmlFile = join(root, 'card.component.html');
      const scssFile = join(root, 'card.component.scss');
      const fallbackScssFile = normalizePath(join(root, 'extra.scss'));
      const tsFile = join(root, 'card.component.ts');
      writeFileSync(htmlFile, '<div class="card">Hello</div>', 'utf-8');
      writeFileSync(scssFile, '.card { color: green; }', 'utf-8');

      const plugin = virtualModulesPlugin({ jit: true });
      const resolvedConfig = await resolveConfig(
        { configFile: false, root },
        'serve',
      );
      (plugin.configResolved as any)(resolvedConfig);

      // .html?raw rewrite + load
      const rawId = (plugin.resolveId as any)(
        './card.component.html?raw',
        tsFile,
      );
      expect(rawId).toBeDefined();
      const loadedRaw = await (plugin.load as any).call(
        { addWatchFile: vi.fn() },
        rawId,
      );
      expect(loadedRaw).toContain('<div class=\\"card\\">Hello</div>');

      // angular:jit:template:file rewrite + load
      const jitTplId = (plugin.resolveId as any)(
        'angular:jit:template:file;./card.component.html',
        tsFile,
      );
      const jitTplResolved = (plugin.resolveId as any)(jitTplId, tsFile);
      const loadedJitTpl = await (plugin.load as any).call(
        { addWatchFile: vi.fn() },
        jitTplResolved,
      );
      expect(loadedJitTpl).toContain('Hello');

      // angular:jit:style:file marks style path safe and delegates to ?inline
      const jitStyleId = (plugin.resolveId as any)(
        'angular:jit:style:file;./card.component.scss',
        tsFile,
      );
      expect(jitStyleId).toBe(`${normalizePath(scssFile)}?inline`);
      expect(
        (resolvedConfig as unknown as { safeModulePaths: Set<string> })
          .safeModulePaths,
      ).toContain(normalizePath(scssFile));

      // Vitest load fallback marks un-resolved ?inline style paths safe and returns undefined
      const fallbackResult = await (plugin.load as any).call(
        { addWatchFile: vi.fn() },
        `${fallbackScssFile}?inline`,
      );
      expect(fallbackResult).toBeUndefined();
      expect(
        (resolvedConfig as unknown as { safeModulePaths: Set<string> })
          .safeModulePaths,
      ).toContain(fallbackScssFile);
    });

    it('mounts companion plugins standalone without requiring angular()', () => {
      const root = makeTempDir('analog-standalone-companions-');
      const envDev = join(root, 'env.ts');
      const envProd = join(root, 'env.prod.ts');
      writeFileSync(envDev, 'export const prod = false;', 'utf-8');
      writeFileSync(envProd, 'export const prod = true;', 'utf-8');

      const replacementsPlugin = fileReplacementsPlugin({
        workspaceRoot: root,
        replacements: [{ replace: 'env.ts', with: 'env.prod.ts' }],
      });
      expect(replacementsPlugin).toBeDefined();
      expect(componentStylesPlugin().name).toBe(
        '@analogjs/vite-plugin-angular:component-styles',
      );
      expect(liveReloadPlugin().name).toBe('analogjs-live-reload-plugin');
      expect(jitPlugin({ inlineStylesExtension: 'scss' }).name).toBe(
        '@analogjs/vite-plugin-angular-jit',
      );
      expect(buildOptimizerPlugin({ jit: false }).name).toBe(
        '@analogjs/vite-plugin-angular-optimizer',
      );
      expect(devServerModePlugin().name).toBe(
        '@analogjs/vite-plugin-angular-dev-server-mode',
      );
      expect(routerPlugin({ workspaceRoot: root }).name).toBe(
        'analogjs-router-optimization',
      );
      expect(encapsulationPlugin().name).toBe(
        '@analogjs/vite-plugin-angular:encapsulation',
      );
    });
  });

  describe('custom pipeline composition', () => {
    it('compiles Angular components with a custom minimal ngtsc pipeline', async () => {
      vi.stubEnv('NODE_ENV', 'development');
      vi.stubEnv('VITEST', '');

      const root = makeTempDir('analog-custom-ngtsc-');
      symlinkSync(
        resolve(import.meta.dirname, '../../../../node_modules'),
        join(root, 'node_modules'),
        'junction',
      );
      const tsconfig = join(root, 'tsconfig.json');
      const compPath = join(root, 'hello.component.ts');
      const tplPath = join(root, 'hello.component.html');
      const cssPath = join(root, 'hello.component.css');

      writeFileSync(tplPath, '<span>Custom Pipeline</span>', 'utf-8');
      writeFileSync(cssPath, 'span { color: purple; }', 'utf-8');
      writeFileSync(
        compPath,
        `import { Component } from '@angular/core';
@Component({
  selector: 'app-hello',
  templateUrl: './hello.component.html',
  styleUrl: './hello.component.css',
})
export class HelloComponent {}
`,
        'utf-8',
      );
      writeFileSync(
        tsconfig,
        JSON.stringify({
          compilerOptions: {
            target: 'es2022',
            module: 'esnext',
            moduleResolution: 'bundler',
            sourceMap: true,
            skipLibCheck: true,
            types: [],
          },
          files: ['hello.component.ts'],
        }),
        'utf-8',
      );

      const ctx = createAngularBuildContext({
        tsconfig,
        workspaceRoot: root,
        jit: false,
        liveReload: true,
      });

      // Custom minimal pipeline: NO routerPlugin, NO vitest plugins, NO nxFolderPlugin
      const server = await createServer({
        configFile: false,
        root,
        logLevel: 'silent',
        server: { middlewareMode: true, ws: false, watch: null },
        optimizeDeps: { noDiscovery: true },
        plugins: [
          virtualModulesPlugin(ctx),
          componentStylesPlugin(ctx),
          ngtscCompilePlugin(ctx),
          encapsulationPlugin(),
        ],
      });

      try {
        const transformed = await server.transformRequest(
          '/hello.component.ts',
        );
        expect(transformed?.code).toContain('Custom Pipeline');
        expect(transformed?.code).toContain('ɵcmp');

        // Both hasEmitted and getSourceMap must normalize `/@fs/` module IDs
        const fsPrefixedId = `/@fs/${normalizePath(compPath).replace(/^\//, '')}`;
        expect(ctx.compiler?.hasEmitted?.(fsPrefixedId)).toBe(true);
        expect(ctx.compiler?.getSourceMap?.(fsPrefixedId)).toBeTypeOf('string');
      } finally {
        await server.close();
      }
    }, 30_000);

    it('preserves emitted library .d.ts declarations across watch-mode rebuilds when emptyOutDir runs after buildEnd', async () => {
      vi.stubEnv('NODE_ENV', 'production');
      vi.stubEnv('VITEST', '');

      const root = makeTempDir('analog-ngtsc-lib-watch-');
      symlinkSync(
        resolve(import.meta.dirname, '../../../../node_modules'),
        join(root, 'node_modules'),
        'junction',
      );
      mkdirSync(join(root, 'src'), { recursive: true });
      const outDir = join(root, 'dist');
      const tsconfig = join(root, 'tsconfig.lib.prod.json');
      const entryFile = join(root, 'src', 'hello.ts');

      writeFileSync(entryFile, 'export const greeting = "v1";\n', 'utf-8');
      writeFileSync(
        tsconfig,
        JSON.stringify({
          compilerOptions: {
            target: 'es2022',
            module: 'esnext',
            moduleResolution: 'bundler',
            declaration: true,
            rootDir: './src',
            skipLibCheck: true,
            types: [],
          },
          files: ['src/hello.ts'],
        }),
        'utf-8',
      );

      const ctx = createAngularBuildContext({
        tsconfig,
        workspaceRoot: root,
        jit: false,
      });
      const compiler = ngtscCompilePlugin(ctx);

      const inlineConfig = {
        configFile: false as const,
        root,
        mode: 'production',
        build: {
          outDir: 'dist',
          lib: { entry: 'src/hello.ts', formats: ['es' as const] },
          watch: {},
        },
      };
      await (compiler.config as any)(inlineConfig, {
        command: 'build',
        mode: 'production',
      });
      const resolved = await resolveConfig(inlineConfig, 'build', 'production');
      await (compiler.configResolved as any)(resolved);

      // Build #1: buildStart -> transform -> buildEnd -> renderStart (emptyOutDir) -> closeBundle
      await (compiler.buildStart as any).call({ environment: undefined });
      await (compiler.transform as any).handler.call(
        { addWatchFile: vi.fn(), environment: undefined },
        readFileSync(entryFile, 'utf-8'),
        entryFile,
      );
      await (compiler.buildEnd as any)();
      rmSync(outDir, { recursive: true, force: true });
      await (compiler.closeBundle as any)();

      const dtsPath = join(outDir, 'hello.d.ts');
      expect(existsSync(dtsPath)).toBe(true);
      expect(readFileSync(dtsPath, 'utf-8')).toContain('"v1"');

      // Watch Rebuild #2 on the same plugin instance: stale `closeRequested`
      // must NOT flush declarations in `buildEnd` before `emptyOutDir` clears `dist/`.
      writeFileSync(entryFile, 'export const greeting = "v2";\n', 'utf-8');
      await (compiler.buildStart as any).call({ environment: undefined });
      await (compiler.transform as any).handler.call(
        { addWatchFile: vi.fn(), environment: undefined },
        readFileSync(entryFile, 'utf-8'),
        entryFile,
      );
      await (compiler.buildEnd as any)();
      rmSync(outDir, { recursive: true, force: true });
      await (compiler.closeBundle as any)();

      expect(existsSync(dtsPath)).toBe(true);
      expect(readFileSync(dtsPath, 'utf-8')).toContain('"v2"');
    }, 30_000);

    it('skips redundant Vitest sourcemap OXC re-transform for files already emitted by fastCompilePlugin', async () => {
      const root = makeTempDir('analog-fast-sourcemap-skip-');
      const tsconfig = join(root, 'tsconfig.json');
      const compPath = join(root, 'fast.component.ts');
      writeFileSync(tsconfig, JSON.stringify({ compilerOptions: {} }), 'utf-8');

      const ctx = createAngularBuildContext({
        tsconfig,
        workspaceRoot: root,
        jit: false,
        fastCompile: true,
      });

      const fastPlugin = fastCompilePlugin(ctx);
      const vitestMapPlugin = angularVitestSourcemapPlugin(ctx);

      await (fastPlugin.config as any)(
        { root, mode: 'development' },
        { command: 'serve', mode: 'development' },
      );
      const resolved = await resolveConfig(
        { configFile: false, root },
        'serve',
      );
      await (fastPlugin.configResolved as any)(resolved);
      await (fastPlugin.buildStart as any)();

      const transformHandler = (fastPlugin.transform as any).handler;
      const compiled = await transformHandler.call(
        { addWatchFile: vi.fn(), resolve: async () => null },
        `import { Component } from '@angular/core';
@Component({ selector: 'app-fast', template: '<p>Fast</p>' })
export class FastComponent {}
`,
        compPath,
      );

      expect(compiled?.code).toContain('ɵcmp');
      expect(ctx.compiler?.hasEmitted?.(compPath)).toBe(true);
      expect(ctx.compiler?.getSourceMap?.(compPath)).toBeTypeOf('string');

      // Vitest sourcemap post-plugin should recognize the emitted sourcemap and skip re-transforming
      const postHandler = (vitestMapPlugin.transform as any).handler;
      const postResult = await postHandler(compiled.code, compPath);
      expect(postResult).toBeUndefined();
    });

    it('scans extra files registered via analog.setup addInclude in fastCompilePlugin', async () => {
      const root = makeTempDir('analog-fast-include-');
      mkdirSync(join(root, 'extra'), { recursive: true });
      const tsconfig = join(root, 'tsconfig.json');
      const appFile = join(root, 'app.module.ts');
      const extraFile = join(root, 'extra', 'extra.directive.ts');

      writeFileSync(
        extraFile,
        `import { Directive, NgModule } from '@angular/core';
@Directive({ selector: '[extraDir]', standalone: false })
export class ExtraDir {}
@NgModule({ declarations: [ExtraDir], exports: [ExtraDir] })
export class ExtraModule {}
`,
        'utf-8',
      );
      writeFileSync(
        appFile,
        `import { Component, NgModule } from '@angular/core';
import { ExtraModule } from './extra/extra.directive';
@Component({
  selector: 'app-legacy',
  standalone: false,
  template: '<div extraDir></div>',
})
export class LegacyComponent {}
@NgModule({
  imports: [ExtraModule],
  declarations: [LegacyComponent],
})
export class AppModule {}
`,
        'utf-8',
      );
      // Intentionally omit `extra/extra.directive.ts` from tsconfig `files`
      // and omit relative resolution in `this.resolve` so ONLY `addInclude`
      // puts `ExtraModule` & `ExtraDir` into `scanProject()`!
      writeFileSync(
        tsconfig,
        JSON.stringify({
          compilerOptions: {
            target: 'es2022',
            module: 'esnext',
            moduleResolution: 'bundler',
            skipLibCheck: true,
            types: [],
          },
          files: ['app.module.ts'],
        }),
        'utf-8',
      );

      const ctx = createAngularBuildContext({
        tsconfig,
        workspaceRoot: root,
        jit: false,
        fastCompile: true,
      });
      const fastPlugin = fastCompilePlugin(ctx);

      await (fastPlugin.config as any)(
        { root, mode: 'development' },
        { command: 'build', mode: 'development' },
      );
      const resolved = await resolveConfig(
        {
          configFile: false,
          root,
          plugins: [
            {
              name: 'extra-include-integration',
              analog: {
                setup(analogCtx: any) {
                  analogCtx.addInclude('extra/**/*.ts');
                },
              },
            } as any,
          ],
        },
        'build',
      );
      await (fastPlugin.configResolved as any)(resolved);
      await (fastPlugin.buildStart as any)();

      const transformHandler = (fastPlugin.transform as any).handler;
      const compiled = await transformHandler.call(
        {
          addWatchFile: vi.fn(),
          // Return null so on-demand import resolution cannot find it;
          // proves `scanProject()` included `extra/**/*.ts` from `addInclude`.
          resolve: async () => null,
        },
        `import { Component, NgModule } from '@angular/core';
import { ExtraModule } from '@external-virtual/extra';
@Component({
  selector: 'app-legacy',
  standalone: false,
  template: '<div extraDir></div>',
})
export class LegacyComponent {}
@NgModule({
  imports: [ExtraModule],
  declarations: [LegacyComponent],
})
export class AppModule {}
`,
        appFile,
      );

      expect(compiled?.code).toContain('ExtraDir');
    });
  });

  describe('NGP composability parity (.html?raw & Analog stylePreprocessor)', () => {
    it('serves .html?raw imports and runs analog.setup stylePreprocessor under compilation: ngp', async () => {
      const tmpBase = resolve(import.meta.dirname, '../../../../tmp');
      mkdirSync(tmpBase, { recursive: true });
      const root = normalizePath(mkdtempSync(resolve(tmpBase, 'ngp-compose-')));
      tempDirs.push(root);

      const tsconfig = resolve(root, 'tsconfig.json');
      writeFileSync(
        tsconfig,
        JSON.stringify({
          compilerOptions: { strict: true, skipLibCheck: true, types: [] },
          files: ['app.ts'],
        }),
        'utf-8',
      );
      writeFileSync(
        resolve(root, 'snippet.html'),
        '<section>Raw Snippet</section>',
        'utf-8',
      );
      writeFileSync(resolve(root, 'app.css'), '.box { color: red; }', 'utf-8');
      writeFileSync(
        resolve(root, 'app.ts'),
        `import { Component } from '@angular/core';
import rawSnippet from './snippet.html?raw';

@Component({
  selector: 'app-root',
  template: '<div>{{ snippet }}</div>',
  styleUrl: './app.css',
})
export class App {
  snippet = rawSnippet;
}
`,
        'utf-8',
      );

      vi.stubEnv('VITEST', '');
      vi.stubEnv('NODE_ENV', 'development');

      const stylePreprocessor = vi.fn(
        (code: string) => `${code}\n.injected-by-analog { display: flex; }`,
      );

      const server = await createServer({
        configFile: false,
        root,
        logLevel: 'silent',
        server: { middlewareMode: true, ws: false, watch: null },
        optimizeDeps: { noDiscovery: true },
        plugins: [
          {
            name: 'custom-style-preprocessor',
            analog: {
              setup(analogCtx: any) {
                analogCtx.registerStylePreprocessor(stylePreprocessor);
              },
            },
          } as any,
          ...angular({
            compilation: 'ngp',
            jit: false,
            disableTypeChecking: true,
            tsconfig,
          }),
        ],
      });

      try {
        const appResult = await server.transformRequest('/app.ts');
        expect(appResult?.code).toContain('injected-by-analog');
        expect(stylePreprocessor).toHaveBeenCalled();

        // Verify .html?raw virtual module resolves AND loads under NGP!
        const rawMod = await server.ssrLoadModule('./snippet.html?raw');
        expect(rawMod['default']).toBe('<section>Raw Snippet</section>');
      } finally {
        await server.close();
      }
    }, 30_000);
  });

  describe('compilationApiPlugin parity fixes', () => {
    it.skipIf(angularFullVersion < 200100)(
      'wires Rolldown dep-optimizer load hook when isTest=false, respects development mode over NODE_ENV=production, and includes devServerModePlugin',
      async () => {
        vi.stubEnv('NODE_ENV', 'production');
        vi.stubEnv('VITEST', '');
        vi.spyOn(rolldownUtils, 'isRolldown').mockReturnValue(true);

        const root = makeTempDir('analog-comp-api-rolldown-');
        const subProject = join(root, 'apps', 'web');
        mkdirSync(subProject, { recursive: true });
        const workspaceTsconfig = join(root, 'tsconfig.app.json');
        writeFileSync(
          workspaceTsconfig,
          JSON.stringify({ compilerOptions: {} }),
          'utf-8',
        );

        const plugins = angularCompilationPlugin({
          tsconfig: 'tsconfig.app.json',
          workspaceRoot: root,
          jit: false,
        });

        // Includes devServerModePlugin in non-test mode
        expect(plugins.map((p) => p.name)).toContain(
          '@analogjs/vite-plugin-angular-dev-server-mode',
        );
        expect(plugins.map((p) => p.name)).toContain(
          '@analogjs/vite-plugin-angular:component-styles',
        );

        const compiler = plugins.find(
          (p) => p.name === '@analogjs/vite-plugin-angular-compilation-api',
        )!;
        expect(compiler).toBeDefined();

        // Explicit `mode: 'development'` must win over `NODE_ENV=production` (#2458/#2462)
        // AND workspaceRoot fallback must find `tsconfig.app.json` from `root` when Vite root is `apps/web`.
        const cfg = await (compiler.config as any)(
          { root: subProject, mode: 'development' },
          { command: 'serve', mode: 'development' },
        );

        expect(compiler.api.getTsConfigPath()).toBe(workspaceTsconfig);

        const rolldownDepPlugin = cfg?.optimizeDeps?.rolldownOptions
          ?.plugins?.[0] as Plugin;
        expect(rolldownDepPlugin).toBeDefined();
        // Previously broken: `createRolldownCompilerPlugin(opts, !isAstro)` passed `true` as `isTest`,
        // which omitted the `load` linker hook in non-test builds!
        expect(typeof rolldownDepPlugin.load).toBe('object');
        expect(typeof rolldownDepPlugin.buildEnd).toBe('function');

        //Also verify composeAngularPlugins({ compilationBackend: 'compilation-api' }) selects compilationApiPlugin
        const composed = composeAngularPlugins({
          compilationBackend: 'compilation-api',
          tsconfig: workspaceTsconfig,
          workspaceRoot: root,
          jit: false,
        });
        expect(composed.map((p) => p.name)).toContain(
          '@analogjs/vite-plugin-angular-compilation-api',
        );
        expect(
          compilationApiPlugin({
            tsconfig: workspaceTsconfig,
            workspaceRoot: root,
            jit: false,
          }).name,
        ).toBe('@analogjs/vite-plugin-angular-compilation-api');
      },
    );

    it('preserves JIT compiler options during esbuild dependency optimization when jit: true', () => {
      vi.spyOn(rolldownUtils, 'isRolldown').mockReturnValue(false);
      const root = makeTempDir('analog-dep-opt-jit-');
      const tsconfig = join(root, 'tsconfig.json');
      writeFileSync(tsconfig, JSON.stringify({ compilerOptions: {} }), 'utf-8');

      const jitConfig = createDepOptimizerConfig({
        tsconfig,
        isProd: false,
        jit: true,
        watchMode: true,
        isTest: false,
        isAstroIntegration: false,
      });
      expect(jitConfig.optimizeDeps.esbuildOptions?.define).not.toHaveProperty(
        'ngJitMode',
      );
      expect(jitConfig.optimizeDeps.esbuildOptions?.define).toMatchObject({
        ngI18nClosureMode: 'false',
      });

      const aotConfig = createDepOptimizerConfig({
        tsconfig,
        isProd: false,
        jit: false,
        watchMode: true,
        isTest: false,
        isAstroIntegration: false,
      });
      expect(aotConfig.optimizeDeps.esbuildOptions?.define).toMatchObject({
        ngJitMode: 'false',
        ngI18nClosureMode: 'false',
      });
    });

    it('skips diagnostic preprocessing when verbose HMR logging is disabled, preprocesses once when enabled, and never blocks CSS HMR on diagnostic errors', async () => {
      const root = makeTempDir('analog-style-hmr-diag-');
      const cssFile = normalizePath(join(root, 'card.component.css'));
      writeFileSync(cssFile, '.card { color: red; }', 'utf-8');

      const registry = new AnalogStylesheetRegistry();
      const publicId = 'hash123.css';
      registry.registerExternalRequest(publicId, cssFile);
      registry.registerServedStylesheet(
        {
          publicId,
          sourcePath: cssFile,
          originalCode: '.card { color: red; }',
          normalizedCode: '/* @ref */\n.card { color: red; }',
        },
        [cssFile],
      );
      registry.registerActiveRequest(`/${publicId}?direct&ngcomp=ng-c1`);

      const directModule = {
        id: `/${publicId}?direct&ngcomp=ng-c1`,
        url: `/${publicId}?direct&ngcomp=ng-c1`,
        file: cssFile,
        type: 'css',
      } as any;
      const wrapperModule = {
        id: `/${publicId}?ngcomp=ng-c1`,
        url: `/${publicId}?ngcomp=ng-c1`,
        file: cssFile,
        type: 'js',
      } as any;

      const wsSend = vi.fn();
      const invalidateModule = vi.fn();
      const server = {
        ws: { send: wsSend },
        moduleGraph: {
          invalidateModule,
          getModuleByUrl: async (url: string) =>
            url === wrapperModule.url ? wrapperModule : undefined,
          getModuleById: (id: string) =>
            id === wrapperModule.id ? wrapperModule : undefined,
        },
      } as any;

      const prevEnabled = debugHmrV.enabled;
      try {
        // 1. Verbose logging disabled -> stylePreprocessor must NOT run during HMR
        debugHmrV.enabled = false;
        const disabledPreprocessor = vi.fn((code: string) => ({
          code: `/* @ref */\n${code}`,
        }));
        await handleDirectComponentStyleHmr({
          server,
          file: cssFile,
          directModule,
          fileModules: [directModule, wrapperModule],
          stylesheetRegistry: registry,
          stylePreprocessor: disabledPreprocessor,
        });
        expect(disabledPreprocessor).not.toHaveBeenCalled();
        expect(wsSend).toHaveBeenCalledWith(
          expect.objectContaining({ type: 'update' }),
        );

        // 2. Direct diagnosis call -> preprocesses sourceCode at most once
        const oncePreprocessor = vi.fn((code: string) => ({
          code: `/* @ref */\n${code}`,
        }));
        const diagnosis = diagnoseComponentStylesheetPipeline(
          cssFile,
          directModule,
          registry,
          [wrapperModule],
          oncePreprocessor,
        );
        expect(oncePreprocessor).toHaveBeenCalledTimes(1);
        expect(diagnosis.anomalies).toEqual([]);

        // 3. Verbose logging enabled with throwing preprocessor -> CSS HMR still succeeds
        wsSend.mockClear();
        debugHmrV.enabled = true;
        const throwingPreprocessor = vi.fn(() => {
          throw new Error('stateful preprocessor failure');
        });
        await expect(
          handleDirectComponentStyleHmr({
            server,
            file: cssFile,
            directModule,
            fileModules: [directModule, wrapperModule],
            stylesheetRegistry: registry,
            stylePreprocessor: throwingPreprocessor,
          }),
        ).resolves.toBeDefined();
        expect(wsSend).toHaveBeenCalledWith(
          expect.objectContaining({ type: 'update' }),
        );
      } finally {
        debugHmrV.enabled = prevEnabled;
      }
    });
  });
});
