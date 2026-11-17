// `@analogjs/vite-plugin-tsrx/types`: declaration generation for `.tsrx`
// files. Separate from the main entry so the plugin doesn't load TypeScript.
export {
  DEFAULT_TSRX_TYPES_DIR,
  formatTsrxTypeDiagnostics,
  generateTsrxTypes,
  TsrxTypeGenerator,
  type TsrxTypeDiagnostic,
  type TsrxTypesOptions,
  type TsrxTypesResult,
} from './lib/types.js';
