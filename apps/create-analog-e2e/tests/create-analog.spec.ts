import { checkFilesExist, uniq, runCommandAsync } from '@nx/plugin/testing';
import { readFileSync, writeFileSync, rmdirSync } from 'node:fs';

describe('create-analog e2e', () => {
  it('should create my-app', async () => {
    const project = uniq('tmpanalogapp');
    const tmpDir = `${process.cwd()}/${project}`;

    await runCommandAsync(
      `node ./dist/packages/create-analog/index.js ${project} --template angular-v16 --skipTailwind true`,
      { cwd: process.cwd() }
    );

    await runCommandAsync(`npm i`, {
      cwd: tmpDir,
    });

    let viteConfig = readFileSync(`${tmpDir}/vite.config.ts`, 'utf-8');
    viteConfig = viteConfig.replace(
      'analog()',
      `analog({ vite: { tsconfig: '${tmpDir}/tsconfig.spec.json' } })`
    );
    viteConfig = viteConfig.replace(
      `setupFiles: ['src/test.ts'],`,
      `setupFiles: ['${project}/src/test.ts'],`
    );
    viteConfig = viteConfig.replace(
      `include: ['**/*.spec.ts'],`,
      `include: ['${project}/**/*.spec.ts'],`
    );

    writeFileSync(`${tmpDir}/vite.config.ts`, viteConfig);

    await runCommandAsync(`ng test`, {
      cwd: tmpDir,
    });

    await runCommandAsync(`ng build`, {
      cwd: tmpDir,
    });

    expect(() =>
      checkFilesExist(`${tmpDir}/dist/client/index.html`)
    ).not.toThrow();

    rmdirSync(tmpDir, { recursive: true });
  }, 120000);
});
