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

  /** Build all packages and apps. */
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

  /** Run e2e tests (Playwright). */
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
        'e2e',
        '--projects',
        'analog-app-e2e,blog-app-e2e,tanstack-query-app-e2e',
      ])
      .stdout();
  }

  /**
   * Pre-e2e checks: prettier, lint, and build+test in parallel.
   * Builds the base container once and forks into independent branches —
   * the Dagger engine runs them concurrently automatically.
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
    const ctr = this.base(source);

    let buildCtr = ctr.withExec([
      'pnpm',
      'exec',
      'playwright',
      'install',
      '--with-deps',
      'chromium',
    ]);

    if (nxCloudToken) {
      buildCtr = buildCtr.withSecretVariable(
        'NX_CLOUD_ACCESS_TOKEN',
        nxCloudToken,
      );
    }

    // Independent branches off shared base — Dagger runs them in parallel.
    await Promise.all([
      ctr.withExec(['pnpm', 'run', 'prettier:check']).stdout(),
      ctr.withExec(['pnpm', 'run', 'lint']).stdout(),
      buildCtr
        .withExec([
          'pnpm',
          'exec',
          'nx',
          'run-many',
          '--target',
          'build',
          '--all',
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
        .stdout(),
    ]);

    return 'All checks passed.';
  }

  /**
   * Full CI pipeline: ciChecks + e2e.
   * Pre-installs Playwright in parallel with checks so e2e starts faster.
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
    const ctr = this.base(source);

    let buildCtr = ctr.withExec([
      'pnpm',
      'exec',
      'playwright',
      'install',
      '--with-deps',
      'chromium',
    ]);

    if (nxCloudToken) {
      buildCtr = buildCtr.withSecretVariable(
        'NX_CLOUD_ACCESS_TOKEN',
        nxCloudToken,
      );
    }

    // Phase 1: four independent branches run in parallel.
    // Playwright install warms browser cache volumes for phase 2.
    await Promise.all([
      ctr.withExec(['pnpm', 'run', 'prettier:check']).stdout(),
      ctr.withExec(['pnpm', 'run', 'lint']).stdout(),
      buildCtr
        .withExec([
          'pnpm',
          'exec',
          'nx',
          'run-many',
          '--target',
          'build',
          '--all',
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
        .stdout(),
      ctr
        .withExec([
          'pnpm',
          'exec',
          'playwright',
          'install',
          '--with-deps',
          'chromium',
        ])
        .stdout(),
    ]);

    // Phase 2: e2e. Browser and Nx build cache volumes are warm.
    let e2eCtr = ctr.withExec([
      'pnpm',
      'exec',
      'playwright',
      'install',
      '--with-deps',
      'chromium',
    ]);

    if (nxCloudToken) {
      e2eCtr = e2eCtr.withSecretVariable('NX_CLOUD_ACCESS_TOKEN', nxCloudToken);
    }

    await e2eCtr
      .withExec([
        'pnpm',
        'exec',
        'nx',
        'run-many',
        '--target',
        'e2e',
        '--projects',
        'analog-app-e2e,blog-app-e2e,tanstack-query-app-e2e',
      ])
      .stdout();

    return 'All CI checks passed.';
  }
}
