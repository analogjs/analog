import * as Arrays from 'effect/Array';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import {
  CompilerSourceGraph,
  SourceGraphFailure,
} from './compiler-source-graph.js';
import type { TsconfigResolver } from './utils/tsconfig-resolver.js';
import { formatDiagnostics } from '@angular/compiler-cli';

/** A native TypeScript graph has one cache owner and releases it with the compiler. */
export function sourceGraphLayer(
  resolver: TsconfigResolver,
): Layer.Layer<CompilerSourceGraph> {
  return Layer.effect(
    CompilerSourceGraph,
    Effect.gen(function* () {
      yield* Effect.addFinalizer(() =>
        Effect.sync(() => resolver.invalidateAll()),
      );
      return CompilerSourceGraph.of({
        resolve: Effect.fn('analog.sourceGraph.resolve')(function* (request) {
          return yield* Effect.try({
            try: () => {
              if (request.refresh) resolver.invalidateAll();
              resolver.setIntegrationIncludes(request.includes);
              const project = resolver.getCachedTsconfigOptions(
                request.tsconfig,
                request.config,
              );
              // An empty project can gain inputs through integrations or watch
              // events. Other configuration errors must retain their diagnostics.
              const errors = project.errors.filter(
                (error) => error.code !== 18002 && error.code !== 18003,
              );
              if (errors.length)
                throw new SourceGraphFailure({
                  file: request.tsconfig,
                  cause: errors,
                  message: formatDiagnostics(errors),
                });
              const references = request.expandReferences
                ? resolver.collectExpandedTsconfigRoots(
                    request.tsconfig,
                    request.config,
                  )
                : [];
              return {
                ...project,
                configuredRoots: project.rootNames,
                rootNames: Arrays.dedupe([
                  ...project.rootNames,
                  ...references,
                  ...resolver.ensureIncludeCache(),
                ]),
              };
            },
            catch: (cause) =>
              cause instanceof SourceGraphFailure
                ? cause
                : new SourceGraphFailure({
                    file: request.tsconfig,
                    cause,
                    message: `Unable to resolve TypeScript source graph ${request.tsconfig}: ${cause instanceof Error ? cause.message : String(cause)}`,
                  }),
          });
        }),
      });
    }),
  );
}
