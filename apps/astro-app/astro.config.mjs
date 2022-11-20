import { defineConfig } from 'astro/config';
import analogjsAngular from "@analogjs/astro-angular";

// https://astro.build/config
export default defineConfig({
  integrations: [analogjsAngular()]
});
