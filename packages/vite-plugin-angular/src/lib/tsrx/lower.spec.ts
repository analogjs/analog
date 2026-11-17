import { parseTemplate } from '@angular/compiler';
import { parseModule } from '@tsrx/core';
import { describe, expect, it } from 'vitest';

import { compile } from '../compiler/compile';
import { buildRegistry } from '../compiler/test-helpers';
import { type EstreeNode, lowerTsrx, type TsrxLoweringResult } from './lower';

const parse = (source: string, fileName: string) =>
  parseModule(source, fileName) as EstreeNode;

function lower(
  source: string,
  selectors: Record<string, string> = {},
): TsrxLoweringResult {
  return lowerTsrx(source, '/app/test.tsrx', parse, {
    resolveSelector: (name) => selectors[name] ?? null,
  });
}

/** Lowers `source`, asserts it lowered cleanly, and returns the generated template. */
function template(
  source: string,
  selectors: Record<string, string> = {},
): string {
  const result = lower(source, selectors);
  expect(result.diagnostics.map((d) => d.message)).toEqual([]);
  const templates = [...result.code.matchAll(/^ {2}template: (".*"),$/gm)].map(
    (m) => JSON.parse(m[1]) as string,
  );
  expect(templates.length).toBe(1);
  // Every generated template must be valid Angular template syntax.
  const parsed = parseTemplate(templates[0], '/app/test.tsrx');
  expect((parsed.errors ?? []).map((e) => e.toString())).toEqual([]);
  return templates[0];
}

function errors(source: string): string[] {
  return lower(source).diagnostics.map((d) => d.message);
}

const COUNTER = `import { input, output, signal } from '@angular/core';

export function Counter() @{
  const initial = input.required<number>();
  const changed = output<number>();
  const count = signal(0);
  const inc = () => {
    count.update((c) => c + 1);
    changed.emit(count());
  };

  <button class="counter" onClick={inc}>{'Count: '}{initial() + count()}</button>
}
`;

describe('TSRX lowering (Angular target)', () => {
  it('lowers a component into a decorated class', () => {
    const { code, diagnostics } = lower(COUNTER);
    expect(diagnostics).toEqual([]);
    expect(code).toContain(`@Component({
  selector: "tsrx-counter",
  template: "<button class=\\"counter\\" (click)=\\"$fc.b0($event)\\">Count: {{ $fc.b1() }}</button>",
  changeDetection: ɵngChangeDetectionStrategy.OnPush,
})
export class Counter {
  readonly initial = input.required<number>();
  readonly changed = output<number>();
  protected readonly $fc = (() => {
    const initial = this.initial;
    const changed = this.changed;
    const count = signal(0);`);
    expect(code).toContain(
      'const ɵb0 = ($event: any) => ((inc) as (e: any) => unknown)($event);',
    );
    expect(code).toContain('const ɵb1 = () => (initial() + count());');
    expect(code).toContain(
      `import { Component, ChangeDetectionStrategy as ɵngChangeDetectionStrategy } from '@angular/core';`,
    );
  });

  it('compiles with the fast compiler', () => {
    const { code } = lower(COUNTER);
    const result = compile(code, '/app/test.tsrx', buildRegistry({}));
    expect(result.code).toContain('ɵɵdefineComponent');
    expect(result.code).toContain('"tsrx-counter"');
    expect(result.code).not.toContain('@Component');
  });

  describe('control flow', () => {
    it('maps @if / @else if / @else', () => {
      expect(
        template(`
          export function C() @{
            const n = signal(0);
            <div>
              @if (n() > 1) {
                <b>many</b>
              } @else if (n() === 1) {
                <i>one</i>
              } @else {
                <span>none</span>
              }
            </div>
          }
        `),
      ).toBe(
        '<div>@if ($fc.b0()) {<b>many</b>} @else if ($fc.b1()) {<i>one</i>} @else {<span>none</span>}</div>',
      );
    });

    it('maps @for with key, index and @empty', () => {
      const { code } = lower(`
        export function C() @{
          const todos = signal<{ id: number; title: string }[]>([]);
          <ul>
            @for (const todo of todos(); index i; key todo.id) {
              <li>{i + 1}. {todo.title}</li>
            } @empty {
              <li>Nothing</li>
            }
          </ul>
        }
      `);
      expect(code).toContain(
        'template: "<ul>@for (todo of $fc.b0(); track $fc.b1(todo); let i = $index) ' +
          '{<li>{{ $fc.b2(i) }}. {{ $fc.b3(todo) }}</li>} @empty {<li>Nothing</li>}</ul>"',
      );
      expect(code).toContain(
        'const ɵb1 = (todo: ɵngForItem<ReturnType<typeof ɵb0>>) => (todo.id);',
      );
      expect(code).toContain('const ɵb2 = (i: number) => (i + 1);');
    });

    it('tracks by $index when no key is given', () => {
      expect(
        template(`
          export function C() @{
            <ul>
              @for (const x of [1, 2]) {
                <li>{x}</li>
              }
            </ul>
          }
        `),
      ).toBe(
        '<ul>@for (x of $fc.b0(); track $index) {<li>{{ $fc.b1(x) }}</li>}</ul>',
      );
    });

    it('maps @switch', () => {
      expect(
        template(`
          export function C() @{
            const mode = signal('view');
            <div>
              @switch (mode()) {
                @case 'edit': {
                  <b>edit</b>
                }
                @default: {
                  <i>view</i>
                }
              }
            </div>
          }
        `),
      ).toBe(
        `<div>@switch ($fc.b0()) {@case ('edit') {<b>edit</b>} @default {<i>view</i>}}</div>`,
      );
    });
  });

  describe('attributes', () => {
    it('maps events, shorthand, namespaces and refs', () => {
      expect(
        template(`
          export function C() @{
            const value = signal('');
            const active = signal(false);
            <input
              type="text"
              disabled
              ref="field"
              {value}
              bind:ngModel={value}
              attr:aria-label="Name"
              class:active={active()}
              onKeyDown={(e: KeyboardEvent) => console.log(e)}
            />
          }
        `),
      ).toBe(
        `<input type="text" disabled #field [value]="$fc.b0()" [(ngModel)]="$fc.b1" ` +
          `[attr.aria-label]="'Name'" [class.active]="$fc.b2()" (keydown)="$fc.b3($event)">`,
      );
    });

    it('keeps output casing for component events', () => {
      expect(
        template(
          `
          import { Picker } from './picker';
          export function C() @{
            <Picker onValueChange={(v: string) => console.log(v)} />
          }
        `,
          { Picker: 'app-picker' },
        ),
      ).toBe('<app-picker (valueChange)="$fc.b0($event)"></app-picker>');
    });
  });

  it('resolves local and imported component tags', () => {
    const { code, diagnostics } = lower(
      `
      import { MatButton } from '@angular/material/button';

      function Badge() @{
        <span>badge</span>
      }

      export function App() @{
        <div>
          <Badge />
          <MatButton>Go</MatButton>
        </div>
      }
    `,
      { MatButton: 'button[matButton], a[matButton]' },
    );
    expect(diagnostics).toEqual([]);
    expect(code).toContain(
      'template: "<div><tsrx-badge></tsrx-badge><button matButton>Go</button></div>"',
    );
    expect(code).toContain('imports: [Badge, MatButton]');
  });

  it('moves <style> into component styles', () => {
    const { code } = lower(`
      export function C() @{
        <div class="box">
          <p>hi</p>
          <style>
            .box { padding: 1rem; }
            :global(body) { margin: 0; }
          </style>
        </div>
      }
    `);
    expect(code).toContain('template: "<div class=\\"box\\"><p>hi</p></div>"');
    expect(code).toMatch(
      /styles: \[".*\.box \{ padding: 1rem; \}.*::ng-deep body \{ margin: 0; \}.*"\]/,
    );
  });

  describe('meta export', () => {
    const CART = `import { Component, signal } from '@angular/core';
import { CartStore } from './cart-store';

export const meta = {
  selector: 'app-cart',
  providers: [CartStore],
  host: { class: 'cart', '[class.empty]': 'isEmpty()' },
} satisfies Component;

export function Cart() @{
  const items = signal<string[]>([]);
  const isEmpty = () => items().length === 0;
  <ul>{items().length}</ul>
}
`;

    it('merges meta into @Component', () => {
      const { code, diagnostics } = lower(CART);
      expect(diagnostics).toEqual([]);
      expect(code).toContain(`@Component({
  selector: 'app-cart',
  providers: [CartStore],
  host: { class: 'cart', '[class.empty]': 'isEmpty()' },
  template: "<ul>{{ $fc.b0() }}</ul>",`);
      expect(code).not.toContain('tsrx-cart');
      // Host expressions run against the instance, so referenced locals are exposed.
      expect(code).toContain('return {b0: ɵb0, isEmpty};');
      expect(code).toContain(
        '  protected readonly isEmpty = this.$fc.isEmpty;\n}',
      );
      // The user's value import of Component is reused.
      expect(code).toContain(
        `import { ChangeDetectionStrategy as ɵngChangeDetectionStrategy } from '@angular/core';`,
      );
    });

    it('compiles with the fast compiler', () => {
      const { code } = lower(CART);
      const result = compile(code, '/app/test.tsrx', buildRegistry({}));
      expect(result.code).toContain('"app-cart"');
      expect(result.code).toContain('CartStore');
      expect(result.code).toContain('hostAttrs');
    });

    it('uses the meta selector for local tags', () => {
      const { code, diagnostics } = lower(`
        export const meta = { selector: 'app-card' };
        function Wrapper() @{
          <Card />
        }
        export function Card() @{
          <p>card</p>
        }
      `);
      expect(diagnostics).toEqual([]);
      expect(code).toContain('template: "<app-card></app-card>"');
    });

    it('rejects fields that come from the template', () => {
      expect(
        errors(`
          export const meta = { styles: ['p {}'], template: '<p></p>' };
          export function C() @{ <p /> }
        `),
      ).toEqual([
        expect.stringContaining("'styles' cannot be set in `meta`"),
        expect.stringContaining("'template' cannot be set in `meta`"),
      ]);
    });

    it('requires a single exported component', () => {
      expect(
        errors(`
          export const meta = { selector: 'x-a' };
          export function A() @{ <p /> }
          export function B() @{ <p /> }
        `),
      ).toEqual([expect.stringContaining('exports 2')]);
    });

    it('asks for a value import of Component', () => {
      expect(
        errors(`
          import { type Component } from '@angular/core';
          export const meta = { selector: 'x-a' } satisfies Component;
          export function A() @{ <p /> }
        `),
      ).toEqual([
        expect.stringContaining('Change `type Component` to `Component`'),
      ]);
    });

    it('rejects other bindings named Component', () => {
      expect(
        errors(`
          const Component = 1;
          export function A() @{ <p /> }
        `),
      ).toEqual([expect.stringContaining('uses it for something else')]);
    });
  });

  describe('errors', () => {
    it('rejects parameters', () => {
      expect(
        errors(`export function C(props: { a: string }) @{ <p /> }`),
      ).toEqual([expect.stringContaining('Declare inputs with input()')]);
    });

    it('rejects .map() in favor of @for', () => {
      expect(
        errors(
          `export function C() @{ <ul>{[1, 2].map((n) => <li>{n}</li>)}</ul> }`,
        ),
      ).toEqual([expect.stringContaining('instead of .map()')]);
    });

    it('rejects unresolved component tags', () => {
      expect(
        errors(`import { X } from './x'; export function C() @{ <X /> }`),
      ).toEqual([
        expect.stringContaining(`Could not determine the selector of 'X'`),
      ]);
    });

    it('reports parse errors with positions', () => {
      const result = lower(`export function C() @{\n  <div>\n}\n`);
      expect(result.diagnostics.length).toBe(1);
      expect(result.diagnostics[0].start).toBeGreaterThan(0);
    });
  });

  describe('source map', () => {
    it('maps copied code exactly and template bindings to their expressions', () => {
      const { code, sourceMap } = lower(COUNTER);

      const inGenerated = code.indexOf('signal(0)');
      expect(sourceMap.toOriginalOffset(inGenerated)).toBe(
        COUNTER.indexOf('signal(0)'),
      );

      // The `{{ $fc.b1() }}` interpolation inside the escaped template literal.
      const call = code.indexOf('{{ $fc.b1() }}') + '{{ '.length;
      const original = COUNTER.indexOf('initial() + count()');
      expect(sourceMap.toOriginalSpan(call, 9)).toEqual({
        start: original,
        length: 'initial() + count()'.length,
      });
    });
  });
});
