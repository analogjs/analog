#!/usr/bin/env node
/**
 * `tsrx-types`: writes TypeScript declarations for every `.tsrx` file under a
 * tsconfig's directory, so `tsc` can type-check imports of them. Run it before
 * type-checking; the dev server keeps the declarations up to date afterwards.
 *
 *     tsrx-types [-p tsconfig.app.json] [--out-dir node_modules/.analog/tsrx-types]
 */

import { parseArgs } from 'node:util';

import {
  DEFAULT_TSRX_TYPES_DIR,
  formatTsrxTypeDiagnostics,
  generateTsrxTypes,
} from './lib/types.js';

const { values } = parseArgs({
  options: {
    project: { type: 'string', short: 'p', default: 'tsconfig.json' },
    'out-dir': { type: 'string', default: DEFAULT_TSRX_TYPES_DIR },
    help: { type: 'boolean', short: 'h' },
  },
});

if (values.help) {
  console.log(
    'Usage: tsrx-types [-p <tsconfig>] [--out-dir <dir, relative to the tsconfig>]',
  );
} else {
  const result = await generateTsrxTypes({
    tsconfig: values.project,
    outDir: values['out-dir'],
  });
  if (result.diagnostics.length > 0) {
    console.error(formatTsrxTypeDiagnostics(result.diagnostics));
    process.exitCode = 1;
  }
  console.log(
    `tsrx-types: ${result.written.length} written, ${result.removed.length} removed`,
  );
}
