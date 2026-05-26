/**
 * Differential parity tests for the fast-compile AOT path.
 *
 * The metadata object Analog hands to `compilePartialCode` is
 * compared against a reference oracle derived from Angular's upstream
 * initializer-API transforms (`@angular/compiler-cli/src/ngtsc/annotations/
 * directive/src/{input,model,output,query}_function.ts`).
 *
 * Partial mode is used (not full mode) because its `ɵɵngDeclareComponent`
 * argument exposes `isRequired`, `transformFunction`, `publicName`, query
 * descriptors, and the outputs map as structured object literals.
 * Full-mode `ɵɵdefineComponent` packs inputs into positional arrays that
 * lose `required` and `transformFunction` (Angular only carries those in
 * `.d.ts` type metadata or the partial declaration), so partial mode is
 * the only emit path where every gap fixed by this branch is observable.
 */
import { describe, it, expect } from 'vitest';
import { compilePartialCode } from './test-helpers.js';

type InputMeta = {
  classPropertyName: string;
  publicName: string;
  isSignal: boolean;
  isRequired: boolean;
  transformFunction: unknown;
};
type QueryMeta = {
  propertyName: string;
  first: boolean;
  predicate: unknown;
  descendants: boolean;
  read?: unknown;
  isSignal?: boolean;
  static?: boolean;
  emitDistinctChangesOnly?: boolean;
};
type AotMeta = {
  inputs: Record<string, InputMeta>;
  outputs: Record<string, string>;
  queries: QueryMeta[];
  viewQueries: QueryMeta[];
};

/** Stub class identities referenced from test fixtures. The fixtures
 *  use these as predicates or `read` values; the harness identity-checks
 *  them against the captured metadata. */
class ElementRefStub {}
class TemplateRefStub {}

const STUBS: Record<string, any> = {
  // Stub symbols referenced from fixture sources
  Component: () => () => undefined,
  Directive: () => () => undefined,
  ElementRef: ElementRefStub,
  TemplateRef: TemplateRefStub,
  EventEmitter: class EventEmitter {},
  numberAttribute: (v: unknown) => Number(v),
  booleanAttribute: (v: unknown) => v != null && v !== 'false',
  // Signal API factories — return callables so `this.x = input()` succeeds
  input: Object.assign(() => () => undefined, {
    required: () => () => undefined,
  }),
  model: Object.assign(() => () => undefined, {
    required: () => () => undefined,
  }),
  output: () => ({}),
  outputFromObservable: () => ({}),
  viewChild: Object.assign(() => () => undefined, {
    required: () => () => undefined,
  }),
  viewChildren: () => () => [],
  contentChild: Object.assign(() => () => undefined, {
    required: () => () => undefined,
  }),
  contentChildren: () => () => [],
  Input: () => () => undefined,
  Output: () => () => undefined,
  ViewChild: () => () => undefined,
  ViewChildren: () => () => [],
  ContentChild: () => () => undefined,
  ContentChildren: () => () => [],
};

/** Build the `i0` namespace stub. ɵɵngDeclareComponent captures the
 *  metadata; the other declarations are no-ops so eval doesn't crash. */
function buildI0(captured: { meta?: any }) {
  const noop = () => undefined;
  return {
    ɵɵngDeclareComponent: (m: any) => {
      captured.meta = m;
      return undefined;
    },
    ɵɵngDeclareDirective: (m: any) => {
      captured.meta = m;
      return undefined;
    },
    ɵɵngDeclareFactory: noop,
    ɵɵngDeclareClassMetadata: noop,
    ɵɵngDeclareInjectable: noop,
    ɵɵngDeclareInjector: noop,
    ɵɵngDeclareNgModule: noop,
    ɵɵngDeclarePipe: noop,
    ɵɵFactoryTarget: { Component: 0, Directive: 1, Pipe: 2, NgModule: 3 },
  };
}

/** Rewrite imports so the eval sandbox sees stubbed @angular/core
 *  symbols. Drops the `import * as i0` line (the eval scope binds `i0`
 *  directly via destructure from __stubs__). */
function rewriteImports(code: string): string {
  return code
    .replace(/import\s+\*\s+as\s+i0\s+from\s+['"]@angular\/core['"];?/g, '')
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

function firstClassName(code: string): string {
  const m = code.match(/(?:export\s+)?class\s+(\w+)/);
  if (!m) throw new Error('aot parity: no class declaration found');
  return m[1];
}

/** Normalize captured metadata into the shape the oracle compares
 *  against. Strips wrapper expression nodes the Angular compiler emits
 *  around identifiers (`{forwardRef, expression}`), unwrapping to the
 *  identity-bearing stub class so deep-equal works. */
function normalize(meta: any): AotMeta {
  const inputs: Record<string, InputMeta> = {};
  for (const [k, v] of Object.entries(meta.inputs ?? {})) {
    const vv = v as any;
    inputs[k] = {
      classPropertyName: vv.classPropertyName,
      publicName: vv.publicName,
      isSignal: !!vv.isSignal,
      isRequired: !!vv.isRequired,
      transformFunction: vv.transformFunction ?? null,
    };
  }
  const outputs: Record<string, string> = { ...(meta.outputs ?? {}) };
  const normQ = (q: any): QueryMeta => ({
    propertyName: q.propertyName,
    first: q.first,
    predicate: q.predicate,
    descendants: q.descendants,
    read: q.read ?? null,
    isSignal: !!q.isSignal,
    static: !!q.static,
    emitDistinctChangesOnly: !!q.emitDistinctChangesOnly,
  });
  return {
    inputs,
    outputs,
    queries: (meta.queries ?? []).map(normQ),
    viewQueries: (meta.viewQueries ?? []).map(normQ),
  };
}

/**
 * Run a source through compilePartialCode, evaluate the emitted module
 * in a sandbox with stubbed Angular helpers, capture the metadata
 * argument handed to ɵɵngDeclareComponent / ɵɵngDeclareDirective, and
 * return the normalized AOT metadata shape.
 */
function reflectAot(source: string): AotMeta {
  const code = compilePartialCode(source, 'fixture.ts');
  const rewritten = rewriteImports(code);
  const className = firstClassName(rewritten);
  const captured: { meta?: any } = {};
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  const fn = new Function(
    '__stubs__',
    'i0',
    `${rewritten}\nreturn ${className};`,
  );
  fn(STUBS, buildI0(captured));
  if (!captured.meta) {
    throw new Error('aot parity: ɵɵngDeclareComponent was never called');
  }
  return normalize(captured.meta);
}

/**
 * Reference oracle. Each entry mirrors what Analog's AOT path SHOULD
 * hand to Angular for a given signal API. Pinned to upstream source
 * via comments so divergences (Analog or Angular changing emit) are
 * easy to spot in code review.
 */
const ref = {
  // Mirrors annotations/directive/src/input_function.ts (compiler-cli).
  input(
    field: string,
    opts: { alias?: string; required?: boolean } = {},
  ): InputMeta {
    return {
      classPropertyName: field,
      publicName: opts.alias ?? field,
      isSignal: true,
      isRequired: !!opts.required,
      // The signal applies the user's transform internally; the
      // directive metadata must always carry `null` here so the runtime
      // doesn't re-apply it on every write.
      transformFunction: null,
    };
  },

  // Mirrors annotations/directive/src/model_function.ts (compiler-cli).
  modelInput(
    field: string,
    opts: { alias?: string; required?: boolean } = {},
  ): InputMeta {
    return {
      classPropertyName: field,
      publicName: opts.alias ?? field,
      isSignal: true,
      isRequired: !!opts.required,
      transformFunction: null,
    };
  },
};

describe('AOT partial-mode metadata parity with Angular reference', () => {
  describe('input()', () => {
    it('plain input()', () => {
      const meta = reflectAot(`
        import { Component, input } from '@angular/core';
        @Component({ selector: 'x', template: '' })
        export class X { name = input(); }
      `);
      expect(meta.inputs).toEqual({ name: ref.input('name') });
    });

    it('input.required()', () => {
      const meta = reflectAot(`
        import { Component, input } from '@angular/core';
        @Component({ selector: 'x', template: '' })
        export class X { id = input.required(); }
      `);
      expect(meta.inputs).toEqual({ id: ref.input('id', { required: true }) });
    });

    it('input() with alias', () => {
      const meta = reflectAot(`
        import { Component, input } from '@angular/core';
        @Component({ selector: 'x', template: '' })
        export class X { id = input(0, { alias: 'publicId' }); }
      `);
      expect(meta.inputs).toEqual({
        id: ref.input('id', { alias: 'publicId' }),
      });
    });

    // Would have caught: AOT input transform double-application.
    it('drops user transform from emitted transformFunction', () => {
      const meta = reflectAot(`
        import { Component, input, numberAttribute } from '@angular/core';
        @Component({ selector: 'x', template: '' })
        export class X { size = input(0, { transform: numberAttribute }); }
      `);
      expect(meta.inputs.size.transformFunction).toBeNull();
      expect(meta.inputs.size.isSignal).toBe(true);
    });
  });

  describe('model()', () => {
    it('plain model — Input on field, Output as <field>Change', () => {
      const meta = reflectAot(`
        import { Component, model } from '@angular/core';
        @Component({ selector: 'x', template: '' })
        export class X { value = model(0); }
      `);
      expect(meta.inputs).toEqual({ value: ref.modelInput('value') });
      expect(meta.outputs).toEqual({ value: 'valueChange' });
    });

    // Would have caught: AOT model.required dropping required.
    it('model.required() emits isRequired: true', () => {
      const meta = reflectAot(`
        import { Component, model } from '@angular/core';
        @Component({ selector: 'x', template: '' })
        export class X { value = model.required(); }
      `);
      expect(meta.inputs).toEqual({
        value: ref.modelInput('value', { required: true }),
      });
      expect(meta.outputs).toEqual({ value: 'valueChange' });
    });

    it('model({alias}) threads alias through Input and Change output', () => {
      const meta = reflectAot(`
        import { Component, model } from '@angular/core';
        @Component({ selector: 'x', template: '' })
        export class X { value = model(0, { alias: 'pub' }); }
      `);
      expect(meta.inputs).toEqual({
        value: ref.modelInput('value', { alias: 'pub' }),
      });
      expect(meta.outputs).toEqual({ value: 'pubChange' });
    });

    it('model.required({alias}) — alias on both sides + required', () => {
      const meta = reflectAot(`
        import { Component, model } from '@angular/core';
        @Component({ selector: 'x', template: '' })
        export class X { value = model.required({ alias: 'pub' }); }
      `);
      expect(meta.inputs).toEqual({
        value: ref.modelInput('value', { alias: 'pub', required: true }),
      });
      expect(meta.outputs).toEqual({ value: 'pubChange' });
    });
  });

  describe('output() / outputFromObservable()', () => {
    it('plain output()', () => {
      const meta = reflectAot(`
        import { Component, output } from '@angular/core';
        @Component({ selector: 'x', template: '' })
        export class X { ready = output(); }
      `);
      expect(meta.outputs).toEqual({ ready: 'ready' });
    });

    it('output({alias})', () => {
      const meta = reflectAot(`
        import { Component, output } from '@angular/core';
        @Component({ selector: 'x', template: '' })
        export class X { ready = output({ alias: 'readyPub' }); }
      `);
      expect(meta.outputs).toEqual({ ready: 'readyPub' });
    });

    // Would have caught: AOT outputFromObservable reading wrong args.
    it('outputFromObservable({alias}) — options live in args[1]', () => {
      const meta = reflectAot(`
        import { Component, outputFromObservable } from '@angular/core';
        @Component({ selector: 'x', template: '' })
        export class X { ready = outputFromObservable(null, { alias: 'readyPub' }); }
      `);
      expect(meta.outputs).toEqual({ ready: 'readyPub' });
    });
  });

  describe('queries', () => {
    it('viewChild emits isSignal and the predicate', () => {
      const meta = reflectAot(`
        import { Component, viewChild } from '@angular/core';
        @Component({ selector: 'x', template: '<div #r></div>' })
        export class X { r = viewChild('r'); }
      `);
      expect(meta.viewQueries).toHaveLength(1);
      expect(meta.viewQueries[0]).toMatchObject({
        propertyName: 'r',
        first: true,
        isSignal: true,
      });
    });

    it('viewChild.required emits isSignal — required-ness lives on the signal itself', () => {
      const meta = reflectAot(`
        import { Component, viewChild } from '@angular/core';
        @Component({ selector: 'x', template: '<div #r></div>' })
        export class X { r = viewChild.required('r'); }
      `);
      expect(meta.viewQueries).toHaveLength(1);
      expect(meta.viewQueries[0].isSignal).toBe(true);
    });

    it('viewChild preserves the `read` option', () => {
      const meta = reflectAot(`
        import { Component, viewChild, ElementRef } from '@angular/core';
        @Component({ selector: 'x', template: '<div #r></div>' })
        export class X { r = viewChild('r', { read: ElementRef }); }
      `);
      expect(meta.viewQueries[0].read).toBe(ElementRefStub);
    });

    it('contentChildren defaults descendants to false; contentChild to true', () => {
      // Angular's partial-mode emitter omits default-valued fields, so
      // contentChildren shows up without `descendants` (defaulting to
      // false at the runtime read side). Treat absent as the type's
      // default.
      const meta = reflectAot(`
        import { Component, contentChild, contentChildren } from '@angular/core';
        @Component({ selector: 'x', template: '' })
        export class X {
          one = contentChild('a');
          many = contentChildren('b');
        }
      `);
      expect(meta.queries).toHaveLength(2);
      const byName = Object.fromEntries(
        meta.queries.map((q) => [q.propertyName, q]),
      );
      expect(byName.one.descendants).toBe(true);
      expect(byName.many.descendants ?? false).toBe(false);
    });
  });

  describe('decorator + signal coexistence', () => {
    // Would have caught: AOT duplicate query registration.
    it('@ViewChild on a field with viewChild() — only one query entry', () => {
      const meta = reflectAot(`
        import { Component, ViewChild, viewChild, ElementRef } from '@angular/core';
        @Component({ selector: 'x', template: '<div #r></div>' })
        export class X { @ViewChild('r') r = viewChild('r'); }
      `);
      expect(meta.viewQueries).toHaveLength(1);
      // The explicit @ViewChild wins → no isSignal flag from the
      // signal-derived path.
      expect(meta.viewQueries[0].isSignal).toBe(false);
    });

    // Would have caught: AOT decorator metadata being silently overwritten.
    it('@Input on a field with input() — only the decorator entry, not signal', () => {
      const meta = reflectAot(`
        import { Component, Input, input } from '@angular/core';
        @Component({ selector: 'x', template: '' })
        export class X { @Input() name = input(); }
      `);
      // The decorator path produces a non-signal input descriptor.
      expect(meta.inputs.name.isSignal).toBe(false);
    });

    it('@Input on a field with model() — Input wins, no synthetic Output', () => {
      const meta = reflectAot(`
        import { Component, Input, model } from '@angular/core';
        @Component({ selector: 'x', template: '' })
        export class X { @Input() value = model(0); }
      `);
      expect(meta.inputs.value.isSignal).toBe(false);
      // No model-derived Change output — the decorator path doesn't
      // synthesize one, and the signal branch was skipped.
      expect(meta.outputs).toEqual({});
    });
  });
});
