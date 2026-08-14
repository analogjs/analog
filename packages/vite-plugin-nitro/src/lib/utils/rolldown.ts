import * as vite from 'vite';

export function isRolldown(): boolean {
  return !!vite.rolldownVersion;
}

export function getBundleOptionsKey(): 'rolldownOptions' | 'rollupOptions' {
  return isRolldown() ? 'rolldownOptions' : 'rollupOptions';
}
