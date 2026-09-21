import { defineEventHandler } from 'h3';
export default defineEventHandler(() => ({
  locale: process.env['ANALOG_I18N_LOCALE'],
  registryPresent: !!(globalThis as any).__ngComponentDefs,
  rssMB: process.memoryUsage().rss / 1024 ** 2,
}));
