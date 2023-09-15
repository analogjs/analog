import {
  checkFilesExist,
  ensureNxProject,
  copyNodeModules,
  runNxCommandAsync,
  uniq,
} from '@nx/plugin/testing';

describe('nx-plugin e2e', () => {
  // Setting up individual workspaces per
  // test can cause e2e runs to take a long time.
  // For this reason, we recommend each suite only
  // consumes 1 workspace. The tests should each operate
  // on a unique project in the workspace, such that they
  // are not dependent on one another.
  beforeAll(async () => {
    ensureNxProject('@analogjs/platform', 'node_modules/@analogjs/platform');
  });

  afterAll(async () => {
    // `nx reset` kills the daemon, and performs
    // some work which can help clean up e2e leftovers
    await runNxCommandAsync('reset');
  });

  it('should create hello-world', async () => {
    const project = uniq('app');
    await runNxCommandAsync(
      `generate @analogjs/platform:app ${project} --addTailwind=true --addTRPC=true`
    );
    copyNodeModules(['@analogjs']);

    await runNxCommandAsync(`test ${project}`);

    expect(() => checkFilesExist(`${project}/index.html`)).not.toThrow();
  }, 120000);
});
