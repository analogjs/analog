import * as vite from 'vite';

export function isRolldown(): boolean {
  return !!vite.rolldownVersion;
}

export function getJsTransformConfigKey(): 'oxc' | 'esbuild' {
  return isRolldown() ? 'oxc' : 'esbuild';
}
