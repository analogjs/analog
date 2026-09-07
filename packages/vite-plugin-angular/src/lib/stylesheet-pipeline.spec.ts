import { it, expect } from '@effect/vitest';
import { Cause, Effect, Exit, Layer } from 'effect';
import { expectTypeOf } from 'vitest';
import { AnalogStylesheetRegistry } from './stylesheet-registry.js';
import {
  StylesheetCompiler,
  StylesheetFailure,
  transformStylesheet,
  type StylesheetRequest,
} from './stylesheet-pipeline.js';

const request: StylesheetRequest = {
  data: 'before',
  containingFile: '/src/component.ts',
  resourceFile: undefined,
  className: 'Component',
  order: 0,
  inlineStylesExtension: 'css',
  registry: undefined,
  preprocessor: (code) => ({
    code: `${code} after`,
    dependencies: [{ id: '/src/theme.css' }],
  }),
};

it.effect(
  'externalizes preprocessed CSS and its dependencies without compiling it twice',
  () =>
    Effect.gen(function* () {
      const registry = new AnalogStylesheetRegistry();
      const result = yield* transformStylesheet({ ...request, registry });
      expect(result).toBeTypeOf('string');
      if (result !== undefined)
        expect(registry.getServedContent(result)).toBe('before after');
      expect(registry.getDependenciesForSource('/src/component.css')).toEqual([
        { id: '/src/theme.css' },
      ]);
    }).pipe(
      Effect.provide(
        Layer.succeed(StylesheetCompiler, {
          compile: () =>
            Effect.die('Externalized CSS must be compiled by Vite later'),
        }),
      ),
    ),
);

it.effect(
  'preserves an empty compiled stylesheet and exposes the compiler dependency',
  () =>
    Effect.gen(function* () {
      expect(yield* transformStylesheet(request)).toBe('');
      expectTypeOf<
        Effect.Services<ReturnType<typeof transformStylesheet>>
      >().toEqualTypeOf<StylesheetCompiler>();
    }).pipe(
      Effect.provide(
        Layer.succeed(StylesheetCompiler, {
          compile: (code, file) => {
            expect(code).toBe('before after');
            expect(file).toBe('/src/component.css?direct');
            return Effect.succeed('');
          },
        }),
      ),
    ),
);

it.effect(
  'preserves preprocessing failure, filename and cause instead of dropping CSS',
  () =>
    Effect.gen(function* () {
      const cause = new Error('invalid stylesheet');
      const result = yield* Effect.exit(
        transformStylesheet({
          ...request,
          preprocessor: () => {
            throw cause;
          },
        }),
      );
      expect(Exit.isFailure(result)).toBe(true);
      if (Exit.isFailure(result)) {
        const error = Cause.squash(result.cause);
        expect(error).toBeInstanceOf(StylesheetFailure);
        expect(error).toMatchObject({
          file: '/src/component.css',
          phase: 'preprocess',
          cause,
        });
        expect(Cause.hasFails(result.cause)).toBe(true);
        expect(Cause.hasDies(result.cause)).toBe(false);
      }
    }).pipe(
      Effect.provide(
        Layer.succeed(StylesheetCompiler, {
          compile: () => Effect.die('Preprocessing failed first'),
        }),
      ),
    ),
);
