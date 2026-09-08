import * as Context from 'effect/Context';
import * as Data from 'effect/Data';
import type * as Effect from 'effect/Effect';
import type { ResolvedConfig } from 'vite';
import type { SourceProject } from './utils/tsconfig-resolver.js';

export class SourceGraphFailure extends Data.TaggedError('SourceGraphFailure')<{
  readonly file: string;
  readonly cause: unknown;
  readonly message: string;
}> {}

export interface SourceGraphRequest {
  readonly tsconfig: string;
  readonly config: ResolvedConfig;
  readonly includes: string[];
  readonly refresh: boolean;
  readonly expandReferences: boolean;
}

export interface ResolvedSourceProject extends SourceProject {
  readonly configuredRoots: readonly string[];
}

export class CompilerSourceGraph extends Context.Service<
  CompilerSourceGraph,
  {
    readonly resolve: (
      request: SourceGraphRequest,
    ) => Effect.Effect<ResolvedSourceProject, SourceGraphFailure>;
  }
>()('@analogjs/vite-plugin-angular/CompilerSourceGraph') {}
