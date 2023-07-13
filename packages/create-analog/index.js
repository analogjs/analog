#!/usr/bin/env node

// @ts-check
import { green, red, reset, yellow } from 'kolorist';
import minimist from 'minimist';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
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
        name: 'angular-v16',
        display: 'TypeScript',
        color: green,
      },
      {
        name: 'angular-v15',
        display: 'TypeScript',
        color: green,
      },
    ],
  },
];

const TEMPLATES = APPS.map(
  (f) => (f.variants && f.variants.map((v) => v.name)) || [f.name]
).reduce((a, b) => a.concat(b), []);

const UI_FRAMEWORKS = [
  {
    name: 'none',
    display: 'None',
    color: yellow,
  },
  {
    name: 'tailwind',
    display: 'Tailwind',
    color: yellow,
  },
  {
    name: 'material',
    display: 'Angular Material',
    color: yellow,
  },
];

const renameFiles = {
  _gitignore: '.gitignore',
};

async function init() {
  let usedTargetDir = formatTargetDir(argv._[0]);
  let usedTemplate = argv.template || argv.t;
  let usedUi = argv.ui || false;

  const defaultTargetDir = 'analog-project';
  const getProjectName = () =>
    usedTargetDir === '.' ? path.basename(path.resolve()) : usedTargetDir;

  let result = {};

  try {
    result = await prompts(
      [
        {
          type: usedTargetDir ? null : 'text',
          name: 'projectName',
          message: reset('Project name:'),
          initial: defaultTargetDir,
          onState: (state) => {
            usedTargetDir = formatTargetDir(state.value) || defaultTargetDir;
          },
        },
        {
          type: () =>
            !fs.existsSync(usedTargetDir) || isEmpty(usedTargetDir)
              ? null
              : 'confirm',
          name: 'overwrite',
          message: () =>
            (usedTargetDir === '.'
              ? 'Current directory'
              : `Target directory "${usedTargetDir}"`) +
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
          type:
            usedTemplate && TEMPLATES.includes(usedTemplate) ? null : 'select',
          name: 'framework',
          message:
            typeof usedTemplate === 'string' &&
            !TEMPLATES.includes(usedTemplate)
              ? reset(
                  `"${usedTemplate}" isn't a valid template. Please choose from below: `
                )
              : reset('Select a template:'),
          initial: 0,
          choices: APPS.map((framework) => {
            const frameworkColor = framework.color;
            return {
              title: frameworkColor(framework.name),
              value: framework,
            };
          }),
        },
        {
          type: (framework) =>
            framework && framework.variants ? 'select' : null,
          name: 'variant',
          message: reset('Select a variant:'),
          // @ts-ignore
          choices: (framework) =>
            framework.variants.map((variant) => {
              const variantColor = variant.color;
              return {
                title: variantColor(variant.name),
                value: variant.name,
              };
            }),
        },
        {
          type:
            usedUi && UI_FRAMEWORKS?.map((ui) => ui.name).includes(usedUi)
              ? null
              : 'select',
          name: 'ui',
          message: reset('Select a UI framework:'),
          // @ts-ignore
          choices: () =>
            UI_FRAMEWORKS.map((framework) => {
              const variantColor = framework.color;
              return {
                title: variantColor(framework.name),
                value: framework.name,
              };
            }),
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
  const { framework, overwrite, packageName, variant, ui } = result;

  const root = path.join(cwd, usedTargetDir);

  if (overwrite) {
    emptyDir(root);
  } else if (!fs.existsSync(root)) {
    fs.mkdirSync(root, { recursive: true });
  }

  // determine template
  usedTemplate = variant || framework || usedTemplate;
  usedUi = ui || usedUi;

  console.log(`\nScaffolding project in ${root}...`);

  const templateDir = path.resolve(
    fileURLToPath(import.meta.url),
    '..',
    `template-${usedTemplate}`
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

  switch (usedUi) {
    case 'material':
      addMaterialStylesSCSS(write, root, filesDir);
      addMaterialIndex(write, root, filesDir);
      addStyleExtensions(write, root);
      break;
    case 'tailwind':
      addTailwindConfig(write, filesDir);
      addPostCssConfig(write, filesDir);
      addTailwindDirectives(write, filesDir);
      break;
    case 'none':
    default:
      break;
  }

  const pkgInfo = pkgFromUserAgent(process.env.npm_config_user_agent);
  const pkgManager = pkgInfo ? pkgInfo.name : 'npm';
  const pkg = JSON.parse(
    fs.readFileSync(path.join(templateDir, `package.json`), 'utf-8')
  );

  pkg.name = packageName || getProjectName();
  pkg.scripts.start = getStartCommand(pkgManager);

  switch (usedUi) {
    case 'material':
      addMaterialDependencies(pkg, usedTemplate);
      break;
    case 'tailwind':
      addTailwindDevDependencies(pkg);
      break;
    case 'none':
    default:
      break;
  }

  write('package.json', JSON.stringify(pkg, null, 2));

  console.log(`\nInitializing git repository:`);
  execSync(`git init ${usedTargetDir} && cd ${usedTargetDir} && git add .`);

  // Fail Silent
  // Can fail when user does not have global git credentials
  try {
    execSync(`cd ${usedTargetDir} && git commit -m "initial commit"`);
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
    fs.readFileSync(path.join(filesDir, 'tailwind', `styles.css`), 'utf-8')
  );
}

function addPostCssConfig(write, filesDir) {
  write(
    'postcss.config.js',
    fs.readFileSync(
      path.join(filesDir, 'tailwind', `postcss.config.js`),
      'utf-8'
    )
  );
}

function addTailwindConfig(write, filesDir) {
  write(
    'tailwind.config.js',
    fs.readFileSync(
      path.join(filesDir, 'tailwind', `tailwind.config.js`),
      'utf-8'
    )
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

function addMaterialStylesSCSS(write, root, filesDir) {
  // remove old styles.css
  if (fs.existsSync(path.join(root, `src/styles.css`))) {
    fs.unlinkSync(path.join(root, `src/styles.css`));
  }

  write(
    'src/styles.scss',
    fs.readFileSync(
      path.join(filesDir, 'angular-material', `styles.scss`),
      'utf-8'
    )
  );
}

function addStyleExtensions(write, root) {
  // update vite.config.ts to add `inlineStylesExtension` to the analog vite plugin
  const viteConfig = fs.readFileSync(
    path.join(root, 'vite.config.ts'),
    'utf-8'
  );
  const updatedViteConfig = viteConfig.replace(
    `plugins: [analog()],`,
    `plugins: [
    analog({
      vite: {
        inlineStylesExtension: 'scss',
      },
    })
  ],`
  );
  write('vite.config.ts', updatedViteConfig);
}

function addMaterialIndex(write, root, filesDir) {
  // remove old styles.css
  if (fs.existsSync(path.join(root, `src/index.html`))) {
    fs.unlinkSync(path.join(root, `src/index.html`));
  }

  write(
    'src/index.html',
    fs.readFileSync(
      path.join(filesDir, 'angular-material', `index.html`),
      'utf-8'
    )
  );
}

function addMaterialDependencies(pkg, variant) {
  const angularVersion = variant?.replace('angular-v', '');
  [
    `@angular/cdk@^${angularVersion}`,
    `@angular/material@^${angularVersion}`,
  ].forEach((packageName) => {
    // split on last @ to get name and version
    const [name, version] = packageName.split(/@(?=[^@]*$)/);
    pkg.dependencies[name] = version;
  });
}

init().catch((e) => {
  console.error(e);
});
