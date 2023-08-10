import { checkFilesExist, uniq, runCommandAsync } from '@nx/plugin/testing';
import { readFileSync, writeFileSync, rmdirSync } from 'node:fs';
import fs from 'node:fs';
import path from 'node:path';

function copy(src, dest) {
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    copyDir(src, dest);
  } else {
    fs.copyFileSync(src, dest);
  }
}

/**
 * @param {string} srcDir
 * @param {string} destDir
 */
function copyDir(srcDir, destDir) {
  fs.mkdirSync(destDir, { recursive: true });
  for (const file of fs.readdirSync(srcDir)) {
    const srcFile = path.resolve(srcDir, file);
    const destFile = path.resolve(destDir, file);
    copy(srcFile, destFile);
  }
}

function emptyDir(dir) {
  if (!fs.existsSync(dir)) {
    return;
  }
  for (const file of fs.readdirSync(dir)) {
    fs.rmSync(path.resolve(dir, file), { recursive: true, force: true });
  }
}

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

    emptyDir(`${tmpDir}/node_modules/@analogjs`);
    copyDir(
      `${process.cwd()}/node_modules/@analogjs`,
      `${tmpDir}/node_modules/@analogjs`
    );

    let viteConfig = readFileSync(`${tmpDir}/vite.config.mts`, 'utf-8');
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

    writeFileSync(`${tmpDir}/vite.config.mts`, viteConfig);

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
