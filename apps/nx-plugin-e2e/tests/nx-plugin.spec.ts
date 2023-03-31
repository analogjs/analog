import {
  checkFilesExist,
  ensureNxProject,
  readJson,
  runNxCommandAsync,
  uniq,
} from '@nrwl/nx-plugin/testing';

describe('nx-plugin e2e', () => {
  // Setting up individual workspaces per
  // test can cause e2e runs to take a long time.
  // For this reason, we recommend each suite only
  // consumes 1 workspace. The tests should each operate
  // on a unique project in the workspace, such that they
  // are not dependent on one another.
  beforeAll(async () => {
    ensureNxProject(
      '@analogjs/vite-plugin-angular',
      'node_modules/@analogjs/vite-plugin-angular'
    );
    ensureNxProject('@analogjs/platform', 'node_modules/@analogjs/platform');
  });

  afterAll(() => {
    // `nx reset` kills the daemon, and performs
    // some work which can help clean up e2e leftovers
    runNxCommandAsync('reset');
  });

  it('should create hello-world', async () => {
    const project = uniq('hello-world');
    await runNxCommandAsync(`generate @analogjs/platform:app ${project}`);
    expect(() => checkFilesExist(`apps/${project}/index.html`)).not.toThrow();
  }, 120000);

  describe('--directory', () => {
    it('should create src in the specified directory', async () => {
      const project = uniq('hello-world');
      await runNxCommandAsync(
        `generate @analogjs/platform:app ${project} --directory subdir`
      );
      expect(() =>
        checkFilesExist(`apps/subdir/${project}/index.html`)
      ).not.toThrow();
    }, 120000);
  });

  describe('--tags', () => {
    it('should add tags to the project', async () => {
      const projectName = uniq('hello-world');
      await runNxCommandAsync(
        `generate @analogjs/platform:app ${projectName} --tags analog,analogApplication`
      );
      const project = readJson(`apps/${projectName}/project.json`);
      expect(project.tags).toEqual(['analog', 'analogApplication']);
    }, 120000);
  });
});
