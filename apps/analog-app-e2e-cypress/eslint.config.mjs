import baseConfig from '../../eslint.config.mjs';
import cypress from 'eslint-plugin-cypress';

const cypressFiles = ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx'];

export default [
  {
    ignores: ['**/dist', '**/out-tsc'],
  },
  ...baseConfig,
  {
    ...cypress.configs.recommended,
    files: cypressFiles,
  },
  {
    files: cypressFiles,
    // Override or add rules here
    rules: {},
  },
  {
    files: ['src/plugins/index.js'],
    rules: {
      '@typescript-eslint/no-var-requires': 'off',
      'no-undef': 'off',
    },
  },
];
