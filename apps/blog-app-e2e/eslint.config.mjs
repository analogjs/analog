import baseConfig from '../../eslint.config.mjs';
import playwright from 'eslint-plugin-playwright';

export default [
  {
    ignores: ['**/dist', '**/out-tsc', '**/playwright-report'],
  },
  ...baseConfig,
  {
    ...playwright.configs['flat/recommended'],
    files: ['**/*.ts', '**/*.js'],
  },
  {
    files: ['**/*.ts', '**/*.js'],
    rules: {},
  },
];
