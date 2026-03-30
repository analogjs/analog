import type { Container, Directory, Secret } from '@dagger.io/dagger';
import { argument, dag, func, object } from '@dagger.io/dagger';

const DEFAULT_E2E_PROJECTS =
  'analog-app-e2e,blog-app-e2e,tanstack-query-app-e2e';

@object()
export class AnalogCi {
  private withNxCloudToken(ctr: Container, nxCloudToken?: Secret): Container {
    if (!nxCloudToken) {
      return ctr;
    }

    return ctr.withSecretVariable('NX_CLOUD_ACCESS_TOKEN', nxCloudToken);
  }

  private withPlaywrightChromium(ctr: Container): Container {
    return ctr.withExec([
      'pnpm',
      'exec',
      'playwright',
      'install',
      '--with-deps',
      'chromium',
    ]);
  }

  private withBuildAndVerify(ctr: Container): Container {
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
      .withExec(['node', 'tools/scripts/verify-route-freshness.mts'])
      .withExec(['pnpm', 'exec', 'nx', 'build-storybook', 'analog-app']);
  }

  private withTestTargets(ctr: Container): Container {
    return ctr.withExec([
      'pnpm',
      'exec',
      'nx',
      'run-many',
      '--target',
      'test',
      // Exclude my-package: its Playwright browser-mode test requires
      // a full desktop Chromium that the container doesn't provide.
      '--exclude=my-package',
    ]);
  }

  private withE2eTargets(
    ctr: Container,
    projects = DEFAULT_E2E_PROJECTS,
  ): Container {
    return ctr.withExec([
      'pnpm',
      'exec',
      'nx',
      'run-many',
      '--target',
      'e2e',
      '--projects',
      projects,
    ]);
  }

  private buildTestBranch(ctr: Container, nxCloudToken?: Secret): Container {
    return this.withTestTargets(
      this.withBuildAndVerify(
        this.withNxCloudToken(this.withPlaywrightChromium(ctr), nxCloudToken),
      ),
    );
  }

  private e2eBranch(
    ctr: Container,
    nxCloudToken?: Secret,
    projects = DEFAULT_E2E_PROJECTS,
  ): Container {
    return this.withE2eTargets(
      this.withNxCloudToken(this.withPlaywrightChromium(ctr), nxCloudToken),
      projects,
    );
  }

  private ciCheckOutputs(
    ctr: Container,
    nxCloudToken?: Secret,
  ): Promise<string>[] {
    return [
      ctr.withExec(['pnpm', 'run', 'prettier:check']).stdout(),
      ctr.withExec(['pnpm', 'run', 'lint']).stdout(),
      this.buildTestBranch(ctr, nxCloudToken).stdout(),
    ];
  }

  /**
   * Base container: Node 24.14, corepack-managed pnpm, dependencies installed.
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
        '!.git',
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
      .from('node:24.14.1')
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
        '!.git',
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
        '!.git',
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
        '!.git',
      ],
    })
    source: Directory,
    nxCloudToken?: Secret,
  ): Promise<string> {
    return this.withBuildAndVerify(
      this.withNxCloudToken(this.base(source), nxCloudToken),
    ).stdout();
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
        '!.git',
      ],
    })
    source: Directory,
  ): Promise<string> {
    return this.withTestTargets(
      this.withPlaywrightChromium(this.base(source)),
    ).stdout();
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
        '!.git',
      ],
    })
    source: Directory,
    nxCloudToken?: Secret,
  ): Promise<string> {
    return this.withTestTargets(
      this.withBuildAndVerify(
        this.withNxCloudToken(
          this.withPlaywrightChromium(this.base(source)),
          nxCloudToken,
        ),
      ),
    ).stdout();
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
        '!.git',
      ],
    })
    source: Directory,
    nxCloudToken?: Secret,
    @argument()
    projects = DEFAULT_E2E_PROJECTS,
  ): Promise<string> {
    return this.e2eBranch(this.base(source), nxCloudToken, projects).stdout();
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
        '!.git',
      ],
    })
    source: Directory,
    nxCloudToken?: Secret,
  ): Promise<string> {
    const ctr = this.base(source);

    // Independent branches off shared base — Dagger runs them in parallel.
    await Promise.all(this.ciCheckOutputs(ctr, nxCloudToken));

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
        '!.git',
      ],
    })
    source: Directory,
    nxCloudToken?: Secret,
  ): Promise<string> {
    const ctr = this.base(source);

    // Phase 1: four independent branches run in parallel.
    // Playwright install warms browser cache volumes for phase 2.
    await Promise.all([
      ...this.ciCheckOutputs(ctr, nxCloudToken),
      this.withPlaywrightChromium(ctr).stdout(),
    ]);

    // Phase 2: e2e. Browser and Nx build cache volumes are warm.
    await this.e2eBranch(ctr, nxCloudToken).stdout();

    return 'All CI checks passed.';
  }
}
