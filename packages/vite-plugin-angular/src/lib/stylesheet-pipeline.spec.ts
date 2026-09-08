import { ResourceDependencies } from './resource-dependencies.js';
import { it, expect } from '@effect/vitest';
import * as Cause from 'effect/Cause';
import * as Effect from 'effect/Effect';
import * as Exit from 'effect/Exit';
import * as Layer from 'effect/Layer';
import { expectTypeOf } from 'vitest';
import { AnalogStylesheetRegistry } from './stylesheet-registry.js';
import {
  createStylesheetTransform,
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

it('tracks preprocessor and Sass dependencies and removes obsolete imports', async () => {
  const dependencies = new ResourceDependencies();
  let imports = new Set(['/src/old.scss']);
  const transform = createStylesheetTransform(
    async () => ({ code: 'compiled', deps: imports }),
    dependencies,
  );
  const external = { ...request, resourceFile: '/src/component.scss' };
  await transform(external);
  expect(dependencies.owners('/src/theme.css')).toEqual([
    '/src/component.scss',
  ]);
  expect(dependencies.owners('/src/old.scss')).toEqual(['/src/component.scss']);
  imports = new Set(['/src/new.scss']);
  await transform(external);
  expect(dependencies.owners('/src/old.scss')).toEqual([]);
  expect(dependencies.owners('/src/new.scss')).toEqual(['/src/component.scss']);
});
