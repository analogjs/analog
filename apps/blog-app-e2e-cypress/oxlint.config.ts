import { defineConfig } from 'oxlint';
import baseConfig from '../../oxlint.config.ts';

export default defineConfig({
  extends: [baseConfig],
  jsPlugins: [{ name: 'cypress', specifier: 'eslint-plugin-cypress' }],
  overrides: [
    {
      files: ['**/*.ts', '**/*.js'],
      rules: {
        'cypress/no-unnecessary-waiting': 'error',
        'cypress/unsafe-to-chain-command': 'error',
      },
    },
  ],
});
