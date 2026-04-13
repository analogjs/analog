#!/usr/bin/env node

// @ts-check
import { blue, green, red, reset, yellow } from 'kolorist';
import minimist from 'minimist';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import prompts from 'prompts';

/**
 * @typedef {'latest' | 'blog' | 'minimal'} Template
 * @typedef {'prismjs' | 'shiki'} HighlighterId
 * @typedef {(value: string) => string} Colorizer
 *
 * @typedef {object} Variant
 * @property {string} name
 * @property {Template} template
 * @property {Colorizer} color
 *
 * @typedef {object} AppDefinition
 * @property {string} name
 * @property {Colorizer} color
 * @property {readonly Variant[]} variants
 *
 * @typedef {object} HighlighterConfig
 * @property {string} highlighter
 * @property {string} entryPoint
 * @property {Record<string, string>} dependencies
 *
 * @typedef {object} PackageJson
 * @property {string} [name]
 * @property {Record<string, string>} [scripts]
 * @property {Record<string, string>} [dependencies]
 * @property {Record<string, string>} [devDependencies]
 *
 * @typedef {object} PromptAnswers
 * @property {string} [projectName]
 * @property {boolean} [overwrite]
 * @property {string} [packageName]
 * @property {Template} [variant]
 * @property {boolean} [tailwind]
 * @property {HighlighterId} [syntaxHighlighter]
 *
 * @typedef {object} UserAgentPackage
 * @property {string} name
 * @property {string} version
 *
 * @typedef {{
 *   _: string[];
 *   template?: string;
 *   t?: string;
 *   skipTailwind?: boolean | string;
 *   skipGit?: boolean | string;
 * } & Record<string, unknown>} CliArgv
 */

const CLI_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_TARGET_DIR = 'analog-project';
const DEFAULT_BLOG_HIGHLIGHTER = 'prismjs';

/** @type {readonly Template[]} */
const H3_TEMPLATES = ['latest', 'blog', 'minimal'];

// Avoids autoconversion to number of the project name by defining that the args
// non associated with an option ( _ ) needs to be parsed as a string. See #4606
/** @type {CliArgv} */
const argv = minimist(process.argv.slice(2), { string: ['_'] });
const cwd = process.cwd();

/** @type {readonly AppDefinition[]} */
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

/** @type {Readonly<Record<HighlighterId, HighlighterConfig>>} */
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
      marked: '^18.0.0',
      'marked-shiki': '^1.1.0',
      shiki: '^1.6.1',
    },
  },
};

/** @type {Readonly<Record<string, string>>} */
const renameFiles = {
  _gitignore: '.gitignore',
};

const TAILWIND_POSTCSS_CONFIG = `export default {
  plugins: {
    '@tailwindcss/postcss': {},
  },
};
`;

async function init() {
  let targetDir = formatTargetDir(argv._[0]);
  let template = resolveTemplate(argv.template ?? argv.t);
  let skipTailwind = fromBoolArg(argv.skipTailwind);
  const skipGit = fromBoolArg(argv.skipGit ?? argv['skip-git']) ?? false;

  const getProjectName = () =>
    targetDir === '.' ? path.basename(path.resolve()) : (targetDir ?? '');

  /** @type {PromptAnswers} */
  let result = {};

  try {
    result = /** @type {PromptAnswers} */ (
      await prompts(
        [
          {
            type: targetDir ? null : 'text',
            name: 'projectName',
            message: reset('Project name:'),
            initial: DEFAULT_TARGET_DIR,
            onState: (state) => {
              targetDir =
                formatTargetDir(String(state.value ?? '')) ||
                DEFAULT_TARGET_DIR;
            },
          },
          {
            type: () =>
              !targetDir || !fs.existsSync(targetDir) || isEmpty(targetDir)
                ? null
                : 'confirm',
            name: 'overwrite',
            message: () =>
              (targetDir === '.'
                ? 'Current directory'
                : `Target directory "${targetDir}"`) +
              ' is not empty. Remove existing files and continue?',
          },
          {
            type: (_, promptState = {}) => {
              if (promptState.overwrite === false) {
                throw new Error(`${red('✖')} Operation cancelled`);
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
              isValidPackageName(String(dir)) || 'Invalid package.json name',
          },
          {
            type: template ? null : 'select',
            name: 'variant',
            message: reset('What would you like to start?:'),
            choices: APPS[0].variants.map((variant) => ({
              title: variant.color(variant.name),
              value: variant.template,
            })),
          },
          {
            type: (prev) => (prev === 'blog' ? 'select' : null),
            name: 'syntaxHighlighter',
            message: reset('Choose a syntax highlighter:'),
            choices:
              /** @type {{ title: HighlighterId; value: HighlighterId }[]} */ (
                Object.keys(HIGHLIGHTERS).map((highlighter) => ({
                  title: /** @type {HighlighterId} */ (highlighter),
                  value: /** @type {HighlighterId} */ (highlighter),
                }))
              ),
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
            throw new Error(`${red('✖')} Operation cancelled`);
          },
        },
      )
    );
  } catch (error) {
    console.log(error instanceof Error ? error.message : String(error));
    return;
  }

  const { overwrite, packageName, variant, tailwind, syntaxHighlighter } =
    result;

  template = variant ?? template;
  if (!template) {
    throw new Error('A project template must be selected.');
  }

  const highlighter =
    syntaxHighlighter ??
    (template === 'blog' ? DEFAULT_BLOG_HIGHLIGHTER : undefined);

  const root = path.join(cwd, targetDir ?? DEFAULT_TARGET_DIR);

  if (overwrite) {
    emptyDir(root);
  } else if (!fs.existsSync(root)) {
    fs.mkdirSync(root, { recursive: true });
  }

  skipTailwind = skipTailwind ?? !tailwind;

  console.log(`\nScaffolding project in ${root}...`);

  const templateDir = path.resolve(CLI_DIR, `template-${template}`);
  const filesDir = path.resolve(CLI_DIR, 'files');

  /**
   * @param {string} file
   * @param {string | undefined} [content]
   */
  const write = (file, content) => {
    const targetPath = renameFiles[file]
      ? path.join(root, renameFiles[file])
      : path.join(root, file);

    if (typeof content === 'string') {
      fs.writeFileSync(targetPath, content);
      return;
    }

    copy(path.join(templateDir, file), targetPath);
  };

  const files = fs.readdirSync(templateDir);
  for (const file of files.filter((entry) => entry !== 'package.json')) {
    write(file);
  }

  if (!skipTailwind) {
    addTailwindDirectives(write, filesDir);
    write('postcss.config.mjs', TAILWIND_POSTCSS_CONFIG);
  }

  replacePlaceholders(root, 'vite.config.ts', {
    __TAILWIND_IMPORT__: !skipTailwind
      ? "import tailwindcss from '@tailwindcss/vite';\n"
      : '',
    __TAILWIND_PLUGIN__: !skipTailwind ? '    tailwindcss(),\n' : '',
  });

  /** @type {PackageJson} */
  const pkg = JSON.parse(
    fs.readFileSync(path.join(templateDir, 'package.json'), 'utf-8'),
  );
  const pkgManager =
    pkgFromUserAgent(process.env.npm_config_user_agent)?.name ?? 'npm';

  pkg.name = packageName || getProjectName();
  pkg.scripts ??= {};
  pkg.dependencies ??= {};
  pkg.devDependencies ??= {};
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

  if (pkgManager === 'pnpm') {
    addPnpmDependencies(pkg, template);
  }

  pkg.dependencies = sortObjectKeys(pkg.dependencies);
  pkg.devDependencies = sortObjectKeys(pkg.devDependencies);

  write('package.json', JSON.stringify(pkg, null, 2));

  setProjectTitle(root, getProjectName());

  if (!skipGit) {
    console.log('\nInitializing git repository:');
    execFileSync('git', ['init', targetDir], { stdio: 'inherit' });
    execFileSync('git', ['-C', targetDir, 'add', '.'], { stdio: 'inherit' });

    // Can fail when the user does not have global git credentials.
    try {
      execFileSync('git', ['-C', targetDir, 'commit', '-m', 'initial commit'], {
        stdio: 'inherit',
      });
    } catch {
      /* ignore */
    }
  }

  console.log('\nDone. Now run:\n');
  if (root !== cwd) {
    console.log(`  cd ${path.relative(cwd, root)}`);
  }
  console.log(`  ${getInstallCommand(pkgManager)}`);
  console.log(`  ${getStartCommand(pkgManager)}`);
  console.log();
}

/**
 * @param {string | undefined} targetDir
 * @returns {string | undefined}
 */
function formatTargetDir(targetDir) {
  return targetDir?.trim().replace(/\/+$/g, '');
}

/**
 * @param {string} src
 * @param {string} dest
 * @returns {void}
 */
function copy(src, dest) {
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    copyDir(src, dest);
    return;
  }

  fs.copyFileSync(src, dest);
}

/**
 * @param {string} projectName
 * @returns {boolean}
 */
function isValidPackageName(projectName) {
  return /^(?:@[a-z0-9-*~][a-z0-9-*._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/.test(
    projectName,
  );
}

/**
 * @param {string} projectName
 * @returns {string}
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
 * @returns {void}
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
 * @param {string} directoryPath
 * @returns {boolean}
 */
function isEmpty(directoryPath) {
  const files = fs.readdirSync(directoryPath);
  return files.length === 0 || (files.length === 1 && files[0] === '.git');
}

/**
 * @param {string} dir
 * @returns {void}
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
 * @param {string | undefined} userAgent
 * @returns {UserAgentPackage | undefined}
 */
function pkgFromUserAgent(userAgent) {
  if (!userAgent) {
    return undefined;
  }

  const pkgSpec = userAgent.split(' ')[0];
  const [name, version] = pkgSpec.split('/');
  if (!name || !version) {
    return undefined;
  }

  return { name, version };
}

/**
 * @param {string} pkgManager
 * @returns {string}
 */
function getInstallCommand(pkgManager) {
  return pkgManager === 'yarn' ? 'yarn' : `${pkgManager} install`;
}

/**
 * @param {string} pkgManager
 * @returns {string}
 */
function getStartCommand(pkgManager) {
  return pkgManager === 'yarn' ? 'yarn dev' : `${pkgManager} run dev`;
}

/**
 * @param {(file: string, content?: string) => void} write
 * @param {string} filesDir
 * @returns {void}
 */
function addTailwindDirectives(write, filesDir) {
  write(
    'src/styles.css',
    fs.readFileSync(path.join(filesDir, 'styles.css'), 'utf-8'),
  );
}

/**
 * @param {PackageJson} pkg
 * @returns {void}
 */
function addTailwindDependencies(pkg) {
  pkg.devDependencies ??= {};
  pkg.devDependencies.postcss = '^8.5.6';
  pkg.devDependencies.tailwindcss = '^4.2.2';
  pkg.devDependencies['@tailwindcss/postcss'] = '^4.2.2';
  pkg.devDependencies['@tailwindcss/vite'] = '^4.2.2';
}

/**
 * @param {PackageJson} pkg
 * @param {Template} template
 * @returns {void}
 */
function addYarnDevDependencies(pkg, template) {
  if (H3_TEMPLATES.includes(template)) {
    pkg.devDependencies ??= {};
    pkg.devDependencies.h3 = '^1.13.0';
  }
}

/**
 * @param {PackageJson} pkg
 * @param {Template} template
 * @returns {void}
 */
function addPnpmDependencies(pkg, template) {
  if (H3_TEMPLATES.includes(template)) {
    pkg.dependencies ??= {};
    pkg.dependencies.h3 = '^1.13.0';
  }
}

/**
 * @param {string} root
 * @param {PackageJson} pkg
 * @param {HighlighterId} highlighter
 * @returns {void}
 */
function ensureSyntaxHighlighter(root, pkg, highlighter) {
  const config = HIGHLIGHTERS[highlighter];

  replacePlaceholders(root, 'src/app/app.config.ts', {
    __HIGHLIGHTER__: config.highlighter,
    __HIGHLIGHTER_ENTRY_POINT__: config.entryPoint,
  });

  pkg.dependencies ??= {};
  for (const [name, version] of Object.entries(config.dependencies)) {
    pkg.dependencies[name] = version;
  }

  replacePlaceholders(root, 'vite.config.ts', {
    __CONTENT_HIGHLIGHTER__: highlighter,
  });
}

/**
 * @param {Record<string, string>} obj
 * @returns {Record<string, string>}
 */
function sortObjectKeys(obj) {
  return Object.keys(obj)
    .sort()
    .reduce((result, key) => {
      result[key] = obj[key];
      return result;
    }, /** @type {Record<string, string>} */ ({}));
}

/**
 * @param {string} root
 * @param {string} title
 * @returns {void}
 */
function setProjectTitle(root, title) {
  replacePlaceholders(root, ['index.html', 'README.md'], {
    __PROJECT_TITLE__: title,
  });
}

/**
 * @param {string} root
 * @param {string | readonly string[]} files
 * @param {Record<string, string>} config
 * @returns {void}
 */
function replacePlaceholders(root, files, config) {
  for (const file of toArray(files)) {
    const filePath = path.join(root, file);
    const fileContent = fs.readFileSync(filePath, 'utf-8');
    const newFileContent = Object.keys(config).reduce(
      (content, placeholder) =>
        content.replaceAll(placeholder, config[placeholder]),
      fileContent,
    );
    fs.writeFileSync(filePath, newFileContent);
  }
}

/**
 * @param {string | readonly string[] | undefined | null} value
 * @returns {string[]}
 */
function toArray(value) {
  if (value == null) {
    return [];
  }

  return Array.isArray(value) ? [...value] : [/** @type {string} */ (value)];
}

/**
 * @param {unknown} arg
 * @returns {boolean | undefined}
 */
function fromBoolArg(arg) {
  if (typeof arg === 'boolean' || typeof arg === 'undefined') {
    return arg;
  }

  if (typeof arg !== 'string') {
    return undefined;
  }

  return arg === '' || arg === 'true';
}

/**
 * @param {string | undefined} value
 * @returns {Template | undefined}
 */
function resolveTemplate(value) {
  return isTemplate(value) ? value : undefined;
}

/**
 * @param {string | undefined} value
 * @returns {value is Template}
 */
function isTemplate(value) {
  return value === 'latest' || value === 'blog' || value === 'minimal';
}

init().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
