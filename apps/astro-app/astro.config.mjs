import { defineConfig } from 'astro/config';
import angular from "@analogjs/astro-angular";

// https://astro.build/config
export default defineConfig({
  outDir: '../../dist/apps/astro-app',
  integrations: [angular({
    vite: {
      tsconfig: 'apps/astro-app/tsconfig.app.json'
    }
  })]
});
