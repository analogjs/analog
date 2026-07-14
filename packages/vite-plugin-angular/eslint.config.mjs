import baseConfig from '../../eslint.config.mjs';

export default [
  {
    // `tcb-vendor/` is a verbatim upstream snapshot (see tcb-vendor/VENDORING.md);
    // never lint or reformat it, so refreshes stay diff-clean against Angular.
    ignores: ['**/dist', '**/out-tsc', 'tcb-vendor/**'],
  },
  ...baseConfig,
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx'],
    // Override or add rules here
    rules: {},
  },
  {
    files: ['**/*.ts', '**/*.tsx'],
    // Override or add rules here
    rules: {},
  },
  {
    files: ['**/*.js', '**/*.jsx'],
    // Override or add rules here
    rules: {},
  },
  {
    files: ['**/*.ts'],
    rules: {
      '@angular-eslint/prefer-standalone': 'off',
    },
  },
  {
    ignores: ['**/vite.config.*.timestamp*', '**/vitest.config.*.timestamp*'],
  },
];
