import { describe, it, expect } from 'vitest';
import { compileCode as compile, expectCompiles } from './test-helpers';

describe('OXC-based metadata extraction in AOT', () => {
  it('compiles component with signal inputs via OXC metadata', () => {
    const result = compile(
      `
      import { Component, input } from '@angular/core';

      @Component({ selector: 'app-test', template: '{{ name() }}' })
      export class TestComponent {
        name = input<string>();
        required = input.required<string>();
      }
    `,
      'test.ts',
    );
    expectCompiles(result);
    expect(result).toContain('ɵcmp');
    expect(result).toContain('inputs:');
  });

  it('compiles component with decorator-based @Input and @Output', () => {
    const result = compile(
      `
      import { Component, Input, Output, EventEmitter } from '@angular/core';

      @Component({ selector: 'app-test', template: '' })
      export class TestComponent {
        @Input() label: string = '';
        @Input({ alias: 'publicName' }) internalName: string = '';
        @Output() clicked = new EventEmitter<void>();
      }
    `,
      'test.ts',
    );
    expectCompiles(result);
    expect(result).toContain('ɵcmp');
    // @Input decorator should be stripped from compiled output
    expect(result).not.toMatch(/@Input\(/);
  });

  it('compiles component with constructor DI via OXC', () => {
    const result = compile(
      `
      import { Component, Inject, Optional } from '@angular/core';
      import { MyService } from './my.service';
      const TOKEN = 'token';

      @Component({ selector: 'app-test', template: '' })
      export class TestComponent {
        constructor(
          private svc: MyService,
          @Optional() opt: MyService,
          @Inject(TOKEN) val: string,
        ) {}
      }
    `,
      'test.ts',
    );
    expectCompiles(result);
    expect(result).toContain('ɵfac');
  });

  it('compiles directive with host bindings via OXC metadata', () => {
    const result = compile(
      `
      import { Directive, HostBinding, HostListener } from '@angular/core';

      @Directive({ selector: '[appHighlight]' })
      export class HighlightDirective {
        @HostBinding('class.active') isActive = false;
        @HostListener('click') onClick() { this.isActive = !this.isActive; }
      }
    `,
      'test.ts',
    );
    expectCompiles(result);
    expect(result).toContain('ɵdir');
    expect(result).toContain('hostBindings');
  });

  it('compiles component with viewChild/contentChild signals', () => {
    const result = compile(
      `
      import { Component, viewChild, contentChild, ElementRef } from '@angular/core';

      @Component({ selector: 'app-test', template: '<div #box></div>' })
      export class TestComponent {
        box = viewChild<ElementRef>('box');
        slot = contentChild<ElementRef>('slot');
      }
    `,
      'test.ts',
    );
    expectCompiles(result);
    expect(result).toContain('ɵcmp');
    expect(result).toContain('viewQuery');
    expect(result).toContain('contentQuery');
  });

  it('compiles ngmodule with exports via OXC metadata', () => {
    const result = compile(
      `
      import { NgModule } from '@angular/core';

      @NgModule({
        exports: [],
        declarations: [],
      })
      export class AppModule {}
    `,
      'test.ts',
    );
    expectCompiles(result);
    expect(result).toContain('ɵmod');
    expect(result).toContain('ɵinj');
  });

  it('emits setClassMetadata with string-based decorator args', () => {
    const result = compile(
      `
      import { Component } from '@angular/core';

      @Component({
        selector: 'app-meta',
        template: '<p>meta</p>',
      })
      export class MetaComponent {}
    `,
      'test.ts',
    );
    expectCompiles(result);
    expect(result).toContain('setClassMetadata');
    expect(result).toContain('app-meta');
  });
});

describe('emitExpr routing for function/method args', () => {
  it('emits method call args through emitExpr for correct output', () => {
    const result = compile(
      `
      import { Component } from '@angular/core';

      @Component({
        selector: 'app-test',
        template: '{{ items.join(", ") }}',
      })
      export class TestComponent {
        items = ['a', 'b'];
      }
    `,
      'test.ts',
    );

    expectCompiles(result);
  });

  it('emits nested function call args correctly', () => {
    const result = compile(
      `
      import { Component } from '@angular/core';

      @Component({
        selector: 'app-test',
        template: '{{ format(value, "default") }}',
      })
      export class TestComponent {
        value = 'test';
        format(v: string, fallback: string) { return v || fallback; }
      }
    `,
      'test.ts',
    );

    expectCompiles(result);
    // The template should compile with proper function call syntax
    expect(result).toContain('ctx.format');
  });

  it('handles undefined args gracefully via emitExpr null guard', () => {
    // emitExpr returns 'null' for falsy args instead of crashing
    const result = compile(
      `
      import { Component } from '@angular/core';

      @Component({
        selector: 'app-test',
        template: '{{ getValue(undefined) }}',
      })
      export class TestComponent {
        getValue(x: any) { return x ?? 'fallback'; }
      }
    `,
      'test.ts',
    );

    expectCompiles(result);
    expect(result).toContain('ctx.getValue');
  });
});

describe('Module-level string const interpolation in metadata', () => {
  // Components in the wild often hoist long Tailwind class chains (or any
  // shared string constants) into module-level `const`s and reference them
  // from the inline template via JS template-literal interpolation:
  //
  //   const tw = `text-zinc-700 hover:text-zinc-900`;
  //   @Component({ template: `<a class="${tw}">x</a>` })
  //
  // The Analog compiler must resolve those `${...}` expressions at metadata
  // extraction time so Angular's template parser sees the fully-expanded
  // class attribute. Otherwise the template ends up empty (silent failure)
  // or contains the literal `${tw}` token (parse error).

  it('resolves a single-level ${var} reference in template:', () => {
    const result = compile(
      `
      import { Component } from '@angular/core';
      const twBtn = \`px-4 py-2 rounded bg-blue-500 text-white\`;
      @Component({
        selector: 'app-btn',
        template: \`<button class="\${twBtn}">click</button>\`,
      })
      export class BtnComponent {}
    `,
      'btn.ts',
    );

    expectCompiles(result);
    // Angular splits the resolved class attribute into per-token entries in
    // the static consts array — every class from `twBtn` must appear there.
    expect(result).toMatch(
      /consts:\s*\[\[1,\s*"px-4",\s*"py-2",\s*"rounded",\s*"bg-blue-500",\s*"text-white"\]\]/,
    );
  });

  it('resolves chained ${var} references where one const references another', () => {
    const result = compile(
      `
      import { Component } from '@angular/core';
      const twBase = \`px-4 py-2 rounded\`;
      const twPrimary = \`\${twBase} bg-blue-500 text-white\`;
      @Component({
        selector: 'app-btn',
        template: \`<button class="\${twPrimary}">click</button>\`,
      })
      export class BtnComponent {}
    `,
      'btn.ts',
    );

    expectCompiles(result);
    // Both the inner (`twBase`) and outer (`twPrimary`) layers must resolve
    // — proves the iterative fixpoint in collectStringConstants works.
    expect(result).toMatch(
      /consts:\s*\[\[1,\s*"px-4",\s*"py-2",\s*"rounded",\s*"bg-blue-500",\s*"text-white"\]\]/,
    );
    // Inside the actual ɵcmp definition (excluding the setClassMetadata
    // reflection blob, which preserves the original decorator source
    // verbatim), no literal `${...}` token may survive.
    const cmpStart = result.indexOf('ɵcmp');
    const setMetaStart = result.indexOf('ɵsetClassMetadata');
    const compiledDef = result.slice(cmpStart, setMetaStart);
    expect(compiledDef).not.toContain('${twBase}');
    expect(compiledDef).not.toContain('${twPrimary}');
  });

  it('resolves ${var} in selector, not just template', () => {
    // The fix threads stringConsts through every string-typed metadata
    // field, so the same trick must work for `selector:` as well.
    const result = compile(
      `
      import { Component } from '@angular/core';
      const PREFIX = \`app\`;
      @Component({
        selector: \`\${PREFIX}-widget\`,
        template: '<span>x</span>',
      })
      export class WidgetComponent {}
    `,
      'widget.ts',
    );

    expectCompiles(result);
    expect(result).toContain('"app-widget"');
  });

  it('resolves ${var} inside an inline styles array entry', () => {
    const result = compile(
      `
      import { Component } from '@angular/core';
      const accent = \`#ff0066\`;
      @Component({
        selector: 'app-styled',
        template: '<span>x</span>',
        styles: [\`:host { color: \${accent}; }\`],
      })
      export class StyledComponent {}
    `,
      'styled.ts',
    );

    expectCompiles(result);
    // The resolved color value must appear in the emitted styles array.
    expect(result).toContain('#ff0066');
  });

  it('falls back without crashing when ${var} references an imported (unresolvable) value', () => {
    // Imports cannot be statically resolved at parse time, so stringValue
    // returns null and the existing valText fallback path takes over. The
    // compiler must not crash, and must still emit a component definition.
    const result = compile(
      `
      import { Component } from '@angular/core';
      import { external } from './other';
      @Component({
        selector: 'app-fallback',
        template: \`<div class="\${external}">x</div>\`,
      })
      export class FallbackComponent {}
    `,
      'fallback.ts',
    );

    expect(result).toContain('ɵcmp');
    expect(result).toContain('app-fallback');
  });

  it('does not resolve let/var declarations (only const)', () => {
    // Conservative: only `const` declarations are eligible. A `let` could in
    // principle be reassigned, so we refuse to inline it even if it never is.
    const result = compile(
      `
      import { Component } from '@angular/core';
      let twDynamic = \`px-4 py-2\`;
      @Component({
        selector: 'app-dyn',
        template: \`<button class="\${twDynamic}">x</button>\`,
      })
      export class DynComponent {}
    `,
      'dyn.ts',
    );

    // Should still produce a component definition via the fallback path,
    // but the resolved class tokens must NOT appear in the consts array.
    expect(result).toContain('ɵcmp');
    expect(result).not.toMatch(/consts:\s*\[\[1,\s*"px-4",\s*"py-2"\]\]/);
  });

  it('resolves ${var} declared with `export const`', () => {
    const result = compile(
      `
      import { Component } from '@angular/core';
      export const twShared = \`text-lg font-bold\`;
      @Component({
        selector: 'app-exp',
        template: \`<h1 class="\${twShared}">title</h1>\`,
      })
      export class ExpComponent {}
    `,
      'exp.ts',
    );

    expectCompiles(result);
    expect(result).toMatch(/consts:\s*\[\[1,\s*"text-lg",\s*"font-bold"\]\]/);
  });
});

describe('Template literal substitution preserves attribute quotes', () => {
  it('preserves surrounding HTML when ${var} is unresolvable', () => {
    const result = compile(
      `
      import { Component } from '@angular/core';
      import { cls } from './styles';
      @Component({
        selector: 'app-c',
        template: \`<a class="\${cls} foo">x</a>\`,
      })
      export class C {}
    `,
      'c.ts',
    );
    // Should not throw "Opening tag a not terminated"
    expectCompiles(result);
    // The 'foo' literal class portion should be present (the unresolved
    // ${cls} substitutes empty string but quotes survive)
    expect(result).toContain('foo');
  });
});

describe('Pure annotations on Ivy fields', () => {
  it('annotates ɵcmp, ɵfac, and setClassMetadata with /*@__PURE__*/', () => {
    const result = compile(
      `
      import { Component } from '@angular/core';
      @Component({ selector: 'app-c', template: '' })
      export class C {}
    `,
      'c.ts',
    );
    expectCompiles(result);
    expect(result).toMatch(
      /static ɵfac = \/\*@__PURE__\*\/\s*\(__ngFactoryType__\)/,
    );
    expect(result).toMatch(/static ɵcmp = \/\*@__PURE__\*\/\s*i0\.ɵɵdefine/);
    expect(result).toMatch(
      /\/\*@__PURE__\*\/\s*\(\(\) => \{[^}]*ɵsetClassMetadata/,
    );
  });

  it('annotates ɵdir and ɵpipe and ɵprov and ɵmod and ɵinj', () => {
    const result = compile(
      `
      import { Directive, Pipe, Injectable, NgModule } from '@angular/core';
      @Directive({ selector: '[d]' })
      export class D {}
      @Pipe({ name: 'p' })
      export class P { transform(v: any) { return v; } }
      @Injectable({ providedIn: 'root' })
      export class S {}
      @NgModule({})
      export class M {}
    `,
      'multi.ts',
    );
    expectCompiles(result);
    expect(result).toMatch(/static ɵdir = \/\*@__PURE__\*\//);
    expect(result).toMatch(/static ɵpipe = \/\*@__PURE__\*\//);
    expect(result).toMatch(/static ɵprov = \/\*@__PURE__\*\//);
    expect(result).toMatch(/static ɵmod = \/\*@__PURE__\*\//);
    expect(result).toMatch(/static ɵinj = \/\*@__PURE__\*\//);
  });
});
