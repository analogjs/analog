import * as vite from 'vite';

export function isRolldown(): boolean {
  return !!vite.rolldownVersion;
}

export function getJsTransformConfigKey(): 'oxc' | 'esbuild' {
  return isRolldown() ? 'oxc' : 'esbuild';
}

export function getBundleOptionsKey(): 'rolldownOptions' | 'rollupOptions' {
  return isRolldown() ? 'rolldownOptions' : 'rollupOptions';
}
