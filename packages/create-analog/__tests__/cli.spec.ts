import { execaCommandSync as commandSync } from 'execa';
import {
  mkdirpSync,
  readdirSync,
  readFileSync,
  remove,
  writeFileSync,
} from 'fs-extra';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { realpathSync } from 'node:fs';
import { afterEach, beforeAll, expect, test } from 'vitest';
import { loadConfigFromFile } from 'vite';

const CLI_PATH = join(__dirname, '..');

const projectName = 'test-app';
const tmpDir = join(realpathSync(tmpdir()), 'create-analog-test');
const genPath = join(tmpDir, projectName);

const run = (args: string[], options = {}) => {
  return commandSync(`node ${CLI_PATH} ${args.join(' ')}`, options);
};

// Helper to create a non-empty directory
const createNonEmptyDir = () => {
  // Create the temporary directory
  mkdirpSync(genPath);

  // Create a package.json file
  const pkgJson = join(genPath, 'package.json');
  writeFileSync(pkgJson, '{ "foo": "bar" }');
};

const readGeneratedPackageJson = () =>
  JSON.parse(readFileSync(join(genPath, 'package.json'), 'utf-8'));

const readGeneratedViteConfig = () =>
  readFileSync(join(genPath, 'vite.config.ts'), 'utf-8');

const readGeneratedStyles = () =>
  readFileSync(join(genPath, 'src/styles.css'), 'utf-8');

const expectTailwindScaffold = () => {
  const pkg = readGeneratedPackageJson();
  const viteConfig = readGeneratedViteConfig();

  expect(pkg.devDependencies['tailwindcss']).toBe('^4.2.2');
  expect(pkg.devDependencies['postcss']).toBe('^8.5.6');
  expect(pkg.devDependencies['@tailwindcss/postcss']).toBe('^4.2.2');
  expect(pkg.devDependencies['@tailwindcss/vite']).toBe('^4.2.2');
  expect(pkg.dependencies['tailwindcss']).toBeUndefined();
  expect(pkg.dependencies['@tailwindcss/vite']).toBeUndefined();
  expect(pkg.dependencies['@tailwindcss/postcss']).toBeUndefined();
  expect(readGeneratedStyles()).toContain(`@import 'tailwindcss';`);
  expect(viteConfig).toContain(`import tailwindcss from '@tailwindcss/vite';`);
  expect(viteConfig).toMatch(
    /plugins:\s*\[[\s\S]*tailwindcss\(\),[\s\S]*analog\(/,
  );
  expect(readFileSync(join(genPath, 'postcss.config.mjs'), 'utf-8')).toContain(
    `'@tailwindcss/postcss': {}`,
  );
};

// Angular v18 starter template
let templateFiles = readdirSync(join(CLI_PATH, 'template-latest'));
templateFiles.push('.git');
// _gitignore is renamed to .gitignore
templateFiles = templateFiles
  .map((filePath) => (filePath === '_gitignore' ? '.gitignore' : filePath))
  .sort((a, b) => a.localeCompare(b));
const tailwindTemplateFiles = [...templateFiles, 'postcss.config.mjs'].sort(
  (a, b) => a.localeCompare(b),
);
beforeAll(async () => {
  await remove(genPath);
  mkdirpSync(tmpDir);
});
afterEach(() => remove(genPath));

test('prompts for the project name if none supplied', () => {
  const { stdout, exitCode } = run([]);
  expect(stdout).toContain('Project name:');
});

test('prompts for the starter if none supplied when target dir is current directory', () => {
  mkdirpSync(genPath);
  const { stdout } = run(['.'], { cwd: genPath });
  expect(stdout).toContain('What would you like to start?:');
});

test('prompts for the starter if none supplied', () => {
  const { stdout } = run([projectName]);
  expect(stdout).toContain('What would you like to start?:');
});

test.skip('prompts for the framework on supplying an invalid template', () => {
  const { stdout } = run([projectName, '--template', 'unknown']);
  expect(stdout).toContain(
    `"unknown" isn't a valid template. Please choose from below:`,
  );
});

test('asks to overwrite non-empty target directory', () => {
  createNonEmptyDir();
  const { stdout } = run([projectName], { cwd: tmpDir });
  expect(stdout).toContain(`Target directory "${projectName}" is not empty.`);
});

test('asks to overwrite non-empty current directory', () => {
  createNonEmptyDir();
  const { stdout } = run(['.'], { cwd: genPath });
  expect(stdout).toContain(`Current directory is not empty.`);
});

test('successfully scaffolds a project based on angular starter template', () => {
  const { stdout } = run(
    [projectName, '--template', 'latest', '--skipTailwind', 'false'],
    { cwd: tmpDir },
  );
  const generatedFiles = readdirSync(genPath).sort((a, b) =>
    a.localeCompare(b),
  );

  // Assertions
  expect(stdout).toContain(`Scaffolding project in ${genPath}`);
  expect(tailwindTemplateFiles).toEqual(generatedFiles);
  expectTailwindScaffold();
});

test('works with the -t alias', () => {
  const { stdout } = run(
    [projectName, '-t', 'latest', '--skipTailwind', 'false'],
    { cwd: tmpDir },
  );
  const generatedFiles = readdirSync(genPath).sort((a, b) =>
    a.localeCompare(b),
  );

  // Assertions
  expect(stdout).toContain(`Scaffolding project in ${genPath}`);
  expect(tailwindTemplateFiles).toEqual(generatedFiles);
  expectTailwindScaffold();
});

test(
  'loads the generated tailwind vite config',
  { timeout: 30_000 },
  async () => {
    // Scaffold inside the workspace so Vite can resolve node_modules
    const localGenPath = join(__dirname, projectName);
    await remove(localGenPath);

    try {
      run([projectName, '--template', 'latest', '--skipTailwind', 'false'], {
        cwd: __dirname,
      });

      const loaded = await loadConfigFromFile(
        {
          command: 'build',
          mode: 'production',
        },
        join(localGenPath, 'vite.config.ts'),
      );

      expect(loaded?.path).toBe(join(localGenPath, 'vite.config.ts'));
      expect(loaded?.config).toBeTruthy();
    } finally {
      await remove(localGenPath);
    }
  },
);
