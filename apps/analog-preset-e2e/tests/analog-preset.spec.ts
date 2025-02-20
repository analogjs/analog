import { checkFilesExist, uniq, runCommandAsync } from '@nx/plugin/testing';
import { rmdirSync } from 'node:fs';

describe('analog-preset-e2e', () => {
  it.skip('should create an Nx workspace using the preset', async () => {
    const project = uniq('tmpanalogapp');
    const tmpDir = `${process.cwd()}/${project}`;

    await runCommandAsync(
      `npx create-nx-workspace@latest ${project} --preset @analogjs/platform --analogAppName analog-app --no-nx-cloud`,
      { cwd: process.cwd() },
    );

    await runCommandAsync(`nx test analog-app`, {
      cwd: tmpDir,
    });

    await runCommandAsync(`nx build analog-app`, {
      cwd: tmpDir,
    });

    expect(() =>
      checkFilesExist(`${tmpDir}/dist/analog-app/client/index.html`),
    ).not.toThrow();

    rmdirSync(tmpDir, { recursive: true });
  }, 120000);
});
