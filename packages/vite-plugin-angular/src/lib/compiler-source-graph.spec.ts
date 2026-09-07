import { it, expect } from '@effect/vitest';
import * as Cause from 'effect/Cause';
import * as Effect from 'effect/Effect';
import * as Exit from 'effect/Exit';
import * as Layer from 'effect/Layer';
import { resolveConfig } from 'vite';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CompilerBackend } from './compiler-backend.js';
import { projectCompilerLayer } from './compiler-backend-live.js';
import {
  CompilerSourceGraph,
  type ResolvedSourceProject,
} from './compiler-source-graph.js';
import { sourceGraphLayer } from './compiler-source-graph-live.js';
import { TsconfigResolver } from './utils/tsconfig-resolver.js';

it.effect(
  'substitutes source discovery without accessing the native TypeScript filesystem',
  () =>
    Effect.gen(function* () {
      const config = yield* Effect.promise(() =>
        resolveConfig({ configFile: false }, 'build'),
      );
      const snapshot: ResolvedSourceProject = {
        options: {},
        rootNames: ['supplied.ts'],
        configuredRoots: [],
        errors: [],
      };
      const layer = projectCompilerLayer({
        config: () => config,
        tsconfig: () => 'does-not-exist.json',
        expandReferences: false,
        configure: () => {},
        compile: async (files, project) => {
          expect(files).toEqual(['changed.ts']);
          expect(project).toBe(snapshot);
          return ['supplied.ts'];
        },
      }).pipe(
        Layer.provide(
          Layer.succeed(CompilerSourceGraph, {
            resolve: (request) => {
              expect(request.tsconfig).toBe('does-not-exist.json');
              expect(request.refresh).toBe(false);
              return Effect.succeed(snapshot);
            },
          }),
        ),
      );
      expect(
        yield* Effect.flatMap(CompilerBackend, (backend) =>
          backend.compile({ generation: 1, files: ['changed.ts'] }),
        ).pipe(Effect.provide(layer)),
      ).toEqual({ updatedComponents: ['supplied.ts'] });
    }),
);

it.effect(
  'retains TypeScript configuration diagnostics as a typed failure',
  () =>
    Effect.gen(function* () {
      const root = yield* Effect.acquireRelease(
        Effect.promise(() => mkdtemp(join(tmpdir(), 'analog-source-graph-'))),
        (root) =>
          Effect.promise(() => rm(root, { recursive: true, force: true })),
      );
      const tsconfig = join(root, 'tsconfig.json');
      yield* Effect.promise(() =>
        writeFile(
          tsconfig,
          '{ "compilerOptions": { "target": "not-a-target" } }',
        ),
      );
      const config = yield* Effect.promise(() =>
        resolveConfig({ configFile: false, root }, 'build'),
      );
      const resolver = new TsconfigResolver({
        workspaceRoot: root,
        include: [],
        liveReload: false,
        isTest: false,
      });
      const result = yield* Effect.exit(
        Effect.flatMap(CompilerSourceGraph, (graph) =>
          graph.resolve({
            tsconfig,
            config,
            includes: [],
            refresh: true,
            expandReferences: false,
          }),
        ).pipe(Effect.provide(sourceGraphLayer(resolver))),
      );
      expect(Exit.isFailure(result)).toBe(true);
      if (Exit.isFailure(result))
        expect(Cause.squash(result.cause)).toMatchObject({
          _tag: 'SourceGraphFailure',
          file: tsconfig,
          cause: expect.arrayContaining([
            expect.objectContaining({ code: 6046 }),
          ]),
        });
    }),
);
