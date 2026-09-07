import * as Schema from 'effect/Schema';
import type { PluginOptions } from './plugin-options.js';
import type { DebugModeOptions, DebugOption } from './debug-options.js';

const Strings = Schema.mutable(Schema.Array(Schema.String));
const DebugSettings = Schema.Struct({
  scopes: Schema.optional(Schema.Union([Schema.Boolean, Strings])),
  mode: Schema.optional(Schema.Literals(['build', 'dev'])),
  logFile: Schema.optional(
    Schema.Union([Schema.Boolean, Schema.Literals(['single', 'scoped'])]),
  ),
});
const Replacement = Schema.Union([
  Schema.Struct({
    replace: Schema.String,
    with: Schema.String,
    ssr: Schema.optional(Schema.String),
  }),
  Schema.Struct({
    replace: Schema.String,
    ssr: Schema.String,
    with: Schema.optional(Schema.String),
  }),
]);
const Options = Schema.Struct({
  tsconfig: Schema.optional(
    Schema.Union([
      Schema.String,
      Schema.declare<() => string>(
        (value): value is () => string => typeof value === 'function',
      ),
    ]),
  ),
  workspaceRoot: Schema.optional(Schema.String),
  inlineStylesExtension: Schema.optional(Schema.String),
  jit: Schema.optional(Schema.Boolean),
  supportedBrowsers: Schema.optional(Strings),
  include: Schema.optional(Strings),
  liveReload: Schema.optional(Schema.Boolean),
  disableTypeChecking: Schema.optional(Schema.Boolean),
  fileReplacements: Schema.optional(Schema.mutable(Schema.Array(Replacement))),
  fastCompile: Schema.optional(Schema.Boolean),
  fastCompileMode: Schema.optional(Schema.Literals(['full', 'partial'])),
  experimental: Schema.optional(
    Schema.Struct({
      useAngularCompilationAPI: Schema.optional(Schema.Boolean),
      ssrHmrWarmup: Schema.optional(Schema.Boolean),
      componentStyleHmr: Schema.optional(Schema.Literals(['auto', 'metadata'])),
    }),
  ),
  debug: Schema.optional(
    Schema.Union([
      Schema.Boolean,
      Strings,
      DebugSettings,
      Schema.mutable(Schema.Array(DebugSettings)),
    ]),
  ),
});

/** Decode only Analog-owned configuration at the synchronous Vite boundary. */
export function parsePluginOptions(input: unknown): PluginOptions {
  const value = Schema.decodeUnknownSync(Options)(input, {
    onExcessProperty: 'error',
  });
  // Explicit undefined has always selected the public default. Normalize it
  // to an omitted key while keeping internal exact-optional contracts.
  return {
    ...normalizeProjectOptions(value),
    ...normalizeCompilationOptions(value),
    ...(value.debug === undefined
      ? {}
      : { debug: normalizeDebug(value.debug) }),
  };
}

function normalizeProjectOptions(value: typeof Options.Type): PluginOptions {
  return {
    ...(value.tsconfig === undefined ? {} : { tsconfig: value.tsconfig }),
    ...(value.workspaceRoot === undefined
      ? {}
      : { workspaceRoot: value.workspaceRoot }),
    ...(value.inlineStylesExtension === undefined
      ? {}
      : { inlineStylesExtension: value.inlineStylesExtension }),
    ...(value.supportedBrowsers === undefined
      ? {}
      : { supportedBrowsers: value.supportedBrowsers }),
    ...(value.include === undefined ? {} : { include: value.include }),
    ...(value.fileReplacements === undefined
      ? {}
      : { fileReplacements: value.fileReplacements }),
  };
}

function normalizeCompilationOptions(
  value: typeof Options.Type,
): PluginOptions {
  return {
    ...(value.jit === undefined ? {} : { jit: value.jit }),
    ...(value.liveReload === undefined ? {} : { liveReload: value.liveReload }),
    ...(value.disableTypeChecking === undefined
      ? {}
      : { disableTypeChecking: value.disableTypeChecking }),
    ...(value.fastCompile === undefined
      ? {}
      : { fastCompile: value.fastCompile }),
    ...(value.fastCompileMode === undefined
      ? {}
      : { fastCompileMode: value.fastCompileMode }),
    ...(value.experimental === undefined
      ? {}
      : {
          experimental: {
            ...(value.experimental.useAngularCompilationAPI === undefined
              ? {}
              : {
                  useAngularCompilationAPI:
                    value.experimental.useAngularCompilationAPI,
                }),
            ...(value.experimental.ssrHmrWarmup === undefined
              ? {}
              : { ssrHmrWarmup: value.experimental.ssrHmrWarmup }),
            ...(value.experimental.componentStyleHmr === undefined
              ? {}
              : { componentStyleHmr: value.experimental.componentStyleHmr }),
          },
        }),
  };
}

function normalizeDebugSettings(
  value: typeof DebugSettings.Type,
): DebugModeOptions {
  return {
    ...(value.scopes === undefined ? {} : { scopes: value.scopes }),
    ...(value.mode === undefined ? {} : { mode: value.mode }),
    ...(value.logFile === undefined ? {} : { logFile: value.logFile }),
  };
}

function normalizeDebug(
  value: NonNullable<typeof Options.Type.debug>,
): DebugOption {
  if (typeof value === 'boolean' || Schema.is(Strings)(value)) return value;
  return Array.isArray(value)
    ? value.map(normalizeDebugSettings)
    : normalizeDebugSettings(value);
}
