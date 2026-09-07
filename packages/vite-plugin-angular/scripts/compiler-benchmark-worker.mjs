// Copied into each installed consumer by compiler-benchmark.mjs so bare imports
// resolve that consumer's exact package and toolchain, without workspace aliases.
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { performance } from 'node:perf_hooks';

const require = createRequire(import.meta.url);
assert.equal(process.version, 'v24.15.0');
globalThis.gc();
const beforeImport = process.memoryUsage();
const importCpuStart = process.cpuUsage();
const importStart = performance.now();
const { default: angular } = await import('@analogjs/vite-plugin-angular');
const importMs = performance.now() - importStart;
const importCpu = process.cpuUsage(importCpuStart);
globalThis.gc();
const afterImport = process.memoryUsage();
const { build } = await import('vite');
const fastCompile = process.env.ANALOG_PERF_FAST === '1';
const useAngularCompilationAPI = process.env.ANALOG_PERF_API === '1';
const root = join(process.cwd(), 'benchmark-project');
await mkdir(root, { recursive: true });
const files = [];
for (let index = 0; index < 20; index++) {
  const file = `component-${index}.ts`;
  files.push(file);
  await writeFile(
    join(root, file),
    `import { Component } from '@angular/core';
@Component({selector:'bench-${index}',standalone:true,template:'<p>benchmark ${index}</p>'})
export class Component${index} { readonly value: number = ${index}; }`,
  );
}
await writeFile(
  join(root, 'index.ts'),
  files.map((file) => `export * from './${file}';`).join('\n'),
);
await writeFile(
  join(root, 'tsconfig.json'),
  JSON.stringify({
    files: ['index.ts'],
    compilerOptions: {
      target: 'es2022',
      module: 'esnext',
      moduleResolution: 'bundler',
      experimentalDecorators: true,
      skipLibCheck: true,
      types: [],
    },
  }),
);
const retainedPlugins = [];
const constructMs = [];
const buildMs = [];
const buildCpu = [];
const heapAfterClose = [];
for (let cycle = 0; cycle < 3; cycle++) {
  const constructStart = performance.now();
  const plugins = angular({
    workspaceRoot: root,
    tsconfig: join(root, 'tsconfig.json'),
    jit: false,
    liveReload: false,
    fastCompile,
    fastCompileMode: 'full',
    experimental: { useAngularCompilationAPI },
  });
  retainedPlugins.push(plugins);
  constructMs.push(performance.now() - constructStart);
  const start = performance.now();
  const cpuStart = process.cpuUsage();
  await build({
    root,
    configFile: false,
    logLevel: 'silent',
    plugins,
    build: {
      minify: false,
      sourcemap: false,
      outDir: join(root, 'output'),
      lib: {
        entry: join(root, 'index.ts'),
        formats: ['es'],
        fileName: 'result',
      },
      rollupOptions: { external: ['@angular/core'] },
    },
  });
  buildMs.push(performance.now() - start);
  buildCpu.push(process.cpuUsage(cpuStart));
  const output = await readFile(join(root, 'output/result.js'), 'utf8');
  assert.equal((output.match(/defineComponent\(/g) ?? []).length, 20);
  globalThis.gc();
  heapAfterClose.push(process.memoryUsage().heapUsed);
}
const result = {
  node: process.version,
  angular: require('@angular/core/package.json').version,
  typescript: require('typescript/package.json').version,
  vite: require('vite/package.json').version,
  fastCompile,
  useAngularCompilationAPI,
  importMs,
  importCpu,
  importHeapBytes: afterImport.heapUsed - beforeImport.heapUsed,
  importRssBytes: afterImport.rss - beforeImport.rss,
  buildMs,
  buildCpu,
  constructMs,
  heapAfterClose,
  retainedPluginSets: retainedPlugins.length,
};
await writeFile(process.argv[2], JSON.stringify(result, null, 2));
