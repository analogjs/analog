import type { CompilerSession } from './compiler-session.js';
import { Context, Data, type Effect } from 'effect';
import type { Plugin } from 'vite';
import type { SourceGraphFailure } from './compiler-source-graph.js';
import type { StylesheetFailure } from './stylesheet-pipeline.js';

export interface CompilerPlugin extends Plugin {
  api: {
    invalidate(files: readonly string[]): Promise<void>;
    defer(files: readonly string[]): void;
    watch: CompilerSession['watch'];
    resourceOwners(file: string): readonly string[];
    read<A>(reader: () => A): Promise<A>;
  };
}

export interface CompilationRequest {
  readonly generation: number;
  readonly files: readonly string[] | undefined;
}

export interface CompilationResult {
  readonly updatedComponents: readonly string[];
}

export class CompilationFailure extends Data.TaggedError('CompilationFailure')<{
  readonly cause: unknown;
}> {}

export class CompilerReleaseFailure extends Data.TaggedError(
  'CompilerReleaseFailure',
)<{
  readonly cause: unknown;
}> {}

export type CompilerFailure =
  | CompilationFailure
  | SourceGraphFailure
  | StylesheetFailure;

/** Native compiler state belongs to the Layer that implements this port. */
export class CompilerBackend extends Context.Service<
  CompilerBackend,
  {
    readonly compile: (
      request: CompilationRequest,
    ) => Effect.Effect<CompilationResult, CompilerFailure>;
  }
>()('@analogjs/vite-plugin-angular/CompilerBackend') {}
