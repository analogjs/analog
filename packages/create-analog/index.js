#!/usr/bin/env node

// @ts-check
import { blue, green, red, reset, yellow } from 'kolorist';
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
        name: 'Full-stack Application',
        template: 'latest',
        color: green,
      },
      {
        name: 'Blog',
        template: 'blog',
        color: yellow,
      },
      {
        name: 'Minimal',
        template: 'minimal',
        color: blue,
      },
    ],
  },
];
const HIGHLIGHTERS = {
  prismjs: {
    highlighter: 'withPrismHighlighter',
    entryPoint: 'prism-highlighter',
    dependencies: {
      'marked-highlight': '^2.2.1',
      prismjs: '^1.29.0',
    },
  },
  shiki: {
    highlighter: 'withShikiHighlighter',
    entryPoint: 'shiki-highlighter',
    dependencies: {
      marked: '^15.0.7',
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
  let skipTailwind = fromBoolArg(argv.skipTailwind);
  let useAnalogSFC = fromBoolArg(argv.analogSFC);

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
          type: skipTailwind === undefined ? 'confirm' : null,
          name: 'tailwind',
          message: 'Would you like to add Tailwind to your project?',
        },
      ],
      {
        onCancel: () => {
          throw new Error(red('✖') + ' Operation cancelled');
        },
      },
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
    analogSFC,
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
  let highlighter = syntaxHighlighter ?? (template === 'blog' ? 'prism' : null);
  skipTailwind = skipTailwind ?? !tailwind;
  useAnalogSFC = useAnalogSFC ?? analogSFC;

  console.log(`\nScaffolding project in ${root}...`);

  const templateDir = path.resolve(
    fileURLToPath(import.meta.url),
    '..',
    `template-${template}`,
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
    addTailwindDirectives(write, filesDir);
  }

  replacePlaceholders(root, 'vite.config.ts', {
    __TAILWIND_IMPORT__: !skipTailwind
      ? `\nimport tailwindcss from '@tailwindcss/vite';`
      : '',
    __TAILWIND_PLUGIN__: !skipTailwind ? '\n    tailwindcss()' : '',
  });

  const pkgInfo = pkgFromUserAgent(process.env.npm_config_user_agent);
  const pkgManager = pkgInfo ? pkgInfo.name : 'npm';
  const pkg = JSON.parse(
    fs.readFileSync(path.join(templateDir, `package.json`), 'utf-8'),
  );

  pkg.name = packageName || getProjectName();
  pkg.scripts.start = getStartCommand(pkgManager);

  if (template === 'blog' && highlighter) {
    ensureSyntaxHighlighter(root, pkg, highlighter);
  }

  if (!skipTailwind) {
    addTailwindDependencies(pkg);
  }

  if (pkgManager === 'yarn') {
    addYarnDevDependencies(pkg, template);
  }

  pkg.dependencies = sortObjectKeys(pkg.dependencies);
  pkg.devDependencies = sortObjectKeys(pkg.devDependencies);

  write('package.json', JSON.stringify(pkg, null, 2));

  setProjectTitle(root, getProjectName());
  setComponentFormat(root, filesDir, write, template, useAnalogSFC);

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
    projectName,
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
    fs.readFileSync(path.join(filesDir, `styles.css`), 'utf-8'),
  );
}

function addTailwindDependencies(pkg) {
  pkg.dependencies['tailwindcss'] = '^4.1.4';
  pkg.dependencies['postcss'] = '^8.5.3';
  pkg.dependencies['@tailwindcss/vite'] = '^4.1.4';
}

function addYarnDevDependencies(pkg, template) {
  // v18
  if (template === 'latest' || template === 'blog' || template === 'minimal') {
    pkg.devDependencies['@nx/angular'] = '^21.0.0';
    pkg.devDependencies['@nx/devkit'] = '^21.0.0';
    pkg.devDependencies['@nx/vite'] = '^21.0.0';
    pkg.devDependencies['nx'] = '^21.0.0';
  } else if (template === 'angular-v17') {
    pkg.devDependencies['@angular-devkit/build-angular'] = '^17.2.0';
  }
}

function ensureSyntaxHighlighter(root, pkg, highlighter) {
  replacePlaceholders(root, 'src/app/app.config.ts', {
    __HIGHLIGHTER__: HIGHLIGHTERS[highlighter].highlighter,
    __HIGHLIGHTER_ENTRY_POINT__: HIGHLIGHTERS[highlighter].entryPoint,
  });

  const dependencies = HIGHLIGHTERS[highlighter].dependencies;
  for (const [name, version] of Object.entries(dependencies)) {
    pkg.dependencies[name] = version;
  }

  replacePlaceholders(root, 'vite.config.ts', {
    __CONTENT_HIGHLIGHTER__: highlighter,
  });
}

function sortObjectKeys(obj) {
  return Object.keys(obj)
    .sort()
    .reduce((result, key) => {
      result[key] = obj[key];
      return result;
    }, {});
}

function setProjectTitle(root, title) {
  replacePlaceholders(root, ['index.html', 'README.md'], {
    __PROJECT_TITLE__: title,
  });
}

function setComponentFormat(root, filesDir, write, template, useAnalogSFC) {
  const getSFCConfig = () => {
    const sfcConfigOption =
      'vite: { experimental: { supportAnalogFormat: true } }';

    return template === 'latest'
      ? `{ ${sfcConfigOption} }`
      : `\n      ${sfcConfigOption},`;
  };

  replacePlaceholders(root, 'vite.config.ts', {
    __ANALOG_SFC_CONFIG__: useAnalogSFC ? getSFCConfig() : '',
  });
  replacePlaceholders(root, ['src/main.ts', 'src/main.server.ts'], {
    __APP_COMPONENT__: useAnalogSFC ? 'App' : 'AppComponent',
    __APP_COMPONENT_IMPORT__: useAnalogSFC
      ? "import App from './app/app-root.ag';"
      : "import { AppComponent } from './app/app';",
  });

  const cmpForDelete = useAnalogSFC ? 'app' : 'app-root';
  const deleteExt = useAnalogSFC ? 'ts' : 'ag';
  deleteFiles(root, [
    useAnalogSFC ? `src/app/${cmpForDelete}.ts` : `src/app/${cmpForDelete}.ag`,
    template === 'blog'
      ? [
          `src/app/pages/blog/index.page.${deleteExt}`,
          `src/app/pages/blog/[slug].page.${deleteExt}`,
        ]
      : `src/app/pages/index.page.${deleteExt}`,
    template !== 'minimal' && `src/app/${cmpForDelete}.spec.ts`,
  ]);

  if (useAnalogSFC) {
    write(
      'src/analog-env.d.ts',
      fs.readFileSync(path.join(filesDir, 'analog-env.d.ts'), 'utf-8'),
    );
  }
}

function replacePlaceholders(root, files, config) {
  for (const file of toFlatArray(files)) {
    const filePath = path.join(root, file);
    const fileContent = fs.readFileSync(filePath, 'utf-8');
    const newFileContent = Object.keys(config).reduce(
      (content, placeholder) =>
        content.replace(RegExp(placeholder, 'g'), config[placeholder]),
      fileContent,
    );
    fs.writeFileSync(filePath, newFileContent);
  }
}

function deleteFiles(root, files) {
  for (const file of toFlatArray(files)) {
    fs.unlinkSync(path.join(root, file));
  }
}

function toFlatArray(value) {
  return (Array.isArray(value) ? value : [value]).filter(Boolean).flat();
}

function fromBoolArg(arg) {
  return ['boolean', 'undefined'].includes(typeof arg)
    ? arg
    : ['', 'true'].includes(arg);
}

init().catch((e) => {
  console.error(e);
});
