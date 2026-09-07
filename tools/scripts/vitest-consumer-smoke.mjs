#!/usr/bin/env node
// Run through: pnpm exec nx run vitest-angular:consumer-smoke
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { execa, execaSync } from 'execa';
import { parseArgs, stripVTControlCharacters } from 'node:util';

const { values } = parseArgs({
  options: {
    case: { type: 'string', default: 'all' },
    vitest: { type: 'string', default: '5.0.0' },
    vite: { type: 'string', default: 'workspace' },
  },
});
if (
  !['all', 'templates', 'builders'].includes(values.case) ||
  !['5.0.0', '4.1.4'].includes(values.vitest) ||
  !['workspace', '7.0.0'].includes(values.vite)
)
  throw new Error(
    'Use --case=all|templates|builders, --vitest=5.0.0|4.1.4, --vite=workspace|7.0.0',
  );
if (values.vitest !== '5.0.0' && values.case !== 'builders')
  throw new Error('Older Vitest qualification uses --case=builders');

const workspace = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const workspaceRequire = createRequire(join(workspace, 'package.json'));
const version = (name) => workspaceRequire(`${name}/package.json`).version;
const output = join(workspace, 'dist/vitest-consumer-smoke');
mkdirSync(output, { recursive: true });
const root = mkdtempSync(join(output, 'run-'));
const env = {
  ...process.env,
  CI: 'true',
  NX_DAEMON: 'false',
  NX_NO_CLOUD: 'true',
  PLAYWRIGHT_SKIP_BROWSER_GC: '1',
};
const packed = {};
const results = [];

function run(cwd, command, args) {
  execaSync(command, args, { cwd, env, stdio: 'inherit', timeout: 240000 });
}

for (const project of [
  'vite-plugin-angular',
  'vitest-angular',
  'platform',
  'router',
  'content',
]) {
  const directory = join(workspace, 'packages', project, 'dist');
  const manifest = JSON.parse(
    readFileSync(join(directory, 'package.json'), 'utf8'),
  );
  const artifact = JSON.parse(
    execaSync(
      'npm',
      ['pack', '--json', '--ignore-scripts', '--pack-destination', root],
      { cwd: directory },
    ).stdout,
  )[0];
  packed[manifest.name] = `file:${join(root, artifact.filename)}`;
}

function install(project, manifest) {
  const localPackages = Object.fromEntries(
    Object.entries(packed).map(([name, reference]) => [
      name,
      `file:${relative(project, reference.slice(5)).replaceAll('\\', '/')}`,
    ]),
  );
  for (const section of ['dependencies', 'devDependencies']) {
    for (const name of Object.keys(manifest[section] ?? {})) {
      if (localPackages[name]) manifest[section][name] = localPackages[name];
    }
    if (values.vite !== 'workspace' && manifest[section]?.vite)
      manifest[section].vite = values.vite;
  }
  manifest.pnpm = {
    ...manifest.pnpm,
    overrides: { ...manifest.pnpm?.overrides, ...localPackages },
  };
  writeFileSync(
    join(project, 'package.json'),
    JSON.stringify(manifest, null, 2) + '\n',
  );
  run(project, 'pnpm', [
    'install',
    '--ignore-workspace',
    '--ignore-scripts',
    '--no-frozen-lockfile',
    '--prefer-offline',
  ]);
  run(project, 'pnpm', [
    'install',
    '--ignore-workspace',
    '--ignore-scripts',
    '--frozen-lockfile',
  ]);
}

for (const template of values.case === 'builders'
  ? []
  : ['latest', 'minimal', 'blog']) {
  run(root, process.execPath, [
    join(workspace, 'dist/packages/create-analog/index.js'),
    template,
    '--template',
    template,
    '--skipTailwind',
    'true',
    '--skipGit',
    'true',
  ]);
  const project = join(root, template);
  const manifest = JSON.parse(
    readFileSync(join(project, 'package.json'), 'utf8'),
  );
  assert.equal(
    manifest.devDependencies.vitest,
    '^5.0.0',
    `${template}: generated Vitest version`,
  );
  assert.ok(
    readFileSync(join(project, '.gitignore'), 'utf8').includes('.vitest/'),
  );
  install(project, manifest);
  run(project, 'pnpm', ['exec', 'vitest', 'run']);
  results.push({ name: `generated-${template}`, passed: true });
}

if (values.case === 'templates') {
  writeFileSync(
    join(root, 'result.json'),
    JSON.stringify({ node: process.version, results }, null, 2) + '\n',
  );
  console.log(JSON.stringify(results, null, 2));
  process.exit(0);
}

const project = join(root, 'angular-workspace');
const source = join(project, 'projects/demo/src');
mkdirSync(source, { recursive: true });
install(project, {
  name: 'analog-vitest-builder-fixture',
  private: true,
  type: 'module',
  dependencies: {
    '@analogjs/vite-plugin-angular': packed['@analogjs/vite-plugin-angular'],
    '@analogjs/vitest-angular': packed['@analogjs/vitest-angular'],
    '@angular/core': version('@angular/core'),
    '@angular/common': version('@angular/common'),
    '@angular/compiler': version('@angular/compiler'),
    '@angular/compiler-cli': version('@angular/compiler-cli'),
    '@angular/platform-browser': version('@angular/platform-browser'),
    '@angular/build': version('@angular/build'),
    '@angular/cli': version('@angular/cli'),
    '@vitest/coverage-v8': values.vitest,
    '@vitest/ui': values.vitest,
    '@vitest/browser-playwright': values.vitest,
    playwright: version('playwright'),
    vite: values.vite === 'workspace' ? version('vite') : values.vite,
    vitest: values.vitest,
    typescript: version('typescript'),
    jsdom: version('jsdom'),
    rxjs: version('rxjs'),
    tslib: version('tslib'),
  },
});

writeFileSync(
  join(source, 'component.ts'),
  `import { Component } from '@angular/core'; @Component({ selector: 'app-smoke', standalone: true, template: '<p>{{ label }}</p>' }) export class SmokeComponent { label = 'Vitest builder'; }`,
);
writeFileSync(
  join(source, 'test-setup.ts'),
  `import '@angular/compiler'; import { setupTestBed } from '@analogjs/vitest-angular/setup-testbed'; setupTestBed();`,
);
writeFileSync(
  join(source, 'component.spec.ts'),
  `import { describe, it, expect } from 'vitest'; import { TestBed } from '@angular/core/testing'; import { SmokeComponent } from './component'; describe('installed builder', () => { it('compiles a component', () => { const fixture = TestBed.createComponent(SmokeComponent); fixture.detectChanges(); expect(fixture.nativeElement.textContent).toBe('Vitest builder'); }); it('supports snapshots', () => { expect({ label: 'Vitest builder' }).toMatchSnapshot(); }); });`,
);
writeFileSync(
  join(project, 'projects/demo/tsconfig.spec.json'),
  JSON.stringify({
    compilerOptions: {
      target: 'es2022',
      module: 'esnext',
      moduleResolution: 'bundler',
      experimentalDecorators: true,
      skipLibCheck: true,
      types: ['vitest/globals', 'node'],
    },
    include: ['src/**/*.ts'],
  }),
);
writeFileSync(
  join(project, 'projects/demo/vite.config.ts'),
  `import { defineConfig } from 'vitest/config'; import angular from '@analogjs/vite-plugin-angular'; export default defineConfig({ plugins: [angular({ tsconfig: 'tsconfig.spec.json' })], test: { environment: 'jsdom', setupFiles: ['src/test-setup.ts'], include: ['src/**/*.spec.ts'] } });`,
);
writeFileSync(
  join(project, 'projects/demo/vitest.config.ts'),
  `import { defineConfig } from 'vitest/config'; export default defineConfig({ test: { include: ['src/**/*.spec.ts'] } });`,
);
writeFileSync(
  join(source, 'test-setup.browser.ts'),
  `import '@angular/compiler'; import { setupTestBed } from '@analogjs/vitest-angular/setup-testbed'; setupTestBed({ browserMode: true });`,
);
writeFileSync(
  join(project, 'projects/demo/vite.browser.config.ts'),
  `import { defineConfig } from 'vitest/config'; import angular from '@analogjs/vite-plugin-angular'; import { playwright } from '@vitest/browser-playwright'; export default defineConfig({ plugins: [angular({ tsconfig: 'tsconfig.spec.json' })], test: { setupFiles: ['src/test-setup.browser.ts'], include: ['src/component.spec.ts'], browser: { enabled: true, headless: true, provider: playwright(), instances: [{ browser: 'chromium' }] } } });`,
);
writeFileSync(
  join(project, 'angular.json'),
  JSON.stringify(
    {
      version: 1,
      cli: { analytics: false },
      projects: {
        demo: {
          projectType: 'application',
          root: 'projects/demo',
          sourceRoot: 'projects/demo/src',
          architect: {
            test: {
              builder: '@analogjs/vitest-angular:test',
              options: { configFile: 'projects/demo/vite.config.ts' },
            },
            browser: {
              builder: '@analogjs/vitest-angular:test',
              options: { configFile: 'projects/demo/vite.browser.config.ts' },
            },
            'build-test': {
              builder: '@analogjs/vitest-angular:build-test',
              options: {
                configFile: 'projects/demo/vitest.config.ts',
                tsConfig: 'projects/demo/tsconfig.spec.json',
                setupFile: 'projects/demo/src/test-setup.ts',
              },
            },
          },
        },
      },
    },
    null,
    2,
  ),
);

run(project, 'pnpm', [
  'exec',
  'ng',
  'test',
  'demo',
  '--watch=false',
  '--update=true',
]);
run(project, 'pnpm', [
  'exec',
  'ng',
  'test',
  'demo',
  '--watch=false',
  '--coverage=true',
]);
const coverage = JSON.parse(
  readFileSync(
    join(project, 'projects/demo/coverage/coverage-final.json'),
    'utf8',
  ),
);
const componentCoverage = Object.entries(coverage).find(([file]) =>
  file.replaceAll('\\', '/').endsWith('/src/component.ts'),
)?.[1];
assert.ok(
  componentCoverage &&
    Object.values(componentCoverage.s).some((count) => count > 0),
  'coverage contains executed component statements',
);
run(project, 'pnpm', ['exec', 'ng', 'run', 'demo:build-test', '--watch=false']);
results.push({
  name: 'angular-builders-root-invocation',
  passed: true,
  scenarios: ['test', 'snapshot-update', 'coverage', 'build-test'],
});

if (values.vitest === '5.0.0') {
  run(project, 'pnpm', [
    'exec',
    'playwright',
    'install',
    'chromium',
    ...(process.env.CI ? ['--with-deps'] : []),
  ]);
  run(project, 'pnpm', ['exec', 'ng', 'run', 'demo:browser', '--watch=false']);
  results.push({ name: 'angular-browser-builder', passed: true });
}

const componentSource = readFileSync(join(source, 'component.ts'), 'utf8');
writeFileSync(
  join(source, 'component.ts'),
  componentSource.replace("'Vitest builder'", "'Changed value'"),
);
try {
  for (const target of ['test', 'build-test']) {
    const failed = execaSync(
      'pnpm',
      ['exec', 'ng', 'run', `demo:${target}`, '--watch=false'],
      {
        cwd: project,
        env,
        reject: false,
        timeout: 120000,
      },
    );
    assert.notEqual(
      failed.exitCode,
      0,
      `${target}: failed assertions must fail the command`,
    );
    assert.ok(
      `${failed.stdout}\n${failed.stderr}`.includes('AssertionError'),
      `${target}: observed the intended assertion failure`,
    );
    results.push({ name: `${target}-failure-propagation`, passed: true });
  }
} finally {
  writeFileSync(join(source, 'component.ts'), componentSource);
}

async function checkUi() {
  const projectRequire = createRequire(join(project, 'package.json'));
  const ng = join(
    dirname(projectRequire.resolve('@angular/cli/package.json')),
    'bin/ng.js',
  );
  const child = execa(
    process.execPath,
    [ng, 'test', 'demo', '--watch=true', '--ui=true'],
    { cwd: project, env, reject: false, stdout: 'pipe', stderr: 'pipe' },
  );
  let output = '';
  try {
    const url = await new Promise((resolveUrl, rejectUrl) => {
      const deadline = setTimeout(
        () =>
          rejectUrl(
            new Error('Vitest UI did not announce an authenticated URL'),
          ),
        30000,
      );
      const inspectOutput = (chunk) => {
        output += String(chunk);
        const address = stripVTControlCharacters(output)
          .split(/\s+/)
          .find(
            (word) =>
              word.startsWith('http://') &&
              word.includes('/__vitest__/?token='),
          );
        if (address) {
          clearTimeout(deadline);
          resolveUrl(new URL(address));
        }
      };
      child.stdout.on('data', inspectOutput);
      child.stderr.on('data', inspectOutput);
      child.on('exit', () => {
        clearTimeout(deadline);
        rejectUrl(new Error('Vitest UI stopped before announcing its URL'));
      });
    });
    assert.ok(['localhost', '127.0.0.1'].includes(url.hostname));
    const authenticated = await fetch(url, {
      redirect: 'manual',
      signal: AbortSignal.timeout(10000),
    });
    assert.equal(authenticated.status, 302);
    const cookie = authenticated.headers.get('set-cookie')?.split(';')[0];
    assert.ok(cookie);
    const destination = new URL(authenticated.headers.get('location'), url);
    assert.equal(destination.origin, url.origin);
    const response = await fetch(destination, {
      headers: { cookie },
      signal: AbortSignal.timeout(10000),
    });
    assert.equal(response.status, 200);
    results.push({ name: 'authenticated-vitest-ui', passed: true });
  } finally {
    child.kill('SIGTERM');
    const forceKill = setTimeout(() => child.kill('SIGKILL'), 5000);
    try {
      await child;
    } finally {
      clearTimeout(forceKill);
    }
  }
}

if (values.vitest === '5.0.0') await checkUi();
const report = { node: process.version, vitest: values.vitest, results };
writeFileSync(
  join(root, 'result.json'),
  JSON.stringify(report, null, 2) + '\n',
);
console.log(JSON.stringify(report, null, 2));
console.log(`Consumer evidence retained at ${root}`);
