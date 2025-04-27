/// <reference types="vitest" />

import { defineConfig } from 'vite';
import analog from '@analogjs/platform';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  build: {
    target: ['es2020'],
  },
  optimizeDeps: {
    include: ['@supabase/supabase-js', '@supabase/ssr']
  },
  resolve: {
    mainFields: ['module', 'browser']
  },
  plugins: [analog(__ANALOG_SFC_CONFIG__)],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['src/test-setup.ts'],
    include: ['**/*.spec.ts'],
    reporters: ['default'],
  },
  define: {
    'import.meta.vitest': mode !== 'production',
  },
}));
