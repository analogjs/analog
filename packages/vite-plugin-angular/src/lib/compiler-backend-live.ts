import { Effect, Layer } from 'effect';
import type { ResolvedConfig } from 'vite';
import {
  CompilerBackend,
  CompilationFailure,
  CompilerReleaseFailure,
  type CompilerFailure,
  type CompilationRequest,
} from './compiler-backend.js';
import {
  CompilerSourceGraph,
  SourceGraphFailure,
  type ResolvedSourceProject,
} from './compiler-source-graph.js';
import {
  discoverAnalogIntegrations,
  type AnalogIntegrations,
} from './analog-plugin-interop.js';
import { StylesheetFailure } from './stylesheet-pipeline.js';

function compilationFailure(cause: unknown): CompilerFailure {
  return cause instanceof StylesheetFailure ||
    cause instanceof SourceGraphFailure
    ? cause
    : new CompilationFailure({ cause });
}

/** Adapter for Angular's non-abortable compiler APIs. */
export function nativeCompilerLayer(options: {
  readonly compile: (
    files: string[] | undefined,
  ) => Promise<readonly string[] | void>;
  readonly close?: () => void | Promise<void>;
}): Layer.Layer<CompilerBackend> {
  return Layer.effect(
    CompilerBackend,
    Effect.gen(function* () {
      yield* Effect.addFinalizer(() =>
        Effect.tryPromise({
          try: async () => {
            await options.close?.();
          },
          catch: (cause) => new CompilerReleaseFailure({ cause }),
        }).pipe(Effect.orDie),
      );
      const compile = Effect.fn('analog.backend.compile')(function* (
        request: CompilationRequest,
      ) {
        const updatedComponents = yield* Effect.tryPromise({
          try: () => options.compile(request.files?.slice()),
          catch: compilationFailure,
        });
        return { updatedComponents: updatedComponents ?? [] };
      });
      return CompilerBackend.of({ compile });
    }),
  );
}

/** Resolve shared dependencies before entering Angular's native compiler adapter. */
export function projectCompilerLayer(options: {
  readonly config: () => ResolvedConfig;
  readonly tsconfig: () => string;
  readonly expandReferences: boolean;
  readonly configure: (integrations: AnalogIntegrations) => void;
  readonly compile: (
    files: string[] | undefined,
    project: ResolvedSourceProject,
  ) => Promise<readonly string[] | void>;
  readonly close?: () => void | Promise<void>;
}): Layer.Layer<CompilerBackend, never, CompilerSourceGraph> {
  return Layer.effect(
    CompilerBackend,
    Effect.gen(function* () {
      const graph = yield* CompilerSourceGraph;
      yield* Effect.addFinalizer(() =>
        Effect.tryPromise({
          try: async () => {
            await options.close?.();
          },
          catch: (cause) => new CompilerReleaseFailure({ cause }),
        }).pipe(Effect.orDie),
      );
      const compile = Effect.fn('analog.project.compile')(function* (
        request: CompilationRequest,
      ) {
        const config = options.config();
        const integrations = yield* Effect.tryPromise({
          try: () => discoverAnalogIntegrations(config),
          catch: compilationFailure,
        });
        options.configure(integrations);
        const project = yield* graph.resolve({
          tsconfig: options.tsconfig(),
          config,
          includes: integrations.include,
          refresh: request.files === undefined,
          expandReferences: options.expandReferences,
        });
        const updatedComponents = yield* Effect.tryPromise({
          try: () => options.compile(request.files?.slice(), project),
          catch: compilationFailure,
        });
        return { updatedComponents: updatedComponents ?? [] };
      });
      return CompilerBackend.of({ compile });
    }),
  );
}
