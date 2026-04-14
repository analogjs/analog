/**
 * Shared Angular name constants for the analog compiler.
 *
 * Centralised here to prevent drift when decorator sets are referenced
 * across multiple source files (compile, registry, JIT, metadata).
 */

/** All five Angular class decorators. */
export const ANGULAR_DECORATORS = new Set([
  'Component',
  'Directive',
  'Pipe',
  'Injectable',
  'NgModule',
]);

/**
 * Angular decorators that produce compilable declarations (selector, template,
 * pipe name, or module exports).  Excludes `@Injectable` which self-registers
 * via ɵprov and doesn't need Ivy compilation.
 */
export const COMPILABLE_DECORATORS = new Set([
  'Component',
  'Directive',
  'Pipe',
  'NgModule',
]);

/** Decorator names used on class fields and host bindings. */
export const FIELD_DECORATORS = new Set([
  'Input',
  'Output',
  'ViewChild',
  'ViewChildren',
  'ContentChild',
  'ContentChildren',
  'HostBinding',
  'HostListener',
]);

/** Signal-based reactive APIs that need downleveling or metadata extraction. */
export const SIGNAL_APIS = new Set([
  'input',
  'model',
  'output',
  'outputFromObservable',
  'viewChild',
  'viewChildren',
  'contentChild',
  'contentChildren',
]);
