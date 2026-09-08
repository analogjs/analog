import { FlatCompat } from '@eslint/eslintrc';
import { dirname } from 'path';
import { fileURLToPath } from 'url';
import js from '@eslint/js';
import nx from '@nx/eslint-plugin';
import baseConfig from '../../eslint.config.mjs';

const compat = new FlatCompat({
  baseDirectory: dirname(fileURLToPath(import.meta.url)),
  recommendedConfig: js.configs.recommended,
});

export default [
  {
    ignores: ['**/dist', '**/out-tsc'],
  },
  ...baseConfig,
  ...compat.extends('plugin:storybook/recommended'),
  ...nx.configs['flat/angular'],
  ...nx.configs['flat/angular-template'],
  {
    files: ['**/*.ts'],
    rules: {
      '@angular-eslint/directive-selector': [
        'error',
        {
          type: 'attribute',
          prefix: 'analogjs',
          style: 'camelCase',
        },
      ],
      '@angular-eslint/component-selector': [
        'error',
        {
          type: 'element',
          prefix: 'analogjs',
          style: 'kebab-case',
        },
      ],
      '@angular-eslint/prefer-standalone': 'off',
    },
  },
  {
    files: ['**/*.html'],
    rules: {},
  },
  {
    ignores: [
      '**/vite.config.*.timestamp*',
      '**/vitest.config.*.timestamp*',
      'storybook-static',
    ],
  },
];
