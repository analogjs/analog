import type { Container, Directory, Secret } from '@dagger.io/dagger';
import { argument, dag, func, object } from '@dagger.io/dagger';

@object()
export class AnalogCi {
  /**
   * Base container: Node 24, corepack-managed pnpm, dependencies installed.
   * All CI functions build on this.
   *
   * Uses .node-version-aligned image. When upgrading Node, update
   * this image tag to match .node-version in the repo root.
   */
  @func()
  base(
    @argument({
      defaultPath: '.',
      ignore: [
        '**/node_modules',
        '**/dist',
        '.nx',
        '.angular',
        '.nitro',
        '.vite-inspect',
        '.dagger/sdk',
        '**/coverage',
        '**/test-results',
        '**/playwright-report',
        '**/playwright/.cache',
        '*.timestamp*',
        'tmp',
        'out-tsc',
      ],
    })
    source: Directory,
  ): Container {
    const pnpmStore = dag.cacheVolume('pnpm-store');
    const nxCache = dag.cacheVolume('nx-cache');
    const playwrightCache = dag.cacheVolume('playwright-browsers');
    const cypressCache = dag.cacheVolume('cypress-browsers');

    // Short store path keeps git-hosted package prep paths under the
    // 108-char Unix socket limit (tsx IPC pipes in <store>/v10/tmp/).
    return dag
      .container()
      .from('node:24.14.0')
      .withEnvVariable('CI', 'true')
      .withEnvVariable('NODE_OPTIONS', '--max-old-space-size=16384')
      .withEnvVariable('NX_ISOLATE_PLUGINS', 'false')
      .withEnvVariable('npm_config_store_dir', '/pnpm')
      .withExec(['corepack', 'enable'])
      .withMountedCache('/pnpm', pnpmStore)
      .withMountedCache('/root/.cache/ms-playwright', playwrightCache)
      .withMountedCache('/root/.cache/Cypress', cypressCache)
      .withDirectory('/app', source)
      .withWorkdir('/app')
      .withMountedCache('/app/.nx/cache', nxCache)
      .withExec(['pnpm', 'install', '--frozen-lockfile']);
  }

  /** Check formatting via the workspace prettier:check script. */
  @func()
  async prettier(
    @argument({
      defaultPath: '.',
      ignore: [
        '**/node_modules',
        '**/dist',
        '.nx',
        '.angular',
        '.nitro',
        '.vite-inspect',
        '.dagger/sdk',
        '**/coverage',
        '**/test-results',
        '**/playwright-report',
        '**/playwright/.cache',
        '*.timestamp*',
        'tmp',
        'out-tsc',
      ],
    })
    source: Directory,
  ): Promise<string> {
    return this.base(source)
      .withExec(['pnpm', 'run', 'prettier:check'])
      .stdout();
  }

  /**
   * Run all three lint passes, matching the root `pnpm lint` script:
   *  1. oxlint (lint:check)
   *  2. oxlint type-aware (lint:types)
   *  3. ESLint via Nx (lint:legacy)
   */
  @func()
  async lint(
    @argument({
      defaultPath: '.',
      ignore: [
        '**/node_modules',
        '**/dist',
        '.nx',
        '.angular',
        '.nitro',
        '.vite-inspect',
        '.dagger/sdk',
        '**/coverage',
        '**/test-results',
        '**/playwright-report',
        '**/playwright/.cache',
        '*.timestamp*',
        'tmp',
        'out-tsc',
      ],
    })
    source: Directory,
  ): Promise<string> {
    return this.base(source).withExec(['pnpm', 'run', 'lint']).stdout();
  }

  /** Build all packages and apps (excluding astro-app). */
  @func()
  async build(
    @argument({
      defaultPath: '.',
      ignore: [
        '**/node_modules',
        '**/dist',
        '.nx',
        '.angular',
        '.nitro',
        '.vite-inspect',
        '.dagger/sdk',
        '**/coverage',
        '**/test-results',
        '**/playwright-report',
        '**/playwright/.cache',
        '*.timestamp*',
        'tmp',
        'out-tsc',
      ],
    })
    source: Directory,
    nxCloudToken?: Secret,
  ): Promise<string> {
    let ctr = this.base(source);

    if (nxCloudToken) {
      ctr = ctr.withSecretVariable('NX_CLOUD_ACCESS_TOKEN', nxCloudToken);
    }

    return ctr
      .withExec([
        'pnpm',
        'exec',
        'nx',
        'run-many',
        '--target',
        'build',
        '--all',
        '--exclude=astro-app',
      ])
      .stdout();
  }

  /** Run unit tests (installs Playwright chromium for browser tests). */
  @func()
  async test(
    @argument({
      defaultPath: '.',
      ignore: [
        '**/node_modules',
        '**/dist',
        '.nx',
        '.angular',
        '.nitro',
        '.vite-inspect',
        '.dagger/sdk',
        '**/coverage',
        '**/test-results',
        '**/playwright-report',
        '**/playwright/.cache',
        '*.timestamp*',
        'tmp',
        'out-tsc',
      ],
    })
    source: Directory,
  ): Promise<string> {
    return this.base(source)
      .withExec([
        'pnpm',
        'exec',
        'playwright',
        'install',
        '--with-deps',
        'chromium',
      ])
      .withExec([
        'pnpm',
        'exec',
        'nx',
        'run-many',
        '--target',
        'test',
        '--exclude=my-package',
      ])
      .stdout();
  }

  /**
   * Build + test in ONE container so Nx local cache is shared.
   * Build runs first, populating the cache. Test's ^build deps are
   * instant cache hits, eliminating redundant build work.
   */
  @func()
  async buildAndTest(
    @argument({
      defaultPath: '.',
      ignore: [
        '**/node_modules',
        '**/dist',
        '.nx',
        '.angular',
        '.nitro',
        '.vite-inspect',
        '.dagger/sdk',
        '**/coverage',
        '**/test-results',
        '**/playwright-report',
        '**/playwright/.cache',
        '*.timestamp*',
        'tmp',
        'out-tsc',
      ],
    })
    source: Directory,
    nxCloudToken?: Secret,
  ): Promise<string> {
    let ctr = this.base(source).withExec([
      'pnpm',
      'exec',
      'playwright',
      'install',
      '--with-deps',
      'chromium',
    ]);

    if (nxCloudToken) {
      ctr = ctr.withSecretVariable('NX_CLOUD_ACCESS_TOKEN', nxCloudToken);
    }

    return ctr
      .withExec([
        'pnpm',
        'exec',
        'nx',
        'run-many',
        '--target',
        'build',
        '--all',
        '--exclude=astro-app',
      ])
      .withExec([
        'pnpm',
        'exec',
        'nx',
        'run-many',
        '--target',
        'test',
        // Exclude my-package: its Playwright browser-mode test requires
        // a full desktop Chromium that the container doesn't provide.
        '--exclude=my-package',
      ])
      .stdout();
  }

  /** Run e2e tests (Playwright + Cypress). */
  @func()
  async endToEnd(
    @argument({
      defaultPath: '.',
      ignore: [
        '**/node_modules',
        '**/dist',
        '.nx',
        '.angular',
        '.nitro',
        '.vite-inspect',
        '.dagger/sdk',
        '**/coverage',
        '**/test-results',
        '**/playwright-report',
        '**/playwright/.cache',
        '*.timestamp*',
        'tmp',
        'out-tsc',
      ],
    })
    source: Directory,
    nxCloudToken?: Secret,
  ): Promise<string> {
    // Reset NODE_OPTIONS so Cypress child processes don't inherit the oversized heap limit.
    let ctr = this.base(source)
      .withExec(['pnpm', 'exec', 'playwright', 'install', '--with-deps'])
      .withExec(['pnpm', 'exec', 'cypress', 'install'])
      .withEnvVariable('NODE_OPTIONS', '');

    if (nxCloudToken) {
      ctr = ctr.withSecretVariable('NX_CLOUD_ACCESS_TOKEN', nxCloudToken);
    }

    return ctr
      .withExec([
        'pnpm',
        'exec',
        'nx',
        'run-many',
        '--target',
        'e2e',
        '--projects',
        'create-analog-e2e,analog-app-e2e-cypress',
        '--exclude',
        'analog-app-e2e-playwright',
      ])
      .stdout();
  }

  /**
   * Pre-e2e checks: prettier, lint, and build+test in parallel.
   * Used by GitHub Actions ci-linux job.
   */
  @func()
  async ciChecks(
    @argument({
      defaultPath: '.',
      ignore: [
        '**/node_modules',
        '**/dist',
        '.nx',
        '.angular',
        '.nitro',
        '.vite-inspect',
        '.dagger/sdk',
        '**/coverage',
        '**/test-results',
        '**/playwright-report',
        '**/playwright/.cache',
        '*.timestamp*',
        'tmp',
        'out-tsc',
      ],
    })
    source: Directory,
    nxCloudToken?: Secret,
  ): Promise<string> {
    await Promise.all([
      this.prettier(source),
      this.lint(source),
      this.buildAndTest(source, nxCloudToken),
    ]);

    return 'All checks passed.';
  }

  /**
   * Full CI pipeline: ciChecks + e2e.
   * For local use via `pnpm ghci`.
   */
  @func()
  async ci(
    @argument({
      defaultPath: '.',
      ignore: [
        '**/node_modules',
        '**/dist',
        '.nx',
        '.angular',
        '.nitro',
        '.vite-inspect',
        '.dagger/sdk',
        '**/coverage',
        '**/test-results',
        '**/playwright-report',
        '**/playwright/.cache',
        '*.timestamp*',
        'tmp',
        'out-tsc',
      ],
    })
    source: Directory,
    nxCloudToken?: Secret,
  ): Promise<string> {
    await this.ciChecks(source, nxCloudToken);
    await this.endToEnd(source, nxCloudToken);

    return 'All CI checks passed.';
  }
}
