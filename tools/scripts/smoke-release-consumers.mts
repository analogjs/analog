#!/usr/bin/env node

import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import {
  createWriteStream,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import net from 'node:net';
import { createDebug, enable } from 'obug';

if (process.env['SMOKE_VERBOSE'] === 'true') {
  enable('smoke:*');
}

const log = createDebug('smoke:run');
const logTest = createDebug('smoke:test');

interface PackedArtifact {
  packageName: string;
  tarballPath: string;
}

interface RootPackageJson {
  version: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const workspacePackageJson = JSON.parse(
  readFileSync(resolve(root, 'package.json'), 'utf8'),
) as RootPackageJson;
const analogVersion = workspacePackageJson.version;
const nxVersion = workspacePackageJson.devDependencies?.['nx'] ?? 'latest';
const angularCliVersion =
  workspacePackageJson.devDependencies?.['@angular/cli'] ?? 'latest';
const workspaceVersions = {
  ...(workspacePackageJson.dependencies ?? {}),
  ...(workspacePackageJson.devDependencies ?? {}),
  '@analogjs/astro-angular': analogVersion,
  '@analogjs/content': analogVersion,
  '@analogjs/platform': analogVersion,
  '@analogjs/router': analogVersion,
  '@analogjs/storybook-angular': analogVersion,
  '@analogjs/vite-plugin-angular': analogVersion,
  '@analogjs/vite-plugin-nitro': analogVersion,
  '@analogjs/vitest-angular': analogVersion,
};

function run(
  command: string,
  args: string[],
  options: { cwd?: string; env?: NodeJS.ProcessEnv } = {},
): void {
  const cwd = options.cwd ?? root;
  const label = `${command} ${args.join(' ')}`;
  log('%s (cwd: %s)', label, cwd);

  try {
    execFileSync(command, args, {
      cwd,
      env: options.env ?? process.env,
      stdio: 'inherit',
    });
  } catch (error: unknown) {
    const exitCode =
      error && typeof error === 'object' && 'status' in error
        ? (error as { status: number | null }).status
        : null;
    const signal =
      error && typeof error === 'object' && 'signal' in error
        ? (error as { signal: string | null }).signal
        : null;

    const hints: string[] = [];
    if (exitCode === 127) {
      hints.push(
        'Exit code 127 means the command was not found.',
        `Verify that "${command}" is installed and available in PATH.`,
      );
    } else if (exitCode === 126) {
      hints.push(
        'Exit code 126 means the command was found but not executable.',
      );
    }

    const details = [
      `Smoke-test command failed:`,
      `  command: ${label}`,
      `  cwd:     ${cwd}`,
      `  exit:    ${exitCode ?? 'unknown'}`,
      signal ? `  signal:  ${signal}` : '',
      ...hints.map((h) => `  hint:    ${h}`),
    ]
      .filter(Boolean)
      .join('\n');

    throw new Error(details, { cause: error });
  }
}

const npmUserAgent = [
  'npm/10.0.0',
  `node/${process.versions.node}`,
  `${process.platform} ${process.arch}`,
].join(' ');

function createNpmChildEnv(
  overrides: NodeJS.ProcessEnv = {},
): NodeJS.ProcessEnv {
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([key]) => !/^npm_config_/i.test(key)),
  ) as NodeJS.ProcessEnv;

  return {
    ...env,
    CI: 'true',
    npm_config_user_agent: npmUserAgent,
    ...overrides,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}

function isRegistryVersion(version: string): boolean {
  return !version.includes(':') && !version.startsWith('workspace');
}

function syncProjectPackageVersions(projectDir: string): void {
  const packageJsonPath = resolve(projectDir, 'package.json');
  const packageJson = JSON.parse(
    readFileSync(packageJsonPath, 'utf8'),
  ) as Record<string, unknown>;

  for (const field of [
    'dependencies',
    'devDependencies',
    'peerDependencies',
    'optionalDependencies',
  ]) {
    const dependencies = packageJson[field];
    if (!dependencies || typeof dependencies !== 'object') {
      continue;
    }

    for (const [name, version] of Object.entries(
      dependencies as Record<string, string>,
    )) {
      const workspaceVersion = workspaceVersions[name];
      if (
        workspaceVersion &&
        typeof version === 'string' &&
        isRegistryVersion(workspaceVersion)
      ) {
        (dependencies as Record<string, string>)[name] = workspaceVersion;
      }
    }
  }

  writeFileSync(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`);
}

async function getAvailablePort(): Promise<number> {
  return new Promise((resolvePromise, rejectPromise) => {
    const server = net.createServer();
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close();
        rejectPromise(new Error('Could not determine an open local port.'));
        return;
      }

      const { port } = address;
      server.close((error) => {
        if (error) {
          rejectPromise(error);
          return;
        }

        resolvePromise(port);
      });
    });
    server.on('error', rejectPromise);
  });
}

async function waitForPort(port: number): Promise<void> {
  for (let attempt = 0; attempt < 30; attempt++) {
    const connected = await new Promise<boolean>((resolvePromise) => {
      const socket = net.createConnection({ host: '127.0.0.1', port }, () => {
        socket.end();
        resolvePromise(true);
      });

      socket.on('error', () => resolvePromise(false));
    });

    if (connected) {
      return;
    }

    await sleep(1000);
  }

  throw new Error(`Timed out waiting for the local registry on port ${port}.`);
}

async function startLocalRegistry(
  scratchDir: string,
  npmEnv: NodeJS.ProcessEnv,
): Promise<{ process: ChildProcess; registryUrl: string; logPath: string }> {
  const port = await getAvailablePort();
  const registryUrl = `http://127.0.0.1:${port}`;
  const logPath = resolve(scratchDir, 'verdaccio.log');
  const configPath = resolve(scratchDir, 'verdaccio.yaml');
  const logStream = createWriteStream(logPath, { flags: 'a' });

  writeFileSync(
    configPath,
    [
      `storage: ${resolve(scratchDir, 'verdaccio-storage')}`,
      'uplinks:',
      '  npmjs:',
      '    url: https://registry.npmjs.org/',
      'packages:',
      "  '@analogjs/*':",
      '    access: $all',
      '    publish: $anonymous',
      "  'create-analog':",
      '    access: $all',
      '    publish: $anonymous',
      "  '@*/*':",
      '    access: $all',
      '    publish: $anonymous',
      '    proxy: npmjs',
      "  '**':",
      '    access: $all',
      '    publish: $anonymous',
      '    proxy: npmjs',
      'server:',
      '  keepAliveTimeout: 60',
      'log:',
      '  - { type: stdout, format: pretty, level: http }',
      '',
    ].join('\n'),
  );

  const registryProcess = spawn(
    'npm',
    [
      'exec',
      '--yes',
      '--package=verdaccio@6',
      'verdaccio',
      '--',
      '--config',
      configPath,
      '--listen',
      `127.0.0.1:${port}`,
    ],
    {
      cwd: root,
      env: npmEnv,
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );

  registryProcess.stdout?.pipe(logStream);
  registryProcess.stderr?.pipe(logStream);

  try {
    await waitForPort(port);
  } catch (error) {
    registryProcess.kill('SIGTERM');
    throw new Error(
      `Failed to start the local registry. See ${logPath} for details.\n${String(error)}`,
    );
  }

  return { process: registryProcess, registryUrl, logPath };
}

async function stopLocalRegistry(registryProcess: ChildProcess): Promise<void> {
  registryProcess.kill('SIGTERM');

  for (let attempt = 0; attempt < 10; attempt++) {
    if (registryProcess.exitCode !== null) {
      return;
    }

    await sleep(250);
  }

  registryProcess.kill('SIGKILL');
}

function createLocalNpmrc(scratchDir: string, registryUrl: string): string {
  const npmrcPath = resolve(scratchDir, 'smoke.npmrc');
  const registryHost = registryUrl.replace(/^https?:/, '');

  writeFileSync(
    npmrcPath,
    [
      `registry=${registryUrl}`,
      `${registryHost}/:_authToken=smoke-token`,
      '',
    ].join('\n'),
  );

  return npmrcPath;
}

function packReleaseArtifacts(scratchDir: string): {
  manifestPath: string;
  artifacts: PackedArtifact[];
} {
  const tarballDir = resolve(scratchDir, 'tarballs');
  const manifestPath = resolve(scratchDir, 'tarballs.json');

  run('node', [
    'tools/scripts/release-artifacts.mts',
    'pack',
    '--out-dir',
    tarballDir,
    '--json-output',
    manifestPath,
  ]);

  const artifacts = JSON.parse(
    readFileSync(manifestPath, 'utf8'),
  ) as PackedArtifact[];

  return { manifestPath, artifacts };
}

function publishArtifactsToLocalRegistry(
  artifacts: PackedArtifact[],
  registryUrl: string,
  registryEnv: NodeJS.ProcessEnv,
): void {
  for (const artifact of artifacts) {
    run(
      'npm',
      [
        'publish',
        artifact.tarballPath,
        '--registry',
        registryUrl,
        '--tag',
        'smoke',
        '--provenance=false',
      ],
      { env: registryEnv },
    );
  }
}

function runCreateAnalogSmokeTest(
  scratchDir: string,
  registryEnv: NodeJS.ProcessEnv,
): void {
  logTest('create-analog');
  const workdir = resolve(scratchDir, 'create-analog');
  mkdirSync(workdir, { recursive: true });

  run('npm', ['init', '-y'], { cwd: workdir, env: registryEnv });
  run('npm', ['install', '--no-save', `create-analog@${analogVersion}`], {
    cwd: workdir,
    env: registryEnv,
  });
  run(
    'node',
    [
      'node_modules/create-analog/index.mjs',
      'analog-app',
      '--skipTailwind',
      '--skipGit',
      '--template',
      'latest',
    ],
    { cwd: workdir, env: registryEnv },
  );

  const appDir = resolve(workdir, 'analog-app');
  syncProjectPackageVersions(appDir);
  run('npm', ['install'], { cwd: appDir, env: registryEnv });
  run('npm', ['run', 'build'], { cwd: appDir, env: registryEnv });
  run('npm', ['run', 'test'], { cwd: appDir, env: registryEnv });
}

function runNxPresetSmokeTest(
  scratchDir: string,
  registryEnv: NodeJS.ProcessEnv,
): void {
  logTest('nx-preset');
  const workdir = resolve(scratchDir, 'nx-preset');
  mkdirSync(workdir, { recursive: true });

  run(
    'npx',
    [
      `create-nx-workspace@${nxVersion}`,
      'analog-nx-workspace',
      '--preset',
      `@analogjs/platform@${analogVersion}`,
      '--analogAppName',
      'my-analog-app',
      '--addTailwind=false',
      '--ci',
      'skip',
      '--ai-agents',
      '--verbose',
      '--packageManager',
      'npm',
      '--skipGit',
      '--skipInstall',
    ],
    { cwd: workdir, env: registryEnv },
  );

  const workspaceDir = resolve(workdir, 'analog-nx-workspace');
  syncProjectPackageVersions(workspaceDir);
  run('npm', ['install'], { cwd: workspaceDir, env: registryEnv });
  run('npx', ['nx', 'build', 'my-analog-app'], {
    cwd: workspaceDir,
    env: registryEnv,
  });
  run('npx', ['nx', 'test', 'my-analog-app'], {
    cwd: workspaceDir,
    env: registryEnv,
  });
}

function runAngularMigrationSmokeTest(
  scratchDir: string,
  registryEnv: NodeJS.ProcessEnv,
): void {
  logTest('angular-migration');
  const workdir = resolve(scratchDir, 'angular-migrate');
  mkdirSync(workdir, { recursive: true });

  run(
    'npx',
    [
      `@angular/cli@${angularCliVersion}`,
      'new',
      'my-angular-app',
      '--style',
      'css',
      '--no-ssr',
      '--skip-git',
      '--skip-install',
      '--defaults',
    ],
    { cwd: workdir, env: registryEnv },
  );

  const appDir = resolve(workdir, 'my-angular-app');
  syncProjectPackageVersions(appDir);
  run('npm', ['install'], { cwd: appDir, env: registryEnv });
  run(
    'npm',
    [
      'install',
      `@analogjs/platform@${analogVersion}`,
      '@nx/devkit',
      '--save-dev',
    ],
    { cwd: appDir, env: registryEnv },
  );
  run(
    'npx',
    [
      'ng',
      'g',
      '@analogjs/platform:migrate',
      '--project',
      'my-angular-app',
      '--vitest=true',
    ],
    { cwd: appDir, env: registryEnv },
  );
  syncProjectPackageVersions(appDir);
  run('npm', ['install'], { cwd: appDir, env: registryEnv });
  run('npm', ['run', 'build'], { cwd: appDir, env: registryEnv });
  run('npm', ['run', 'test'], { cwd: appDir, env: registryEnv });
}

const scratchDir = resolve(root, 'tmp/release-consumer-smoke');
rmSync(scratchDir, { recursive: true, force: true });
mkdirSync(scratchDir, { recursive: true });

const { artifacts } = packReleaseArtifacts(scratchDir);
const npmEnv = createNpmChildEnv();
const registry = await startLocalRegistry(scratchDir, npmEnv);
const npmrcPath = createLocalNpmrc(scratchDir, registry.registryUrl);
const registryEnv = createNpmChildEnv({
  npm_config_registry: registry.registryUrl,
  npm_config_legacy_peer_deps: 'true',
  npm_config_userconfig: npmrcPath,
  NPM_CONFIG_USERCONFIG: npmrcPath,
});

try {
  publishArtifactsToLocalRegistry(artifacts, registry.registryUrl, registryEnv);
  runCreateAnalogSmokeTest(scratchDir, registryEnv);
  // TODO: re-enable once Vite 8 infinite-rebuild loop in Nx preset build is fixed
  // runNxPresetSmokeTest(scratchDir, registryEnv);
  runAngularMigrationSmokeTest(scratchDir, registryEnv);
} finally {
  await stopLocalRegistry(registry.process);
}
