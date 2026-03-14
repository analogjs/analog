/**
 * Minimal ESLint config — only for Angular HTML template linting.
 * All JS/TS linting is handled by oxlint (see .oxlintrc.json).
 */
export default [
  {
    ignores: ['**/dist', '**/out-tsc', '**/node_modules'],
  },
];
