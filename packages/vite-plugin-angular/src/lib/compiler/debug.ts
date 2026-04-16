import { createDebug } from 'obug';

// Structured debug output for the Analog compiler. Activated via the
// `DEBUG` environment variable, e.g.:
//
//   DEBUG=analog-compiler npm run build           # top-level events
//   DEBUG=analog-compiler:* npm run build         # everything
//   DEBUG=analog-compiler:registry npm run build  # only registry
//
// Each namespace is a `Debugger` from obug — callable like console.log
// (with %s/%d/%O formatters), with a `.enabled` boolean for cheap
// gating before expensive payload construction.

const root = createDebug('analog-compiler');

/**
 * Top-level compile/transform events: per-file start, end, timing,
 * fatal errors that get rethrown after logging.
 */
export const debugCompile = root;

/**
 * Registry scanning of `.ts` and `.d.ts` files. Useful when a directive
 * or pipe is not being recognized as a dependency — turning this on
 * shows what the registry actually saw.
 */
export const debugRegistry = root.extend('registry');

/**
 * Cross-file dependency resolution decisions: how an `imports: [...]`
 * entry was resolved to underlying directives, NgModule export
 * expansion, tuple barrel expansion.
 */
export const debugResolve = root.extend('resolve');

/**
 * Code emission and helper hoisting: which Ivy instructions were
 * emitted, where helpers were inserted, type-only import elision.
 */
export const debugEmit = root.extend('emit');
