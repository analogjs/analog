/**
 * Differential parity tests. The propDecorators object emitted by
 * Analog's JIT transform is normalized and compared against a reference
 * oracle derived from Angular's upstream initializer-API transforms at
 * `@angular/compiler-cli/.../jit/src/initializer_api_transforms/`.
 *
 * Why evaluate instead of string-diff? The emit shape differs (Analog
 * writes static class fields; Angular writes `__decorate` calls), so
 * the comparable surface is what `ReflectionCapabilities.propMetadata`
 * sees at runtime.
 */
import { describe, it, expect } from 'vitest';
import { jitTransform } from './jit-transform.js';

type Annotation = { ngMetadataName: string; args: unknown[] };
type PropMeta = Record<string, Annotation[]>;

/** Make each Angular decorator capture its args verbatim when invoked. */
function decoratorStub(name: string): any {
  const fn: any = (...args: unknown[]) => ({ ngMetadataName: name, args });
  fn.ngMetadataName = name;
  return fn;
}

/** Initializer API: returns a callable signal so class-field eval succeeds.
 *  The returned value is irrelevant — we only inspect propDecorators. */
function signalStub(): any {
  const fn: any = () => () => undefined;
  fn.required = () => () => undefined;
  return fn;
}

const STUBS: Record<string, any> = {
  Component: decoratorStub('Component'),
  Directive: decoratorStub('Directive'),
  Injectable: decoratorStub('Injectable'),
  Pipe: decoratorStub('Pipe'),
  NgModule: decoratorStub('NgModule'),
  Input: decoratorStub('Input'),
  Output: decoratorStub('Output'),
  ViewChild: decoratorStub('ViewChild'),
  ViewChildren: decoratorStub('ViewChildren'),
  ContentChild: decoratorStub('ContentChild'),
  ContentChildren: decoratorStub('ContentChildren'),
  HostBinding: decoratorStub('HostBinding'),
  HostListener: decoratorStub('HostListener'),
  ElementRef: class ElementRef {},
  EventEmitter: class EventEmitter {},
  input: signalStub(),
  model: signalStub(),
  output: () => ({}),
  outputFromObservable: () => ({}),
  viewChild: signalStub(),
  viewChildren: () => () => [],
  contentChild: signalStub(),
  contentChildren: () => () => [],
  numberAttribute: (v: unknown) => Number(v),
  booleanAttribute: (v: unknown) => v != null && v !== 'false',
  // The JIT-compile entry points the transform appends after each
  // class. No-op stubs so eval doesn't crash.
  ɵcompileComponent: () => undefined,
  ɵcompileDirective: () => undefined,
  ɵcompilePipe: () => undefined,
  ɵcompileNgModule: () => undefined,
};

/** Rewrite `import { ... } from '@angular/core'` into a destructure from
 *  the stubs argument. Handles `as` renames. Drops all other imports.
 *  Also strips `export` so the body is valid inside `new Function`. */
function rewriteImports(code: string): string {
  return code
    .replace(
      /import\s+\{([^}]+)\}\s+from\s+['"]@angular\/core['"];?/g,
      (_, specs: string) => {
        const destructured = specs
          .split(',')
          .map((s) => {
            const m = s.trim().match(/^(\S+)(?:\s+as\s+(\S+))?$/);
            if (!m) return '';
            const [, imported, local] = m;
            return local ? `${imported}: ${local}` : imported;
          })
          .filter(Boolean)
          .join(', ');
        return `const { ${destructured} } = __stubs__;`;
      },
    )
    .replace(/^\s*import\b[^\n]*\n/gm, '')
    .replace(/^\s*export\s+(?=(class|const|let|var|function))/gm, '');
}

/** Find the first top-level class name in the emitted JS. */
function firstClassName(code: string): string {
  const m = code.match(/(?:export\s+)?class\s+(\w+)/);
  if (!m) throw new Error('parity harness: no class declaration found');
  return m[1];
}

/** Normalize the emitted `propDecorators` from `{type: <stub>, args: [...]}`
 *  shape to the `{ngMetadataName, args}` shape produced by Angular's
 *  `__decorate` runtime so deep-equal works against the oracle. */
function normalize(propDecs: any): PropMeta {
  const out: PropMeta = {};
  if (!propDecs) return out;
  for (const [field, entries] of Object.entries(propDecs)) {
    out[field] = (entries as any[]).map((e) => ({
      ngMetadataName: e.type?.ngMetadataName ?? String(e.type),
      args: e.args ?? [],
    }));
  }
  return out;
}

/**
 * Run a source string through jitTransform, evaluate the result with
 * stubs, and return the runtime-visible propDecorators object.
 */
function reflect(source: string): PropMeta {
  // The fixtures below avoid TS-only syntax (no `: type` annotations,
  // no `<T>` generics), so the jitTransform output is already valid JS
  // once decorators are stripped — no TS-to-JS pass needed.
  const emitted = jitTransform(source, 'fixture.ts').code;
  const rewritten = rewriteImports(emitted);
  const className = firstClassName(rewritten);
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  const fn = new Function('__stubs__', `${rewritten}\nreturn ${className};`);
  const Cls = fn(STUBS);
  return normalize(Cls.propDecorators);
}

/**
 * Reference oracle. Each entry mirrors the corresponding upstream
 * transform's emit shape. Pinned to file references so divergences
 * (e.g. when Angular changes its emit) are easy to spot in review.
 */
const ref = {
  // Mirrors compiler-cli/.../initializer_api_transforms/input_function.ts
  // (spec: initializer_api_transforms_spec.ts lines 113-117, 270-273).
  // Note: Angular's transform always emits an explicit `alias` (defaulting
  // to the class field name) and `transform: undefined`. Analog emits the
  // minimal object — alias only when user-supplied, no transform key at
  // all. Both shapes are runtime-equivalent: jit_compiler_facade.ts:524
  // falls back to `ann.alias || field`, and absent vs undefined transform
  // are treated identically at line 531. The oracle below reflects what
  // the runtime actually needs, which is what Analog emits.
  input(
    field: string,
    opts: { alias?: string; required?: boolean } = {},
  ): PropMeta {
    const args: Record<string, unknown> = {
      isSignal: true,
      required: !!opts.required,
    };
    if (opts.alias !== undefined) args.alias = opts.alias;
    return {
      [field]: [
        {
          ngMetadataName: 'Input',
          args: [args],
        },
      ],
    };
  },

  // Mirrors compiler-cli/.../initializer_api_transforms/model_function.ts
  // (spec lines 378-403).
  model(
    field: string,
    opts: { alias?: string; required?: boolean } = {},
  ): PropMeta {
    const binding = opts.alias ?? field;
    return {
      [field]: [
        {
          ngMetadataName: 'Input',
          args: [{ isSignal: true, alias: binding, required: !!opts.required }],
        },
        { ngMetadataName: 'Output', args: [binding + 'Change'] },
      ],
    };
  },

  // Mirrors compiler-cli/.../initializer_api_transforms/output_function.ts.
  // Note: Angular emits the resolved bindingPropertyName as a string
  // positional arg even when no alias is given. Analog relies on the
  // runtime fallback (jit_compiler_facade.ts:534 — `ann.alias || field`)
  // and emits no arg in the no-alias case. Both are runtime-equivalent;
  // the harness handles this asymmetry below via `expectOutput`.
  output(field: string, opts: { alias?: string } = {}): PropMeta {
    return {
      [field]: [
        {
          ngMetadataName: 'Output',
          args: opts.alias ? [opts.alias] : [],
        },
      ],
    };
  },

  // Mirrors compiler-cli/.../initializer_api_transforms/query_functions.ts.
  query(
    kind: 'ViewChild' | 'ViewChildren' | 'ContentChild' | 'ContentChildren',
    field: string,
    predicate: unknown,
    opts: object = {},
  ): PropMeta {
    return {
      [field]: [
        {
          ngMetadataName: kind,
          args: [predicate, { ...opts, isSignal: true }],
        },
      ],
    };
  },
};

/** Relaxed assertion for outputs without an alias — accept either the
 *  empty-args (Analog) or property-name-as-arg (Angular) form. */
function expectOutputNoAlias(meta: PropMeta, field: string) {
  expect(meta[field]).toHaveLength(1);
  expect(meta[field][0].ngMetadataName).toBe('Output');
  const arg0 = meta[field][0].args[0];
  expect(arg0 === undefined || arg0 === field).toBe(true);
}

describe('JIT propDecorators parity with Angular reference', () => {
  describe('input()', () => {
    it('plain input()', () => {
      const meta = reflect(`
        import { Component, input } from '@angular/core';
        @Component({ selector: 'x', template: '' })
        export class X { name = input(); }
      `);
      expect(meta).toEqual(ref.input('name'));
    });

    it('input.required()', () => {
      const meta = reflect(`
        import { Component, input } from '@angular/core';
        @Component({ selector: 'x', template: '' })
        export class X { id = input.required(); }
      `);
      expect(meta).toEqual(ref.input('id', { required: true }));
    });

    it('input() with alias', () => {
      const meta = reflect(`
        import { Component, input } from '@angular/core';
        @Component({ selector: 'x', template: '' })
        export class X { id = input(0, { alias: 'publicId' }); }
      `);
      expect(meta).toEqual(ref.input('id', { alias: 'publicId' }));
    });

    it('input.required() with alias', () => {
      const meta = reflect(`
        import { Component, input } from '@angular/core';
        @Component({ selector: 'x', template: '' })
        export class X { id = input.required({ alias: 'publicId' }); }
      `);
      expect(meta).toEqual(
        ref.input('id', { alias: 'publicId', required: true }),
      );
    });

    // Would have caught: input transform double-application.
    it('drops transform from the decorator config', () => {
      const meta = reflect(`
        import { Component, input, numberAttribute } from '@angular/core';
        @Component({ selector: 'x', template: '' })
        export class X { size = input(0, { transform: numberAttribute }); }
      `);
      const opts = meta.size[0].args[0] as Record<string, unknown>;
      expect(opts.transform).toBeUndefined();
      expect(opts.isSignal).toBe(true);
      expect(opts.required).toBe(false);
    });

    it('drops transform from input.required() config', () => {
      const meta = reflect(`
        import { Component, input, booleanAttribute } from '@angular/core';
        @Component({ selector: 'x', template: '' })
        export class X { open = input.required({ transform: booleanAttribute }); }
      `);
      const opts = meta.open[0].args[0] as Record<string, unknown>;
      expect(opts.transform).toBeUndefined();
      expect(opts.required).toBe(true);
    });
  });

  describe('model()', () => {
    // Would have caught: Output on the wrong field key.
    it('places Input and Output on the same field', () => {
      const meta = reflect(`
        import { Component, model } from '@angular/core';
        @Component({ selector: 'x', template: '' })
        export class X { value = model(0); }
      `);
      expect(meta).toEqual(ref.model('value'));
      expect(meta.valueChange).toBeUndefined();
    });

    // Would have caught: model.required() silently non-required.
    it('honors .required', () => {
      const meta = reflect(`
        import { Component, model } from '@angular/core';
        @Component({ selector: 'x', template: '' })
        export class X { value = model.required(); }
      `);
      expect(meta).toEqual(ref.model('value', { required: true }));
    });

    // Would have caught: alias ignored, Change suffix on property name.
    it('threads alias through Input and Change output', () => {
      const meta = reflect(`
        import { Component, model } from '@angular/core';
        @Component({ selector: 'x', template: '' })
        export class X { value = model(0, { alias: 'pub' }); }
      `);
      expect(meta).toEqual(ref.model('value', { alias: 'pub' }));
    });

    it('model.required() with alias', () => {
      const meta = reflect(`
        import { Component, model } from '@angular/core';
        @Component({ selector: 'x', template: '' })
        export class X { value = model.required({ alias: 'pub' }); }
      `);
      expect(meta).toEqual(
        ref.model('value', { alias: 'pub', required: true }),
      );
    });
  });

  describe('output() / outputFromObservable()', () => {
    it('plain output() — no alias', () => {
      const meta = reflect(`
        import { Component, output } from '@angular/core';
        @Component({ selector: 'x', template: '' })
        export class X { ready = output(); }
      `);
      expectOutputNoAlias(meta, 'ready');
    });

    it('output() with alias', () => {
      const meta = reflect(`
        import { Component, output } from '@angular/core';
        @Component({ selector: 'x', template: '' })
        export class X { ready = output({ alias: 'readyPub' }); }
      `);
      expect(meta).toEqual(ref.output('ready', { alias: 'readyPub' }));
    });

    it('outputFromObservable — no alias', () => {
      const meta = reflect(`
        import { Component, outputFromObservable } from '@angular/core';
        @Component({ selector: 'x', template: '' })
        export class X { ready = outputFromObservable(null); }
      `);
      expectOutputNoAlias(meta, 'ready');
    });

    // Would have caught: outputFromObservable reading wrong args index.
    it('outputFromObservable threads alias from args[1]', () => {
      const meta = reflect(`
        import { Component, outputFromObservable } from '@angular/core';
        @Component({ selector: 'x', template: '' })
        export class X {
          ready = outputFromObservable(null, { alias: 'readyPub' });
        }
      `);
      expect(meta).toEqual(ref.output('ready', { alias: 'readyPub' }));
    });
  });

  describe('queries', () => {
    // Would have caught: missing isSignal (analogjs/analog#2344).
    it('viewChild emits isSignal: true', () => {
      const meta = reflect(`
        import { Component, viewChild } from '@angular/core';
        @Component({ selector: 'x', template: '<div #r></div>' })
        export class X { r = viewChild('r'); }
      `);
      expect(meta).toEqual(ref.query('ViewChild', 'r', 'r'));
    });

    it('viewChild.required emits isSignal: true', () => {
      const meta = reflect(`
        import { Component, viewChild } from '@angular/core';
        @Component({ selector: 'x', template: '<div #r></div>' })
        export class X { r = viewChild.required('r'); }
      `);
      expect(meta).toEqual(ref.query('ViewChild', 'r', 'r'));
    });

    // Would have caught: dropped second positional argument.
    it('viewChild preserves the read option alongside isSignal', () => {
      const meta = reflect(`
        import { Component, viewChild, ElementRef } from '@angular/core';
        @Component({ selector: 'x', template: '<div #r></div>' })
        export class X { r = viewChild('r', { read: ElementRef }); }
      `);
      expect(meta).toEqual({
        r: [
          {
            ngMetadataName: 'ViewChild',
            args: ['r', { read: STUBS.ElementRef, isSignal: true }],
          },
        ],
      });
    });

    it('viewChildren / contentChild / contentChildren all carry isSignal', () => {
      const meta = reflect(`
        import { Component, viewChildren, contentChild, contentChildren } from '@angular/core';
        @Component({ selector: 'x', template: '' })
        export class X {
          vs = viewChildren('v');
          c = contentChild('c');
          cs = contentChildren('cs');
        }
      `);
      expect(meta).toEqual({
        ...ref.query('ViewChildren', 'vs', 'v'),
        ...ref.query('ContentChild', 'c', 'c'),
        ...ref.query('ContentChildren', 'cs', 'cs'),
      });
    });
  });

  describe('decorator + signal coexistence', () => {
    // Would have caught: duplicate metadata entries.
    it('@Input on a field with input() — only the explicit decorator', () => {
      const meta = reflect(`
        import { Component, Input, input } from '@angular/core';
        @Component({ selector: 'x', template: '' })
        export class X { @Input() name = input(); }
      `);
      expect(meta.name).toHaveLength(1);
      expect(meta.name[0].ngMetadataName).toBe('Input');
      const arg0 = meta.name[0].args[0] as any;
      expect(arg0?.isSignal).toBeUndefined();
    });

    it('@Input on a field with model() — only the explicit decorator, no synthetic Change', () => {
      const meta = reflect(`
        import { Component, Input, model } from '@angular/core';
        @Component({ selector: 'x', template: '' })
        export class X { @Input() value = model(0); }
      `);
      expect(meta.value).toHaveLength(1);
      expect(meta.value[0].ngMetadataName).toBe('Input');
      expect(meta.valueChange).toBeUndefined();
    });

    it('@ViewChild on a field with viewChild() — only the explicit decorator', () => {
      const meta = reflect(`
        import { Component, ViewChild, viewChild, ElementRef } from '@angular/core';
        @Component({ selector: 'x', template: '<div #r></div>' })
        export class X { @ViewChild('r') r = viewChild('r'); }
      `);
      expect(meta.r).toHaveLength(1);
      expect(meta.r[0].ngMetadataName).toBe('ViewChild');
      const arg1 = meta.r[0].args[1] as any;
      expect(arg1?.isSignal).toBeUndefined();
    });
  });
});
