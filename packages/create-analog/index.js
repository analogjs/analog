#!/usr/bin/env node

// @ts-check
import { green, red, reset, yellow } from 'kolorist';
import minimist from 'minimist';
import { execSync } from 'node:child_process';
import fs, { readdirSync } from 'node:fs';
import path, { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import prompts from 'prompts';

// Avoids autoconversion to number of the project name by defining that the args
// non associated with an option ( _ ) needs to be parsed as a string. See #4606
const argv = minimist(process.argv.slice(2), { string: ['_'] });
const cwd = process.cwd();

const APPS = [
  {
    name: 'Analog',
    color: yellow,
    variants: [
      {
        name: 'Full-stack Application',
        template: 'latest',
        color: green,
      },
      {
        name: 'Blog',
        template: 'blog',
        color: yellow,
      },
    ],
  },
];
const HIGHLIGHTERS = {
  prismjs: {
    highlighter: 'withPrismHighlighter',
    entryPoint: 'prism-highlighter',
    dependencies: {
      'marked-highlight': '^2.0.1',
      prismjs: '^1.29.0',
    },
  },
  shiki: {
    highlighter: 'withShikiHighlighter',
    entryPoint: 'shiki-highlighter',
    dependencies: {
      marked: '^7.0.0',
      'marked-shiki': '^1.1.0',
      shiki: '^1.6.1',
    },
  },
};

const renameFiles = {
  _gitignore: '.gitignore',
};

async function init() {
  let targetDir = formatTargetDir(argv._[0]);
  let template = argv.template || argv.t;
  let skipTailwind = argv.skipTailwind || false;

  const defaultTargetDir = 'analog-project';
  const getProjectName = () =>
    targetDir === '.' ? path.basename(path.resolve()) : targetDir;

  let result = {};

  try {
    result = await prompts(
      [
        {
          type: targetDir ? null : 'text',
          name: 'projectName',
          message: reset('Project name:'),
          initial: defaultTargetDir,
          onState: (state) => {
            targetDir = formatTargetDir(state.value) || defaultTargetDir;
          },
        },
        {
          type: () =>
            !fs.existsSync(targetDir) || isEmpty(targetDir) ? null : 'confirm',
          name: 'overwrite',
          message: () =>
            (targetDir === '.'
              ? 'Current directory'
              : `Target directory "${targetDir}"`) +
            ` is not empty. Remove existing files and continue?`,
        },
        {
          type: (_, { overwrite } = {}) => {
            if (overwrite === false) {
              throw new Error(red('✖') + ' Operation cancelled');
            }
            return null;
          },
          name: 'overwriteChecker',
        },
        {
          type: () => (isValidPackageName(getProjectName()) ? null : 'text'),
          name: 'packageName',
          message: reset('Package name:'),
          initial: () => toValidPackageName(getProjectName()),
          validate: (dir) =>
            isValidPackageName(dir) || 'Invalid package.json name',
        },
        {
          type: template ? null : 'select',
          name: 'variant',
          message: reset('What would you like to start?:'),
          // @ts-ignore
          choices: APPS[0].variants.map((variant) => {
            const variantColor = variant.color;
            return {
              title: variantColor(variant.name),
              value: variant.template,
            };
          }),
        },
        {
          type: (prev) => (prev === 'blog' ? 'select' : null),
          name: 'syntaxHighlighter',
          message: reset('Choose a syntax highlighter:'),
          choices: Object.keys(HIGHLIGHTERS).map((highlighter) => ({
            title: highlighter,
            value: highlighter,
          })),
          initial: 1,
        },
        {
          type: skipTailwind ? null : 'confirm',
          name: 'tailwind',
          message: 'Would you like to add Tailwind to your project?',
        },
      ],
      {
        onCancel: () => {
          throw new Error(red('✖') + ' Operation cancelled');
        },
      }
    );
  } catch (cancelled) {
    console.log(cancelled.message);
    return;
  }

  // user choice associated with prompts
  const {
    framework,
    overwrite,
    packageName,
    variant,
    tailwind,
    syntaxHighlighter,
  } = result;

  const root = path.join(cwd, targetDir);

  if (overwrite) {
    emptyDir(root);
  } else if (!fs.existsSync(root)) {
    fs.mkdirSync(root, { recursive: true });
  }

  // determine template
  template = variant || framework || template;
  // determine syntax highlighter
  let highlighter =
    syntaxHighlighter ?? (template === 'blog' ? 'prismjs' : null);
  skipTailwind = !tailwind || skipTailwind;

  console.log(`\nScaffolding project in ${root}...`);

  const templateDir = path.resolve(
    fileURLToPath(import.meta.url),
    '..',
    `template-${template}`
  );

  const filesDir = path.resolve(fileURLToPath(import.meta.url), '..', `files`);

  const write = (file, content) => {
    const targetPath = renameFiles[file]
      ? path.join(root, renameFiles[file])
      : path.join(root, file);

    if (content) {
      fs.writeFileSync(targetPath, content);
    } else {
      copy(path.join(templateDir, file), targetPath);
    }
  };

  const files = fs.readdirSync(templateDir);
  for (const file of files.filter((f) => f !== 'package.json')) {
    write(file);
  }

  if (!skipTailwind) {
    addTailwindConfig(write, filesDir);
    addPostCssConfig(write, filesDir);
    addTailwindDirectives(write, filesDir);
  }

  const pkgInfo = pkgFromUserAgent(process.env.npm_config_user_agent);
  const pkgManager = pkgInfo ? pkgInfo.name : 'npm';
  const pkg = JSON.parse(
    fs.readFileSync(path.join(templateDir, `package.json`), 'utf-8')
  );

  pkg.name = packageName || getProjectName();
  pkg.scripts.start = getStartCommand(pkgManager);

  if (template === 'blog' && highlighter) {
    ensureSyntaxHighlighter(root, pkg, highlighter);
  }

  if (!skipTailwind) addTailwindDevDependencies(pkg);
  if (pkgManager === 'yarn') {
    addYarnDevDependencies(pkg, template);
  }

  write('package.json', JSON.stringify(pkg, null, 2));

  console.log(`\nInitializing git repository:`);
  execSync(`git init ${targetDir} && cd ${targetDir} && git add .`);

  // Fail Silent
  // Can fail when user does not have global git credentials
  try {
    execSync(`cd ${targetDir} && git commit -m "initial commit"`);
  } catch {}

  console.log(`\nDone. Now run:\n`);
  if (root !== cwd) {
    console.log(`  cd ${path.relative(cwd, root)}`);
  }
  console.log(`  ${getInstallCommand(pkgManager)}`);
  console.log(`  ${getStartCommand(pkgManager)}`);
  console.log();
}

/**
 * @param {string | undefined} targetDir
 */
function formatTargetDir(targetDir) {
  return targetDir?.trim().replace(/\/+$/g, '');
}

function copy(src, dest) {
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    copyDir(src, dest);
  } else {
    fs.copyFileSync(src, dest);
  }
}

/**
 * @param {string} projectName
 */
function isValidPackageName(projectName) {
  return /^(?:@[a-z0-9-*~][a-z0-9-*._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/.test(
    projectName
  );
}

/**
 * @param {string} projectName
 */
function toValidPackageName(projectName) {
  return projectName
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/^[._]/, '')
    .replace(/[^a-z0-9-~]+/g, '-');
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

/**
 * @param {string} path
 */
function isEmpty(path) {
  const files = fs.readdirSync(path);
  return files.length === 0 || (files.length === 1 && files[0] === '.git');
}

/**
 * @param {string} dir
 */
function emptyDir(dir) {
  if (!fs.existsSync(dir)) {
    return;
  }
  for (const file of fs.readdirSync(dir)) {
    fs.rmSync(path.resolve(dir, file), { recursive: true, force: true });
  }
}

/**
 * @param {string | undefined} userAgent process.env.npm_config_user_agent
 * @returns object | undefined
 */
function pkgFromUserAgent(userAgent) {
  if (!userAgent) return undefined;
  const pkgSpec = userAgent.split(' ')[0];
  const pkgSpecArr = pkgSpec.split('/');
  return {
    name: pkgSpecArr[0],
    version: pkgSpecArr[1],
  };
}

/**
 * @param {string} pkgManager
 * @returns string
 */
function getInstallCommand(pkgManager) {
  return pkgManager === 'yarn' ? 'yarn' : `${pkgManager} install`;
}

/**
 * @param {string} pkgManager
 * @returns string
 */
function getStartCommand(pkgManager) {
  return pkgManager === 'yarn' ? 'yarn dev' : `${pkgManager} run dev`;
}

function addTailwindDirectives(write, filesDir) {
  write(
    'src/styles.css',
    fs.readFileSync(path.join(filesDir, `styles.css`), 'utf-8')
  );
}

function addPostCssConfig(write, filesDir) {
  write(
    'postcss.config.cjs',
    fs.readFileSync(path.join(filesDir, `postcss.config.cjs`), 'utf-8')
  );
}

function addTailwindConfig(write, filesDir) {
  write(
    'tailwind.config.cjs',
    fs.readFileSync(path.join(filesDir, `tailwind.config.cjs`), 'utf-8')
  );
}

function addTailwindDevDependencies(pkg) {
  ['tailwindcss@^3.3.1', 'postcss@^8.4.21', 'autoprefixer@^10.4.14'].forEach(
    (packageName) => {
      const [name, version] = packageName.split('@');
      pkg.devDependencies[name] = version;
    }
  );
}

function addYarnDevDependencies(pkg, template) {
  // v18
  if (template === 'latest' || template === 'blog') {
    pkg.devDependencies['@nx/angular'] = ['^19.1.0'];
    pkg.devDependencies['@nx/devkit'] = ['^19.1.0'];
    pkg.devDependencies['@nx/vite'] = ['^19.1.0'];
    pkg.devDependencies['nx'] = ['^19.1.0'];
  } else if (template === 'angular-v17') {
    pkg.devDependencies['@angular-devkit/build-angular'] = ['^17.3.5'];
  }
}

function ensureSyntaxHighlighter(root, pkg, highlighter) {
  const appConfigPath = path.join(root, 'src/app/app.config.ts');
  const appConfigContent = fs.readFileSync(appConfigPath, 'utf-8');

  fs.writeFileSync(
    appConfigPath,
    appConfigContent
      .replace(/__HIGHLIGHTER__/g, HIGHLIGHTERS[highlighter].highlighter)
      .replace(
        /__HIGHLIGHTER_ENTRY_POINT__/g,
        HIGHLIGHTERS[highlighter].entryPoint
      )
  );

  const dependencies = HIGHLIGHTERS[highlighter].dependencies;
  for (const [name, version] of Object.entries(dependencies)) {
    pkg.dependencies[name] = version;
  }
}

init().catch((e) => {
  console.error(e);
});
