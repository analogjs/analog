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
  beforeAll(() => {
    ensureNxProject('@analogjs/nx', 'dist/packages/nx-plugin');
  });

  afterAll(() => {
    // `nx reset` kills the daemon, and performs
    // some work which can help clean up e2e leftovers
    runNxCommandAsync('reset');
  });

  it('should create hello-world', async () => {
    const project = uniq('hello-world');
    await runNxCommandAsync(`generate @analogjs/nx:app ${project}`);
    const result = await runNxCommandAsync(`build ${project}`);
    expect(result.stdout).toContain(
      'Successfully ran target build for project'
    );
  }, 120000);

  describe('--directory', () => {
    it('should create src in the specified directory', async () => {
      const project = uniq('hello-world');
      await runNxCommandAsync(
        `generate @analogjs/nx:app ${project} --directory subdir`
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
        `generate @analogjs/nx:app ${projectName} --tags e2etag,e2ePackage`
      );
      const project = readJson(`apps/${projectName}/project.json`);
      expect(project.tags).toEqual(['e2etag', 'e2ePackage']);
    }, 120000);
  });
});
