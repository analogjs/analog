import { checkFilesExist, uniq, runCommandAsync } from '@nx/plugin/testing';
import * as fs from 'node:fs';
import * as path from 'node:path';

function copy(src: string, dest: string) {
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
function copyDir(srcDir: string, destDir: string) {
  fs.mkdirSync(destDir, { recursive: true });
  for (const file of fs.readdirSync(srcDir)) {
    const srcFile = path.resolve(srcDir, file);
    const destFile = path.resolve(destDir, file);
    copy(srcFile, destFile);
  }
}

function emptyDir(dir: string) {
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
      `node ./dist/packages/create-analog/index.js ${project} --template angular-v17 --skipTailwind`,
      { cwd: process.cwd() }
    );

    await runCommandAsync(`pnpm i`, {
      cwd: tmpDir,
    });

    await runCommandAsync(`ng config cli.packageManager pnpm`, {
      cwd: tmpDir,
    });

    emptyDir(`${tmpDir}/node_modules/@analogjs`);
    copyDir(
      `${process.cwd()}/node_modules/@analogjs`,
      `${tmpDir}/node_modules/@analogjs`
    );

    const angularJson = JSON.parse(
      fs.readFileSync(`${tmpDir}/angular.json`, 'utf-8')
    );
    angularJson.projects['my-app'].root = '.';
    fs.writeFileSync(
      `${tmpDir}/angular.json`,
      JSON.stringify(angularJson, null, 2)
    );

    let viteConfig = fs.readFileSync(`${tmpDir}/vite.config.ts`, 'utf-8');
    viteConfig = viteConfig.replace(
      'analog()',
      `analog({ vite: { tsconfig: '${tmpDir}/tsconfig.spec.json' } })`
    );

    fs.writeFileSync(`${tmpDir}/vite.config.ts`, viteConfig);

    await runCommandAsync(`vitest --no-watch`, {
      cwd: tmpDir,
    });

    await runCommandAsync(`ng build`, {
      cwd: tmpDir,
    });

    expect(() =>
      checkFilesExist(`${tmpDir}/dist/analog/public/index.html`)
    ).not.toThrow();

    fs.rmdirSync(tmpDir, { recursive: true });
  }, 120000);

  it('should create my-app with blog template', async () => {
    const project = uniq('tmpanalogapp');
    const tmpDir = `${process.cwd()}/${project}`;

    await runCommandAsync(
      `node ./dist/packages/create-analog/index.js ${project} --template blog --skipTailwind`,
      { cwd: process.cwd() }
    );

    await runCommandAsync(`pnpm i`, {
      cwd: tmpDir,
    });

    await runCommandAsync(`ng config cli.packageManager pnpm`, {
      cwd: tmpDir,
    });

    emptyDir(`${tmpDir}/node_modules/@analogjs`);
    copyDir(
      `${process.cwd()}/node_modules/@analogjs`,
      `${tmpDir}/node_modules/@analogjs`
    );

    const angularJson = JSON.parse(
      fs.readFileSync(`${tmpDir}/angular.json`, 'utf-8')
    );

    angularJson.projects['blog'].root = '.';
    fs.writeFileSync(
      `${tmpDir}/angular.json`,
      JSON.stringify(angularJson, null, 2)
    );

    let viteConfig = fs.readFileSync(`${tmpDir}/vite.config.ts`, 'utf-8');
    viteConfig = viteConfig.replace(
      'analog()',
      `analog({ vite: { tsconfig: '${tmpDir}/tsconfig.spec.json' } })`
    );

    fs.writeFileSync(`${tmpDir}/vite.config.ts`, viteConfig);

    await runCommandAsync(`vitest --no-watch`, {
      cwd: tmpDir,
    });

    await runCommandAsync(`ng build`, {
      cwd: tmpDir,
    });

    const appConfigContent = fs.readFileSync(
      `${tmpDir}/src/app/app.config.ts`,
      'utf-8'
    );

    // ensure highlighter is added
    expect(appConfigContent).toContain(
      `import { withPrismHighlighter } from '@analogjs/content/prism-highlighter'`
    );

    expect(() =>
      checkFilesExist(`${tmpDir}/dist/analog/public/index.html`)
    ).not.toThrow();

    fs.rmdirSync(tmpDir, { recursive: true });
  }, 120000);

  it('should create my-app with the next release', async () => {
    const project = uniq('tmpanalogapp');
    const tmpDir = `${process.cwd()}/${project}`;

    await runCommandAsync(
      `node ./dist/packages/create-analog/index.js ${project} --template angular-v17 --skipTailwind`,
      { cwd: process.cwd() }
    );

    await runCommandAsync(`pnpm i`, {
      cwd: tmpDir,
    });

    await runCommandAsync(`ng config cli.packageManager pnpm`, {
      cwd: tmpDir,
    });

    await runCommandAsync(
      `ng update @angular/cli @angular/core --next --allow-dirty`,
      {
        cwd: tmpDir,
      }
    );

    emptyDir(`${tmpDir}/node_modules/@analogjs`);
    copyDir(
      `${process.cwd()}/node_modules/@analogjs`,
      `${tmpDir}/node_modules/@analogjs`
    );

    let viteConfig = fs.readFileSync(`${tmpDir}/vite.config.ts`, 'utf-8');
    viteConfig = viteConfig.replace(
      'analog()',
      `analog({ vite: { tsconfig: '${tmpDir}/tsconfig.spec.json' } })`
    );

    fs.writeFileSync(`${tmpDir}/vite.config.ts`, viteConfig);

    await runCommandAsync(`vitest --no-watch`, {
      cwd: tmpDir,
    });

    await runCommandAsync(`ng build`, {
      cwd: tmpDir,
    });

    expect(() =>
      checkFilesExist(`${tmpDir}/dist/analog/public/index.html`)
    ).not.toThrow();

    fs.rmdirSync(tmpDir, { recursive: true });
  }, 120000);
});
