import { FlatCompat } from '@eslint/eslintrc';
import { dirname } from 'path';
import { fileURLToPath } from 'url';
import angularEslintPlugin from '@angular-eslint/eslint-plugin';
import angularTemplateEslintPlugin from '@angular-eslint/eslint-plugin-template';
import js from '@eslint/js';
import nxEslintPlugin from '@nx/eslint-plugin';
import oxlint from 'eslint-plugin-oxlint';
import { createJiti } from 'jiti';

const __dirname = dirname(fileURLToPath(import.meta.url));
const jiti = createJiti(import.meta.url);
const oxlintConfig = /** @type {{ default: import('oxlint').OxlintConfig }} */ (
  await jiti.import('./oxlint.config.ts')
).default;

const compat = new FlatCompat({
  baseDirectory: __dirname,
  recommendedConfig: js.configs.recommended,
});

export default [
  {
    ignores: [
      '**/dist',
      '**/out-tsc',
      '**/oxlint.config.ts',
      '**/playwright-report',
      '**/playwright-report/**',
    ],
  },
  {
    linterOptions: {
      // eslint-disable comments are still used by oxlint, so ESLint
      // should not warn about directives it considers unused.
      reportUnusedDisableDirectives: 'off',
    },
  },
  { plugins: { '@nx': nxEslintPlugin } },
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx'],
    rules: {
      '@nx/enforce-module-boundaries': [
        'error',
        {
          enforceBuildableLibDependency: true,
          allow: [],
          depConstraints: [
            {
              sourceTag: '*',
              onlyDependOnLibsWithTags: ['*'],
            },
          ],
        },
      ],
    },
  },
  ...compat
    .config({
      extends: ['plugin:@nx/typescript'],
    })
    .map((config) => ({
      ...config,
      files: ['**/*.ts', '**/*.tsx', '**/*.cts', '**/*.mts'],
    })),
  ...compat
    .config({
      extends: ['plugin:@nx/javascript'],
    })
    .map((config) => ({
      ...config,
      files: ['**/*.js', '**/*.jsx', '**/*.cjs', '**/*.mjs'],
    })),
  {
    files: [
      '**/apps/analog-app/src/**/*.ts',
      '**/apps/analog-app/src/**/*.tsx',
    ],
    plugins: {
      '@angular-eslint': angularEslintPlugin,
    },
    rules: {
      '@angular-eslint/component-selector': [
        'error',
        {
          type: 'element',
          prefix: ['analogjs', 'app', 'storybook'],
          style: 'kebab-case',
        },
      ],
    },
  },
  {
    files: [
      '**/apps/analog-app/src/stories/**/*.ts',
      '**/apps/analog-app/src/stories/**/*.tsx',
    ],
    plugins: {
      '@angular-eslint': angularEslintPlugin,
      '@angular-eslint/template': angularTemplateEslintPlugin,
    },
    rules: {
      '@angular-eslint/no-output-on-prefix': 'off',
      '@angular-eslint/template/prefer-control-flow': 'off',
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { disallowTypeAnnotations: false },
      ],
    },
  },
  {
    files: ['**/*.json'],
    // Override or add rules here
    rules: {},
    languageOptions: {
      parser: await import('jsonc-eslint-parser'),
    },
  },
  // Turn off ESLint rules already handled by oxlint
  ...oxlint.buildFromOxlintConfig(oxlintConfig),
];
