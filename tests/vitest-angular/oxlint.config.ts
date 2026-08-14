import { defineConfig } from 'oxlint';
import baseConfig from '../../oxlint.config.ts';

export default defineConfig({
  extends: [baseConfig],
  jsPlugins: [
    { name: '@angular-eslint', specifier: '@angular-eslint/eslint-plugin' },
  ],
  overrides: [
    {
      files: ['src/**/*.ts'],
      rules: {
        '@angular-eslint/directive-selector': [
          'error',
          { type: 'attribute', prefix: 'lib', style: 'camelCase' },
        ],
        '@angular-eslint/component-selector': [
          'error',
          { type: 'element', prefix: 'lib', style: 'kebab-case' },
        ],
      },
    },
  ],
});
