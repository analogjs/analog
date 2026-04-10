import { describe, it, expect, vi } from 'vitest';
import {
  compileCode as compile,
  expectCompiles,
  buildRegistry,
} from './test-helpers';
import { compile as rawCompile } from './compile';
import { scanFile } from './registry';
import { inlineResourceUrls, extractInlineStyles } from './resource-inliner';
import { ANGULAR_MAJOR } from './angular-version';

// Angular 19 ships several features in fundamentally different shapes
// from v20+: `@defer` dependency emission predates the
// `import('./x').then(m => m.X)` runtime ABI, and the `??` operator is
// polyfilled to a `tmp !== null && tmp !== void 0 ? tmp : default`
// chain instead of being emitted directly. The compiler still produces
// runtime-correct output for both shapes — we just can't assert against
// v20+ string patterns on v19. Tests that depend on the v20+ shapes are
// gated on this constant.
const SUPPORTS_DEFER_DYNAMIC_IMPORTS = ANGULAR_MAJOR >= 20;
const SUPPORTS_DIRECT_NULLISH_COALESCE_EMISSION = ANGULAR_MAJOR >= 20;

describe('@Component', () => {
  it('compiles a component with template and styles', () => {
    const result = compile(
      `
      import { Component, signal } from '@angular/core';
      @Component({
        selector: 'app-hello',
        template: '<h1>Hello {{ title() }}</h1>',
        styles: [':host { display: block; }']
      })
      export class HelloComponent {
        title = signal('World');
      }
    `,
      'hello.ts',
    );

    expectCompiles(result);
    expect(result).toContain('ɵfac');
    expect(result).toContain('ɵcmp');
    expect(result).toContain('app-hello');
    // Decorator is stripped
    expect(result).not.toContain('@Component');
    // Angular core namespace injected
    expect(result).toContain('import * as i0 from "@angular/core"');
    // Factory function is correct
    expect(result).toContain('new (__ngFactoryType__ || HelloComponent)()');
    // setClassMetadata emitted with global ngDevMode (not i0.ngDevMode)
    expect(result).toContain('ɵsetClassMetadata');
    expect(result).toMatch(/typeof ngDevMode === "undefined" \|\| ngDevMode/);
    expect(result).not.toContain('i0.ngDevMode');
    // Source map generated
    const fullResult = rawCompile(
      `
      import { Component, signal } from '@angular/core';
      @Component({ selector: 'app-hello', template: '<h1>Hello</h1>' })
      export class HelloComponent { title = signal('World'); }
    `,
      'hello.ts',
    );
    expect(fullResult.map).toBeDefined();
    expect(fullResult.map.version).toBe(3);
    expect(fullResult.map.sources).toContain('hello.ts');
    expect(fullResult.map.sourcesContent).toBeDefined();
    expect(fullResult.map.mappings).toBeTruthy();
    // Source map preserves original code positions (surgical edits, not full rewrite)
    const origLines = `
      import { Component, signal } from '@angular/core';
      @Component({ selector: 'app-hello', template: '<h1>Hello</h1>' })
      export class HelloComponent { title = signal('World'); }
    `.split('\n');
    const outLines = fullResult.code.split('\n');
    // Class body should appear in output (preserved by MagicString)
    expect(fullResult.code).toContain("title = signal('World')");
    // Decorator should be removed
    expect(fullResult.code).not.toMatch(/@Component/);
    // i0 import prepended
    expect(outLines[0]).toContain('import * as i0');
    // Template function emitted
    expect(result).toMatch(/template:\s*\(rf, ctx\)/);
    // Text interpolation instruction
    expect(result).toContain('ɵɵtextInterpolate');
  });

  it('resolves ${...} interpolation against module-level string consts in template', () => {
    // Components in the wild often hoist long Tailwind class chains into
    // module-level `const`s and reference them from the inline template via
    // JS template-literal interpolation. The Analog compiler must resolve
    // those references at parse time so Angular sees the fully-expanded
    // class attribute.
    const result = compile(
      `
      import { Component } from '@angular/core';
      const twBtn = \`px-4 py-2 rounded\`;
      const twPrimary = \`\${twBtn} bg-blue-500 text-white\`;
      @Component({
        selector: 'app-btn',
        template: \`<button class="\${twPrimary}">click</button>\`,
      })
      export class BtnComponent {}
    `,
      'btn.ts',
    );

    expectCompiles(result);
    // Angular's template parser splits the resolved class attribute into
    // individual class tokens stored in the static `consts` array. Each
    // class from both `twBtn` and `twPrimary` must appear, proving that
    // single-level AND chained `${...}` interpolation were resolved at
    // metadata-extraction time.
    expect(result).toMatch(
      /consts:\s*\[\[1,\s*"px-4",\s*"py-2",\s*"rounded",\s*"bg-blue-500",\s*"text-white"\]\]/,
    );
    // The literal `${...}` token may still appear in the setClassMetadata
    // reflection blob (which preserves the original decorator source
    // verbatim), but it must NOT appear inside the compiled template
    // function or static consts array.
    const ɵcmpStart = result.indexOf('ɵcmp');
    const setMetaStart = result.indexOf('ɵsetClassMetadata');
    const compiledDef = result.slice(ɵcmpStart, setMetaStart);
    expect(compiledDef).not.toContain('${twPrimary}');
    expect(compiledDef).not.toContain('${twBtn}');
  });

  it('falls back gracefully when ${...} references an unresolvable identifier', () => {
    // If an interpolation can't be resolved (e.g. it references an imported
    // value or a non-string), stringValue returns null and the existing
    // valText fallback kicks in. The compiler should not crash.
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

    // Should still produce a component definition even though the template
    // string is whatever the fallback path produced.
    expect(result).toContain('ɵcmp');
    expect(result).toContain('app-fallback');
  });

  it('compiles component with empty template', () => {
    const result = compile(
      `
      import { Component } from '@angular/core';
      @Component({ selector: 'app-empty', template: '' })
      export class EmptyComponent {}
    `,
      'empty.ts',
    );

    expectCompiles(result);
    expect(result).toContain('ɵcmp');
    expect(result).toContain('decls: 0');
    expect(result).toContain('vars: 0');
  });

  it('preserves user imports', () => {
    const result = compile(
      `
      import { Component, signal } from '@angular/core';
      @Component({ selector: 'app-test', template: '' })
      export class TestComponent {
        x = signal(0);
      }
    `,
      'test.ts',
    );

    expect(result).toContain(
      "import { Component, signal } from '@angular/core'",
    );
  });

  describe('Signals', () => {
    it('detects input() and input.required()', () => {
      const result = compile(
        `
        import { Component, input } from '@angular/core';
        @Component({
          selector: 'app-input-test',
          template: '<span>{{ name() }} {{ id() }}</span>'
        })
        export class InputTestComponent {
          name = input<string>();
          id = input.required<number>();
        }
      `,
        'input-test.ts',
      );

      expectCompiles(result);
      // Signal inputs use array descriptor format [flags, publicName, className, transform]
      expect(result).toContain('name: [');
      expect(result).toContain('id: [');
    });

    it('generates input + output for model()', () => {
      const result = compile(
        `
        import { Component, model } from '@angular/core';
        @Component({ selector: 'app-model', template: '{{ value() }}' })
        export class ModelComponent {
          value = model(0);
        }
      `,
        'model.ts',
      );

      expectCompiles(result);
      expect(result).toContain('value: [');
      // Outputs map is `{ classPropertyName: bindingName }` — for a
      // model the class property is `value` and binding is `valueChange`.
      expect(result).toContain('value: "valueChange"');
    });

    it('detects output()', () => {
      const result = compile(
        `
        import { Component, output } from '@angular/core';
        @Component({
          selector: 'app-output-test',
          template: '<button (click)="clicked.emit()">Click</button>'
        })
        export class OutputTestComponent {
          clicked = output<void>();
        }
      `,
        'output-test.ts',
      );

      expectCompiles(result);
      expect(result).toContain('clicked: "clicked"');
      // Event binding generates a listener instruction
      expect(result).toContain('ɵɵlistener');
    });

    it('detects model() and model.required()', () => {
      const result = compile(
        `
        import { Component, model } from '@angular/core';
        @Component({ selector: 'app-model-req', template: '{{ a() }} {{ b() }}' })
        export class ModelReqComponent {
          a = model(0);
          b = model.required<string>();
        }
      `,
        'model-req.ts',
      );

      expectCompiles(result);
      // Both produce signal input descriptors
      expect(result).toContain('a: [');
      expect(result).toContain('b: [');
      // Both generate Change outputs in the `{ classProp: bindingName }`
      // format Angular's runtime expects.
      expect(result).toContain('a: "aChange"');
      expect(result).toContain('b: "bChange"');
    });

    it('detects viewChild.required() and contentChild.required()', () => {
      const result = compile(
        `
        import { Component, viewChild, contentChild } from '@angular/core';
        @Component({
          selector: 'app-req-queries',
          template: '<input #myRef /><ng-content></ng-content>'
        })
        export class ReqQueryComponent {
          myRef = viewChild.required('myRef');
          header = contentChild.required('header');
        }
      `,
        'req-queries.ts',
      );

      expectCompiles(result);
      expect(result).toContain('ɵɵviewQuery');
      expect(result).toContain('ɵɵcontentQuery');
    });

    it('compiles computed and signal', () => {
      const result = compile(
        `
        import { Component, signal, computed } from '@angular/core';
        @Component({
          selector: 'app-computed',
          template: '<span>{{ doubled() }}</span>'
        })
        export class ComputedComponent {
          count = signal(0);
          doubled = computed(() => this.count() * 2);
        }
      `,
        'computed.ts',
      );

      expectCompiles(result);
      expect(result).toContain('ɵcmp');
      expect(result).toContain('ɵɵtextInterpolate');
    });

    it('detects viewChild and viewChildren', () => {
      const result = compile(
        `
        import { Component, viewChild, viewChildren } from '@angular/core';
        @Component({
          selector: 'app-queries',
          template: '<input #myInput /><div #item></div>'
        })
        export class QueryComponent {
          myInput = viewChild('myInput');
          items = viewChildren('item');
        }
      `,
        'queries.ts',
      );

      expectCompiles(result);
      // View queries emit viewQuery instructions
      expect(result).toContain('ɵɵviewQuery');
    });

    it('detects contentChild and contentChildren', () => {
      const result = compile(
        `
        import { Component, contentChild, contentChildren } from '@angular/core';
        @Component({
          selector: 'app-content-queries',
          template: '<ng-content></ng-content>'
        })
        export class ContentQueryComponent {
          header = contentChild('header');
          panels = contentChildren('panel');
        }
      `,
        'content-queries.ts',
      );

      expectCompiles(result);
      // Content queries emit contentQuery instructions
      expect(result).toContain('ɵɵcontentQuery');
    });

    it('compiles all signal types together', () => {
      const result = compile(
        `
        import { Component, signal, computed, input, output, model, viewChild } from '@angular/core';
        @Component({
          selector: 'app-kitchen-sink',
          template: \`
            <span>{{ name() }} {{ count() }} {{ doubled() }}</span>
            <input #myRef />
          \`
        })
        export class KitchenSinkComponent {
          name = input('default');
          count = model(0);
          clicked = output<void>();
          internal = signal('state');
          doubled = computed(() => this.internal().length * 2);
          myRef = viewChild('myRef');
        }
      `,
        'kitchen-sink.ts',
      );

      expectCompiles(result);
      expect(result).toContain('name: [');
      expect(result).toContain('count: [');
      expect(result).toContain('clicked: "clicked"');
      expect(result).toContain('count: "countChange"');
      expect(result).toContain('ɵɵviewQuery');
    });
  });

  describe('Control Flow', () => {
    it('compiles @if / @else', () => {
      const result = compile(
        `
        import { Component, signal } from '@angular/core';
        @Component({
          selector: 'app-if',
          template: \`
            @if (show()) {
              <div>Visible</div>
            } @else {
              <div>Hidden</div>
            }
          \`
        })
        export class IfComponent {
          show = signal(true);
        }
      `,
        'if.ts',
      );

      expectCompiles(result);
      expect(result).toContain('ɵɵconditional');
      // Two template functions: one for if, one for else
      expect(result).toContain('IfComponent_Conditional');
    });

    it('compiles @for with track and @empty', () => {
      const result = compile(
        `
        import { Component, signal } from '@angular/core';
        @Component({
          selector: 'app-for',
          template: \`
            @for (item of items(); track item.id) {
              <span>{{ item.name }}</span>
            } @empty {
              <p>No items</p>
            }
          \`
        })
        export class ForComponent {
          items = signal<any[]>([]);
        }
      `,
        'for.ts',
      );

      expectCompiles(result);
      expect(result).toContain('ɵɵrepeaterCreate');
      expect(result).toContain('ɵɵrepeater');
    });

    it('compiles @for with implicit variables', () => {
      const result = compile(
        `
        import { Component, signal } from '@angular/core';
        @Component({
          selector: 'app-for-vars',
          template: \`
            @for (item of items(); track item; let i = $index, first = $first, last = $last) {
              <span>{{ i }} {{ first }} {{ last }} {{ item }}</span>
            }
          \`
        })
        export class ForVarsComponent {
          items = signal(['a', 'b', 'c']);
        }
      `,
        'for-vars.ts',
      );

      expectCompiles(result);
      expect(result).toContain('ɵɵrepeaterCreate');
    });

    it('compiles @switch / @case / @default', () => {
      const result = compile(
        `
        import { Component, signal } from '@angular/core';
        @Component({
          selector: 'app-switch',
          template: \`
            @switch (status()) {
              @case ('active') { <span>Active</span> }
              @case ('inactive') { <span>Inactive</span> }
              @default { <span>Unknown</span> }
            }
          \`
        })
        export class SwitchComponent {
          status = signal('active');
        }
      `,
        'switch.ts',
      );

      expectCompiles(result);
      expect(result).toContain('ɵɵconditional');
    });

    it('compiles nested control flow', () => {
      const result = compile(
        `
        import { Component, signal } from '@angular/core';
        @Component({
          selector: 'app-nested',
          template: \`
            @if (show()) {
              @for (item of items(); track item) {
                @if (item > 2) {
                  <span>{{ item }}</span>
                }
              }
            }
          \`
        })
        export class NestedComponent {
          show = signal(true);
          items = signal([1, 2, 3, 4]);
        }
      `,
        'nested.ts',
      );

      expectCompiles(result);
      expect(result).toContain('ɵɵconditional');
      expect(result).toContain('ɵɵrepeaterCreate');
    });
  });

  describe('@defer', () => {
    it('compiles @defer with loading/placeholder/error', () => {
      const result = compile(
        `
        import { Component } from '@angular/core';
        @Component({
          selector: 'app-defer',
          template: \`
            @defer (on viewport) {
              <div>Loaded</div>
            } @loading {
              <p>Loading...</p>
            } @placeholder {
              <p>Placeholder</p>
            } @error {
              <p>Error</p>
            }
          \`
        })
        export class DeferComponent {}
      `,
        'defer.ts',
      );

      expectCompiles(result);
      expect(result).toContain('ɵɵdefer');
      expect(result).toContain('ɵɵdeferOnViewport');
      // Sub-templates for each block
      expect(result).toContain('DeferComponent_Defer_');
      expect(result).toContain('DeferComponent_DeferLoading_');
      expect(result).toContain('DeferComponent_DeferPlaceholder_');
      expect(result).toContain('DeferComponent_DeferError_');
    });

    it('compiles @defer with idle trigger', () => {
      const result = compile(
        `
        import { Component } from '@angular/core';
        @Component({
          selector: 'app-defer-idle',
          template: \`
            @defer (on idle) {
              <p>Loaded</p>
            }
          \`
        })
        export class DeferIdleComponent {}
      `,
        'defer-idle.ts',
      );

      expectCompiles(result);
      expect(result).toContain('ɵɵdefer');
      expect(result).toContain('ɵɵdeferOnIdle');
    });

    it('compiles @defer with timer trigger', () => {
      const result = compile(
        `
        import { Component } from '@angular/core';
        @Component({
          selector: 'app-defer-timer',
          template: \`
            @defer (on timer(500ms)) {
              <p>Loaded</p>
            }
          \`
        })
        export class DeferTimerComponent {}
      `,
        'defer-timer.ts',
      );

      expectCompiles(result);
      expect(result).toContain('ɵɵdefer');
      expect(result).toContain('ɵɵdeferOnTimer');
    });

    it.skipIf(!SUPPORTS_DEFER_DYNAMIC_IMPORTS)(
      'generates lazy import() for defer-only components',
      () => {
        const heavySrc = `
        import { Component } from '@angular/core';
        @Component({ selector: 'heavy-widget', template: '<p>Heavy</p>' })
        export class HeavyWidget {}
      `;

        const registry = new Map();
        for (const entry of scanFile(heavySrc, 'heavy.ts')) {
          registry.set(entry.className, entry);
        }

        const result = rawCompile(
          `
        import { Component } from '@angular/core';
        import { HeavyWidget } from './heavy-widget';
        @Component({
          selector: 'app-lazy-defer',
          template: \`
            <p>Eager</p>
            @defer (on viewport) {
              <heavy-widget />
            } @placeholder {
              <p>Loading...</p>
            }
          \`,
          imports: [HeavyWidget]
        })
        export class LazyDeferComponent {}
      `,
          'lazy-defer.ts',
          { registry },
        );

        expectCompiles(result.code);
        expect(result.code).toContain('ɵɵdefer');
        // Dynamic import for lazy loading
        expect(result.code).toContain('import("./heavy-widget")');
        // Dependency function generated (not null)
        expect(result.code).toContain('DepsFn');
      },
    );
  });

  describe('Content Projection', () => {
    it('compiles multi-slot ng-content with correct selectors', () => {
      const result = compile(
        `
        import { Component } from '@angular/core';
        @Component({
          selector: 'app-card',
          template: \`
            <div class="header"><ng-content select="[card-header]"></ng-content></div>
            <div class="body"><ng-content></ng-content></div>
            <div class="footer"><ng-content select="[card-footer]"></ng-content></div>
          \`
        })
        export class CardComponent {}
      `,
        'card.ts',
      );

      expectCompiles(result);
      expect(result).toContain('ngContentSelectors');
      expect(result).toContain('ɵɵprojection');
      // Verify the selectors include the named slots
      expect(result).toContain('card-header');
      expect(result).toContain('card-footer');
    });

    it('keeps hoisted ngContentSelectors const when insertPos is 0', () => {
      // Regression: inside the helpers-insertion step, `detectTypeOnlyImportNames`
      // is called before the setClassMetadata IIFE has been appended, so when
      // the only import is `Component` used solely in the @Component decorator
      // it gets flagged as elidable. That made `insertPos` stay at 0. Helpers
      // were then inserted via `ms.appendRight(0, …)`, anchored to position 0
      // — inside the `ms.remove(0, declEnd)` range the later elision pass
      // uses to strip the import — so MagicString wiped the helpers along
      // with the import, producing `ngContentSelectors: _c0` with no
      // corresponding declaration at runtime.
      const result = compile(
        `import { Component } from '@angular/core';

@Component({
  selector: 'app-bottom-nav',
  host: { class: 'mt-12 flex' },
  template: '<ng-content />',
})
export class BottomNav {}
`,
        'bottom-nav.ts',
      );

      expectCompiles(result);
      const ref = result.match(/ngContentSelectors:\s*(_c\d+)/);
      expect(ref).not.toBeNull();
      expect(result).toMatch(
        new RegExp(`(?:const|var|let)\\s+${ref![1]}\\s*=`),
      );
    });
  });

  describe('Pipes in Templates', () => {
    it('compiles pipe usage in template', () => {
      const result = compile(
        `
        import { Component, Pipe, signal } from '@angular/core';

        @Pipe({ name: 'upper' })
        export class UpperPipe {
          transform(v: string) { return v.toUpperCase(); }
        }

        @Component({
          selector: 'app-piped',
          template: '{{ name() | upper }}',
          imports: [UpperPipe]
        })
        export class PipedComponent {
          name = signal('hello');
        }
      `,
        'piped.ts',
      );

      expectCompiles(result);
      expect(result).toContain('ɵɵpipe');
      expect(result).toContain('ɵɵpipeBind1');
    });

    it('compiles pipe with arguments', () => {
      const result = compile(
        `
        import { Component, Pipe, signal } from '@angular/core';

        @Pipe({ name: 'slice' })
        export class SlicePipe {
          transform(v: string, start: number, end: number) { return v.slice(start, end); }
        }

        @Component({
          selector: 'app-pipe-args',
          template: '{{ text() | slice:0:5 }}',
          imports: [SlicePipe]
        })
        export class PipeArgsComponent {
          text = signal('hello world');
        }
      `,
        'pipe-args.ts',
      );

      expectCompiles(result);
      expect(result).toContain('ɵɵpipe');
      expect(result).toContain('ɵɵpipeBind3');
    });

    it('compiles chained pipes', () => {
      const result = compile(
        `
        import { Component, Pipe, signal } from '@angular/core';

        @Pipe({ name: 'upper' })
        export class UpperPipe {
          transform(v: string) { return v.toUpperCase(); }
        }

        @Pipe({ name: 'exclaim' })
        export class ExclaimPipe {
          transform(v: string) { return v + '!'; }
        }

        @Component({
          selector: 'app-chained',
          template: '{{ name() | upper | exclaim }}',
          imports: [UpperPipe, ExclaimPipe]
        })
        export class ChainedComponent {
          name = signal('hello');
        }
      `,
        'chained.ts',
      );

      expectCompiles(result);
      // Two pipe instructions
      const pipeMatches = result.match(/ɵɵpipe\(/g);
      expect(pipeMatches?.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('Component Options', () => {
    it('handles OnPush change detection', () => {
      const result = compile(
        `
        import { Component, ChangeDetectionStrategy } from '@angular/core';
        @Component({
          selector: 'app-onpush',
          template: '<p>fast</p>',
          changeDetection: ChangeDetectionStrategy.OnPush
        })
        export class OnPushComponent {}
      `,
        'onpush.ts',
      );

      expectCompiles(result);
      expect(result).toContain('changeDetection: 0');
    });

    it('handles ViewEncapsulation.None', () => {
      const result = compile(
        `
        import { Component, ViewEncapsulation } from '@angular/core';
        @Component({
          selector: 'app-no-encap',
          template: '<p>global</p>',
          encapsulation: ViewEncapsulation.None
        })
        export class NoEncapComponent {}
      `,
        'no-encap.ts',
      );

      expectCompiles(result);
      expect(result).toContain('encapsulation: 2');
    });

    it('handles ViewEncapsulation.ShadowDom', () => {
      const result = compile(
        `
        import { Component, ViewEncapsulation } from '@angular/core';
        @Component({
          selector: 'app-shadow',
          template: '<p>shadow</p>',
          encapsulation: ViewEncapsulation.ShadowDom
        })
        export class ShadowComponent {}
      `,
        'shadow.ts',
      );

      expectCompiles(result);
      expect(result).toContain('encapsulation: 3');
    });

    it('compiles component with providers', () => {
      const result = compile(
        `
        import { Component } from '@angular/core';
        class MyService {}
        @Component({
          selector: 'app-provided',
          template: '<p>hi</p>',
          providers: [MyService]
        })
        export class ProvidedComponent {}
      `,
        'provided.ts',
      );

      expectCompiles(result);
      expect(result).toContain('ProvidersFeature');
    });

    it('compiles component with empty providers', () => {
      const result = compile(
        `
        import { Component } from '@angular/core';
        @Component({
          selector: 'app-empty-prov',
          template: '<p>hi</p>',
          providers: []
        })
        export class EmptyProvComponent {}
      `,
        'empty-prov.ts',
      );

      expectCompiles(result);
      expect(result).not.toContain('ProvidersFeature');
    });

    it('compiles component with viewProviders', () => {
      const result = compile(
        `
        import { Component } from '@angular/core';
        class ViewSvc {}
        @Component({
          selector: 'app-view-prov',
          template: '<p>hi</p>',
          viewProviders: [ViewSvc]
        })
        export class ViewProvComponent {}
      `,
        'view-prov.ts',
      );

      expectCompiles(result);
      expect(result).toContain('ProvidersFeature');
    });

    it('compiles component with animations', () => {
      const result = compile(
        `
        import { Component } from '@angular/core';
        @Component({
          selector: 'app-animated',
          template: '<p>hi</p>',
          animations: [{ type: 7, name: 'fade', definitions: [] }]
        })
        export class AnimatedComponent {}
      `,
        'animated.ts',
      );

      expectCompiles(result);
    });

    it('inlines templateUrl content at compile time', () => {
      const result = compile(
        `
        import { Component } from '@angular/core';
        @Component({
          selector: 'app-external',
          templateUrl: './__fixtures__/test.component.html'
        })
        export class ExternalComponent {}
      `,
        __filename,
      );

      expectCompiles(result);
      // Template content inlined — actual HTML elements compiled
      expect(result).toContain('ɵcmp');
      expect(result).toContain('wrapper');
      expect(result).toContain('ɵɵelementStart');
    });

    it('inlines styleUrls content at compile time', () => {
      const result = compile(
        `
        import { Component } from '@angular/core';
        @Component({
          selector: 'app-styled',
          template: '<p>hi</p>',
          styleUrls: ['./__fixtures__/test.component.css']
        })
        export class StyledComponent {}
      `,
        __filename,
      );

      expectCompiles(result);
      expect(result).toContain('styles:');
      // CSS content inlined with emulated encapsulation scoping
      expect(result).toContain('_nghost-%COMP%');
      expect(result).toContain('padding');
    });

    it('inlines singular styleUrl content', () => {
      const result = compile(
        `
        import { Component } from '@angular/core';
        @Component({
          selector: 'app-single-style',
          template: '<p>hi</p>',
          styleUrl: './__fixtures__/test.component.css'
        })
        export class SingleStyleComponent {}
      `,
        __filename,
      );

      expectCompiles(result);
      expect(result).toContain('styles:');
      expect(result).toContain('_nghost-%COMP%');
    });

    it('accepts pre-resolved SCSS styles via resolvedStyles option', () => {
      const compiledCss =
        ':host { display: block; } .wrapper { padding: 1rem; } .wrapper h1 { color: #333; }';
      const stylePath = require('path').resolve(
        __dirname,
        '__fixtures__/test.component.scss',
      );
      const resolvedStyles = new Map([[stylePath, compiledCss]]);

      const result = rawCompile(
        `
        import { Component } from '@angular/core';
        @Component({
          selector: 'app-scss',
          template: '<p>hi</p>',
          styleUrls: ['./__fixtures__/test.component.scss']
        })
        export class ScssComponent {}
      `,
        __filename,
        { resolvedStyles },
      );

      expect(result.code).toContain('styles:');
      // Resolved CSS is used (not raw SCSS)
      expect(result.code).toContain('padding');
      expect(result.code).toContain('_nghost-%COMP%');
      // No SCSS syntax in output
      expect(result.code).not.toContain('$primary');
      expect(result.code).not.toContain('$padding');
    });

    it('falls back to raw file when no resolvedStyles provided for SCSS', () => {
      // Without resolvedStyles, SCSS is inlined as-is (raw text)
      const result = compile(
        `
        import { Component } from '@angular/core';
        @Component({
          selector: 'app-raw-scss',
          template: '<p>hi</p>',
          styleUrls: ['./__fixtures__/test.component.scss']
        })
        export class RawScssComponent {}
      `,
        __filename,
      );

      // Raw SCSS variables appear since no preprocessor ran
      expect(result).toContain('$primary');
    });

    it('applies resolvedInlineStyles to array styles before ShadowCss', () => {
      const compiledCss =
        ':host { display: block; } .wrapper { padding: 1rem; }';
      const resolvedInlineStyles = new Map([[0, compiledCss]]);

      const result = rawCompile(
        `
        import { Component } from '@angular/core';
        @Component({
          selector: 'app-inline-scss',
          template: '<p>hi</p>',
          styles: [':host { display: block; } .wrapper { padding: $var; }']
        })
        export class InlineScssComponent {}
      `,
        'inline-scss.ts',
        { resolvedInlineStyles },
      );

      // Preprocessed CSS used in ɵcmp styles (ShadowCss applied)
      expect(result.code).toContain('padding: 1rem');
      expect(result.code).toContain('_nghost-%COMP%');
      // Note: $var still appears in setClassMetadata (preserves original decorator args)
    });

    it('applies resolvedInlineStyles to singular string style', () => {
      const compiledCss = ':host { color: red; } h1 { font-size: 2rem; }';
      const resolvedInlineStyles = new Map([[0, compiledCss]]);

      const result = rawCompile(
        `
        import { Component } from '@angular/core';
        @Component({
          selector: 'app-singular-scss',
          template: '<h1>hi</h1>',
          styles: \`:host { color: $primary; } h1 { @include heading; }\`
        })
        export class SingularScssComponent {}
      `,
        'singular-scss.ts',
        { resolvedInlineStyles },
      );

      // Preprocessed CSS used in ɵcmp styles
      expect(result.code).toContain('font-size: 2rem');
      expect(result.code).toContain('_nghost-%COMP%');
    });

    it('leaves inline styles untouched when no resolvedInlineStyles', () => {
      const result = rawCompile(
        `
        import { Component } from '@angular/core';
        @Component({
          selector: 'app-plain',
          template: '<p>hi</p>',
          styles: [':host { color: red; }']
        })
        export class PlainComponent {}
      `,
        'plain.ts',
      );

      expect(result.code).toContain('color: red');
      expect(result.code).toContain('_nghost-%COMP%');
    });

    it('inlines both templateUrl and styleUrls together', () => {
      const result = compile(
        `
        import { Component } from '@angular/core';
        @Component({
          selector: 'app-full-external',
          templateUrl: './__fixtures__/test.component.html',
          styleUrls: ['./__fixtures__/test.component.css']
        })
        export class FullExternalComponent {}
      `,
        __filename,
      );

      expectCompiles(result);
      // Template inlined
      expect(result).toContain('wrapper');
      expect(result).toContain('ɵɵelementStart');
      // Styles inlined with scoping
      expect(result).toContain('styles:');
      expect(result).toContain('_nghost-%COMP%');
      // setClassMetadata preserves decorator args (including templateUrl/styleUrls strings)
      // but no import statements are generated for external resources
      expect(result).toContain('setClassMetadata');
    });

    it('handles missing templateUrl gracefully', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const result = compile(
        `
        import { Component } from '@angular/core';
        @Component({
          selector: 'app-missing',
          templateUrl: './nonexistent.html'
        })
        export class MissingTemplateComponent {}
      `,
        __filename,
      );

      // Should still compile with empty template
      expectCompiles(result);
      expect(result).toContain('ɵcmp');
      expect(result).toContain('decls: 0');
      expect(warnSpy).toHaveBeenCalledTimes(1);
      warnSpy.mockRestore();
    });

    it('returns templateUrl as resource dependency', () => {
      const result = rawCompile(
        `
        import { Component } from '@angular/core';
        @Component({
          selector: 'app-dep-tpl',
          templateUrl: './__fixtures__/test.component.html'
        })
        export class DepTplComponent {}
      `,
        __filename,
      );

      expect(result.resourceDependencies).toHaveLength(1);
      expect(result.resourceDependencies[0]).toContain('test.component.html');
    });

    it('returns styleUrls as resource dependencies', () => {
      const result = rawCompile(
        `
        import { Component } from '@angular/core';
        @Component({
          selector: 'app-dep-style',
          template: '<p>hi</p>',
          styleUrls: ['./__fixtures__/test.component.css']
        })
        export class DepStyleComponent {}
      `,
        __filename,
      );

      expect(result.resourceDependencies).toHaveLength(1);
      expect(result.resourceDependencies[0]).toContain('test.component.css');
    });

    it('returns both template and style as resource dependencies', () => {
      const result = rawCompile(
        `
        import { Component } from '@angular/core';
        @Component({
          selector: 'app-dep-both',
          templateUrl: './__fixtures__/test.component.html',
          styleUrl: './__fixtures__/test.component.css'
        })
        export class DepBothComponent {}
      `,
        __filename,
      );

      expect(result.resourceDependencies).toHaveLength(2);
      expect(result.resourceDependencies[0]).toContain('test.component.html');
      expect(result.resourceDependencies[1]).toContain('test.component.css');
    });

    it('returns empty resource dependencies for inline templates', () => {
      const result = rawCompile(
        `
        import { Component } from '@angular/core';
        @Component({ selector: 'app-inline', template: '<p>hi</p>' })
        export class InlineComponent {}
      `,
        'inline.ts',
      );

      expect(result.resourceDependencies).toHaveLength(0);
    });

    it('compiles component using inject()', () => {
      const result = compile(
        `
        import { Component, inject, signal } from '@angular/core';
        @Component({
          selector: 'app-injected',
          template: '{{ data() }}'
        })
        export class InjectedComponent {
          private http = inject(Object);
          data = signal('loaded');
        }
      `,
        'injected.ts',
      );

      expectCompiles(result);
      expect(result).toContain('ɵcmp');
    });
  });

  describe('Complex Templates', () => {
    it('compiles nested control flow with bindings and implicit variables', () => {
      const result = compile(
        `
        import { Component, signal, input, computed } from '@angular/core';
        @Component({
          selector: 'app-dashboard',
          template: \`
            <header>
              <h1>{{ title() }}</h1>
              @for (link of links(); track link.path) {
                <a [class.active]="link.path === activePath()">{{ link.label }}</a>
              }
            </header>

            @switch (view()) {
              @case ('list') {
                @for (item of items(); track item.id; let i = $index, last = $last) {
                  <div [class.highlight]="item.priority === 'high'"
                       [class.last-item]="last"
                       (click)="select(item)">
                    <span>{{ i + 1 }}. {{ item.name }}</span>
                    @if (item.description) {
                      <p>{{ item.description }}</p>
                    }
                    @if (item.tags.length > 0) {
                      @for (tag of item.tags; track tag) {
                        <span class="tag">{{ tag }}</span>
                      }
                    }
                  </div>
                } @empty {
                  <p>No items</p>
                }
              }
              @case ('detail') {
                @if (selected()) {
                  <h2>{{ selected().name }}</h2>
                  <button (click)="back()">Back</button>
                }
              }
              @default {
                <p>Select a view</p>
              }
            }

            <footer>{{ count() }} items</footer>
          \`
        })
        export class DashboardComponent {
          title = input('Dashboard');
          links = signal([{ path: '/home', label: 'Home' }]);
          activePath = signal('/home');
          view = signal('list');
          items = signal<any[]>([]);
          selected = signal<any>(null);
          count = computed(() => this.items().length);
          select(item: any) {}
          back() {}
        }
      `,
        'dashboard.ts',
      );

      expectCompiles(result);
      // All major instruction types present
      expect(result).toContain('ɵɵconditional');
      expect(result).toContain('ɵɵrepeaterCreate');
      expect(result).toContain('ɵɵrepeater');
      expect(result).toContain('ɵɵtextInterpolate');
      expect(result).toContain('ɵɵadvance');
      // Multiple generated template functions for embedded views
      const templateFns = result.match(/function DashboardComponent_/g);
      expect(templateFns!.length).toBeGreaterThanOrEqual(5);
    });
  });

  describe('Same-file Resolution', () => {
    it('resolves selectors without external registry', () => {
      const result = compile(
        `
        import { Component, input, signal } from '@angular/core';

        @Component({ selector: 'app-badge', template: '<span>{{ label() }}</span>' })
        export class BadgeComponent {
          label = input('');
        }

        @Component({
          selector: 'app-profile',
          template: '<app-badge [label]="username()"></app-badge>',
          imports: [BadgeComponent]
        })
        export class ProfileComponent {
          username = signal('Alice');
        }
      `,
        'profile.ts',
      );

      expectCompiles(result);
      // Both components compiled — decorators stripped, static fields added
      expect(result).not.toContain('@Component');
      expect(result).toContain('app-badge');
      // Both get factories
      expect(result).toMatch(/BadgeComponent.*ɵfac/s);
      expect(result).toMatch(/ProfileComponent.*ɵfac/s);
      // Dependencies array references BadgeComponent
      expect(result).toContain('dependencies');
    });
  });
});

describe('Cross-component input binding', () => {
  it('resolves signal input bindings via registry', () => {
    const childSrc = `
      import { Component, input } from '@angular/core';
      @Component({ selector: 'app-child', template: '{{ name() }}' })
      export class ChildComponent {
        name = input.required<string>();
      }
    `;

    const parentSrc = `
      import { Component } from '@angular/core';
      import { ChildComponent } from './child';
      @Component({
        selector: 'app-parent',
        imports: [ChildComponent],
        template: '<app-child [name]="title" />'
      })
      export class ParentComponent {
        title = 'Hello';
      }
    `;

    const registry = buildRegistry({ 'child.ts': childSrc });
    const result = compile(parentSrc, 'parent.ts', registry);

    expectCompiles(result);
    // The [name] binding should be compiled as a property instruction
    expect(result).toContain('ɵɵproperty("name"');
  });
});

describe('Constant pool ordering', () => {
  it('emits helper declarations before the class', () => {
    const result = compile(
      `
      import { Component } from '@angular/core';
      @Component({
        selector: 'app-list',
        template: \`
          @for (item of items; track item.id) {
            <div>{{ item.name }}</div>
          }
        \`
      })
      export class ListComponent {
        items = [{id: 1, name: 'a'}];
      }
    `,
      'list.ts',
    );

    expectCompiles(result);
    // Track function should be defined before the class
    const trackIdx = result.indexOf('_forTrack0');
    const classIdx = result.indexOf('class ListComponent');
    expect(trackIdx).toBeLessThan(classIdx);
  });

  it('emits helpers before export default class', () => {
    const result = compile(
      `
      import { Component } from '@angular/core';
      @Component({
        selector: 'app-page',
        template: \`
          @for (item of items; track item) {
            <span>{{ item }}</span>
          }
        \`
      })
      export default class PageComponent {
        items = ['a', 'b'];
      }
    `,
      'page.ts',
    );

    expectCompiles(result);
    // No 'export default const' syntax error
    expect(result).not.toContain('export default const');
    expect(result).not.toContain('export default function');
  });
});

describe('Assignment precedence in ternary', () => {
  it('parenthesizes assignment in @if with as alias', () => {
    const result = compile(
      `
      import { Component, signal } from '@angular/core';
      @Component({
        selector: 'app-detail',
        template: \`
          @if (data(); as item) {
            <p>{{ item.name }}</p>
          }
        \`
      })
      export class DetailComponent {
        data = signal<{name: string} | undefined>(undefined);
      }
    `,
      'detail.ts',
    );

    expectCompiles(result);
    // The assignment should be parenthesized: (tmp = ctx.data()) ? ...
    // NOT: tmp = ctx.data() ? ...
    expect(result).toMatch(/\(tmp_\d+_\d+ = ctx\.data\(\)\)/);
  });
});

describe('Operator precedence in template expressions', () => {
  // Angular 19 polyfills `??` to `(tmp = ctx.value() !== null && tmp !== void 0
  // ? tmp : 0) + 15` instead of emitting the literal `??` operator. The
  // semantics are equivalent but the string assertion only matches v20+.
  it.skipIf(!SUPPORTS_DIRECT_NULLISH_COALESCE_EMISSION)(
    'preserves grouping for ?? mixed with + in attribute binding',
    () => {
      const result = compile(
        `
      import { Component, signal } from '@angular/core';
      @Component({
        selector: 'app-node',
        template: '<div [attr.y]="(value() ?? 0) + 15"></div>'
      })
      export class NodeComponent {
        value = signal<number | null>(null);
      }
    `,
        'node.ts',
      );

      expectCompiles(result);
      // The ?? subexpression must be parenthesized to prevent:
      // ctx.value() ?? 0 + 15  →  ctx.value() ?? (0 + 15)
      expect(result).toContain('(ctx.value() ?? 0) + 15');
    },
  );
});

describe('templateUrl inlining in metadata', () => {
  it('replaces templateUrl with template in setClassMetadata', () => {
    const result = rawCompile(
      `
      import { Component } from '@angular/core';
      @Component({
        selector: 'app-ext',
        templateUrl: './test.component.html'
      })
      export class ExtComponent {}
    `,
      __dirname + '/__fixtures__/test.component.ts',
    );

    // The metadata should have template, not templateUrl
    const metaSection = result.code.substring(
      result.code.indexOf('ɵsetClassMetadata'),
    );
    expect(metaSection).not.toContain('templateUrl');
    expect(metaSection).toContain('template:');
  });
});

describe('setClassMetadata construction shape', () => {
  // Regression guard: Angular's `LiteralMapPropertyAssignment` class export
  // was removed in some 20.3.x patches and restored later. Using
  // `new o.LiteralMapPropertyAssignment(...)` throws "is not a constructor"
  // when the export is missing, and the surrounding try/catch in compile.ts
  // silently disables setClassMetadata emission for every class in the
  // project — visible only under DEBUG=analog-compiler*.
  //
  // The fix is to construct entries as plain `{ key, value, quoted }`
  // object literals — both Angular's own emitter and Analog's `JSEmitter`
  // consume entries via duck typing, so no class instance is required.
  // ESM bindings are read-only, so we can't simulate the missing export
  // at runtime. Instead, guard against re-introducing `new o.LiteralMap
  // PropertyAssignment(...)` at the source level.
  it('compile.ts does not call `new o.LiteralMapPropertyAssignment`', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const src = readFileSync(join(__dirname, 'compile.ts'), 'utf-8');
    expect(src).not.toMatch(/new\s+o\.LiteralMapPropertyAssignment\b/);
  });

  it('emits setClassMetadata for a basic component', () => {
    // Positive proof that the plain-object construction path produces a
    // setClassMetadata IIFE with the decorator name and selector intact.
    const result = compile(
      `
      import { Component } from '@angular/core';
      @Component({
        selector: 'app-meta',
        template: '<p>hi</p>',
      })
      export class MetaComponent {}
    `,
      'meta.ts',
    );
    expectCompiles(result);
    expect(result).toContain('ɵsetClassMetadata');
    expect(result).toContain('MetaComponent');
    expect(result).toContain('Component');
    expect(result).toContain('app-meta');
  });
});

describe('Content projection', () => {
  it('compiles single-slot ng-content', () => {
    const result = compile(
      `
      import { Component } from '@angular/core';
      @Component({
        selector: 'app-card',
        template: '<div class="card"><ng-content /></div>'
      })
      export class CardComponent {}
    `,
      'card.ts',
    );

    expectCompiles(result);
    expect(result).toContain('ɵɵprojectionDef');
    expect(result).toContain('ɵɵprojection');
  });

  it('compiles multi-slot ng-content with selectors', () => {
    const result = compile(
      `
      import { Component } from '@angular/core';
      @Component({
        selector: 'app-layout',
        template: \`
          <header><ng-content select="[header]" /></header>
          <main><ng-content /></main>
          <footer><ng-content select="[footer]" /></footer>
        \`
      })
      export class LayoutComponent {}
    `,
      'layout.ts',
    );

    expectCompiles(result);
    expect(result).toContain('ɵɵprojectionDef');
    // Multiple projection slots
    expect(result).toContain('ɵɵprojection');
  });
});

describe('Pipe usage in templates', () => {
  it('compiles pipe with arguments', () => {
    const pipeSrc = `
      import { Pipe, PipeTransform } from '@angular/core';
      @Pipe({ name: 'format' })
      export class FormatPipe implements PipeTransform {
        transform(value: number, style: string): string { return ''; }
      }
    `;

    const componentSrc = `
      import { Component } from '@angular/core';
      import { FormatPipe } from './format.pipe';
      @Component({
        selector: 'app-price',
        imports: [FormatPipe],
        template: '<span>{{ price | format:"currency" }}</span>'
      })
      export class PriceComponent {
        price = 9.99;
      }
    `;

    const registry = buildRegistry({ 'format.pipe.ts': pipeSrc });
    const result = compile(componentSrc, 'price.ts', registry);

    expectCompiles(result);
    expect(result).toContain('ɵɵpipe');
    expect(result).toContain('ɵɵpipeBind');
    expect(result).toContain('"format"');
  });

  it('compiles chained pipes', () => {
    const pipeSrc = `
      import { Pipe, PipeTransform } from '@angular/core';
      @Pipe({ name: 'upper' })
      export class UpperPipe implements PipeTransform {
        transform(value: string): string { return value.toUpperCase(); }
      }
    `;
    const pipe2Src = `
      import { Pipe, PipeTransform } from '@angular/core';
      @Pipe({ name: 'trim' })
      export class TrimPipe implements PipeTransform {
        transform(value: string): string { return value.trim(); }
      }
    `;

    const componentSrc = `
      import { Component } from '@angular/core';
      import { UpperPipe } from './upper.pipe';
      import { TrimPipe } from './trim.pipe';
      @Component({
        selector: 'app-text',
        imports: [UpperPipe, TrimPipe],
        template: '<span>{{ name | trim | upper }}</span>'
      })
      export class TextComponent {
        name = '  hello  ';
      }
    `;

    const registry = buildRegistry({
      'upper.pipe.ts': pipeSrc,
      'trim.pipe.ts': pipe2Src,
    });
    const result = compile(componentSrc, 'text.ts', registry);

    expectCompiles(result);
    // Two pipe instructions
    expect(result).toMatch(/ɵɵpipe\(\d+, "trim"\)/);
    expect(result).toMatch(/ɵɵpipe\(\d+, "upper"\)/);
  });
});

describe('Template reference variables', () => {
  it('compiles template ref with event binding', () => {
    const result = compile(
      `
      import { Component } from '@angular/core';
      @Component({
        selector: 'app-search',
        template: \`
          <input #searchBox />
          <button (click)="search(searchBox.value)">Search</button>
        \`
      })
      export class SearchComponent {
        search(term: string) {}
      }
    `,
      'search.ts',
    );

    expectCompiles(result);
    expect(result).toContain('ɵɵreference');
  });
});

describe('Two-way binding with model()', () => {
  it('compiles [(value)] two-way binding', () => {
    const childSrc = `
      import { Component, model } from '@angular/core';
      @Component({
        selector: 'app-slider',
        template: '<input type="range" />'
      })
      export class SliderComponent {
        value = model(0);
      }
    `;

    const parentSrc = `
      import { Component, signal } from '@angular/core';
      import { SliderComponent } from './slider';
      @Component({
        selector: 'app-parent',
        imports: [SliderComponent],
        template: '<app-slider [(value)]="volume" />'
      })
      export class ParentComponent {
        volume = signal(50);
      }
    `;

    const registry = buildRegistry({ 'slider.ts': childSrc });
    const result = compile(parentSrc, 'parent.ts', registry);

    expectCompiles(result);
    expect(result).toContain('ɵɵtwoWayProperty');
    expect(result).toContain('ɵɵtwoWayListener');
  });
});

describe('Computed signals in templates', () => {
  it('compiles computed() signal calls in template', () => {
    const result = compile(
      `
      import { Component, signal, computed } from '@angular/core';
      @Component({
        selector: 'app-cart',
        template: \`
          <p>Count: {{ count() }}</p>
          <p>Total: {{ total() }}</p>
        \`
      })
      export class CartComponent {
        count = signal(0);
        price = signal(10);
        total = computed(() => this.count() * this.price());
      }
    `,
      'cart.ts',
    );

    expectCompiles(result);
    expect(result).toContain('ctx.count()');
    expect(result).toContain('ctx.total()');
    expect(result).toContain('ɵɵtextInterpolate');
  });
});

describe('Safe navigation in templates', () => {
  it('compiles optional chaining in template expressions', () => {
    const result = compile(
      `
      import { Component, signal } from '@angular/core';
      @Component({
        selector: 'app-profile',
        template: '<p>{{ user()?.name }}</p>'
      })
      export class ProfileComponent {
        user = signal<{name: string} | null>(null);
      }
    `,
      'profile.ts',
    );

    expectCompiles(result);
    // Angular compiles ?. to a null-safe access
    expect(result).toContain('ctx.user()');
  });
});

describe('@defer triggers', () => {
  it('compiles @defer with on interaction trigger', () => {
    const result = compile(
      `
      import { Component } from '@angular/core';
      @Component({
        selector: 'app-page',
        template: \`
          <button #loadBtn>Load</button>
          @defer (on interaction(loadBtn)) {
            <p>Loaded content</p>
          } @placeholder {
            <p>Click to load</p>
          }
        \`
      })
      export class PageComponent {}
    `,
      'page.ts',
    );

    expectCompiles(result);
    expect(result).toContain('ɵɵdefer');
    expect(result).toContain('ɵɵdeferOnInteraction');
  });

  it('compiles @defer with on hover trigger', () => {
    const result = compile(
      `
      import { Component } from '@angular/core';
      @Component({
        selector: 'app-tooltip',
        template: \`
          <div>
            @defer (on hover) {
              <span>Tooltip content</span>
            } @placeholder {
              <span>Hover me</span>
            }
          </div>
        \`
      })
      export class TooltipComponent {}
    `,
      'tooltip.ts',
    );

    expectCompiles(result);
    expect(result).toContain('ɵɵdefer');
    expect(result).toContain('ɵɵdeferOnHover');
  });

  it('compiles @defer with on timer trigger', () => {
    const result = compile(
      `
      import { Component } from '@angular/core';
      @Component({
        selector: 'app-delayed',
        template: \`
          @defer (on timer(2000ms)) {
            <p>Delayed content</p>
          } @loading {
            <p>Loading...</p>
          }
        \`
      })
      export class DelayedComponent {}
    `,
      'delayed.ts',
    );

    expectCompiles(result);
    expect(result).toContain('ɵɵdefer');
    expect(result).toContain('ɵɵdeferOnTimer');
  });
});

describe('@if with as alias context', () => {
  it('passes expression value as context to embedded template', () => {
    const result = compile(
      `
      import { Component, signal } from '@angular/core';
      @Component({
        selector: 'app-user',
        template: \`
          @if (user(); as u) {
            <h1>{{ u.name }}</h1>
            <p>{{ u.email }}</p>
          }
        \`
      })
      export class UserComponent {
        user = signal<{name: string; email: string} | null>(null);
      }
    `,
      'user.ts',
    );

    expectCompiles(result);
    // The assignment must be parenthesized for correct precedence
    expect(result).toMatch(/\(tmp_\d+_\d+ = ctx\.user\(\)\)/);
    // The embedded template should use ctx (the alias value) for bindings
    expect(result).toMatch(/const \w+ = ctx/);
    expect(result).toContain('.name');
    expect(result).toContain('.email');
  });
});

describe('Multiple components in one file', () => {
  it('compiles multiple components from a single file', () => {
    const result = compile(
      `
      import { Component } from '@angular/core';

      @Component({
        selector: 'app-icon',
        template: '<i class="icon">★</i>'
      })
      export class IconComponent {}

      @Component({
        selector: 'app-badge',
        imports: [IconComponent],
        template: '<app-icon /> <span><ng-content /></span>'
      })
      export class BadgeComponent {}
    `,
      'components.ts',
    );

    expectCompiles(result);
    // Both components compiled with Ivy definitions
    expect(result).toContain('type: IconComponent');
    expect(result).toContain('type: BadgeComponent');
    // Both have factories
    expect((result.match(/ɵfac/g) || []).length).toBeGreaterThanOrEqual(2);
    // Selectors for both
    expect(result).toContain('"app-icon"');
    expect(result).toContain('"app-badge"');
    // BadgeComponent uses IconComponent as dependency
    expect(result).toMatch(/dependencies:.*IconComponent/);
  });
});

describe('Duplicate i0 import prevention', () => {
  it('does not add duplicate i0 import on double compile', () => {
    const src = `
      import { Component } from '@angular/core';
      @Component({
        selector: 'app-test',
        template: '<p>hello</p>'
      })
      export class TestComponent {}
    `;

    // First compile
    const first = compile(src, 'test.ts');
    expectCompiles(first);
    expect((first.match(/import \* as i0/g) || []).length).toBe(1);

    // Second compile (simulates client+SSR double pass)
    const second = compile(first, 'test.ts');
    expect((second.match(/import \* as i0/g) || []).length).toBe(1);
  });
});

describe('OXC-based resource inlining', () => {
  it('inlines templateUrl via AST rewriting', () => {
    const result = inlineResourceUrls(
      `
      import { Component } from '@angular/core';
      @Component({
        selector: 'app-ext',
        templateUrl: './test.component.html'
      })
      export class ExtComponent {}
    `,
      __dirname + '/__fixtures__/test.component.ts',
    );

    expect(result).not.toContain('templateUrl');
    expect(result).toContain('template:');
  });

  it('inlines styleUrls via AST rewriting', () => {
    const result = inlineResourceUrls(
      `
      import { Component } from '@angular/core';
      @Component({
        selector: 'app-ext',
        template: '',
        styleUrls: ['./test.component.css']
      })
      export class ExtComponent {}
    `,
      __dirname + '/__fixtures__/test.component.ts',
    );

    expect(result).not.toContain('styleUrls');
    expect(result).toContain('styles:');
  });

  it('returns original code when no resources to inline', () => {
    const src = `
      import { Component } from '@angular/core';
      @Component({
        selector: 'app-inline',
        template: '<p>hi</p>'
      })
      export class InlineComponent {}
    `;
    const result = inlineResourceUrls(src, 'inline.ts');
    expect(result).toBe(src);
  });

  it('extracts inline styles from template literals', () => {
    const styles = extractInlineStyles(
      `
      import { Component } from '@angular/core';
      @Component({
        selector: 'app-styled',
        template: '',
        styles: [\`h1 { color: red }\`, 'p { margin: 0 }']
      })
      export class StyledComponent {}
    `,
      'styled.ts',
    );

    expect(styles).toHaveLength(2);
    expect(styles[0]).toBe('h1 { color: red }');
    expect(styles[1]).toBe('p { margin: 0 }');
  });
});

describe('Arrow function object literal wrapping', () => {
  it('wraps object literal return in parens for arrow functions', () => {
    // Angular emits arrow functions returning object literals in metadata
    // like: () => ({key: val}). Without parens, () => {key: val} is parsed
    // as a block with a labeled statement.
    const result = compile(
      `
      import { Component, signal } from '@angular/core';
      @Component({
        selector: 'app-test',
        template: \`
          @defer (on viewport) {
            <p>deferred</p>
          } @placeholder {
            <p>placeholder</p>
          }
        \`
      })
      export class TestComponent {}
    `,
      'test.ts',
    );

    expectCompiles(result);
    // Any arrow returning an object literal should be wrapped: => ({...})
    // Not: => {...} which would be a block
    expect(result).not.toMatch(/=> \{[a-zA-Z]+:/);
  });
});

describe('Decorator and class field preservation', () => {
  it('preserves signal field initializers (not moved to constructor)', () => {
    const result = compile(
      `
      import { Component, input, output, model } from '@angular/core';
      @Component({
        selector: 'app-child',
        template: '<p>{{ name() }}</p>'
      })
      export class ChildComponent {
        readonly name = input.required<string>();
        notify = output();
        value = model(0);
      }
    `,
      'child.ts',
    );

    expectCompiles(result);
    // Signal APIs must stay as class field initializers, not be moved
    // to the constructor (which would strip .required and generics)
    expect(result).toContain('input.required');
    expect(result).toContain('output()');
    expect(result).toContain('model(');
    // Ivy inputs should recognize the signal input
    expect(result).toMatch(/inputs:\s*\{.*name.*\[1/);
  });

  it('strips @Component decorator from output', () => {
    const result = compile(
      `
      import { Component } from '@angular/core';
      @Component({
        selector: 'app-test',
        template: '<p>hello</p>'
      })
      export class TestComponent {}
    `,
      'test.ts',
    );

    expectCompiles(result);
    expect(result).not.toContain('@Component');
    expect(result).toContain('ɵɵdefineComponent');
  });
});

describe('Non-Angular files pass through unchanged', () => {
  it('does not add Ivy definitions for files without Angular decorators', () => {
    const result = compile(
      `
      export interface User {
        name: string;
        email: string;
      }
      export const DEFAULT_USER: User = { name: '', email: '' };
    `,
      'models.ts',
    );

    // Non-Angular files should not have component/directive definitions
    expect(result).not.toContain('ɵcmp');
    expect(result).not.toContain('ɵfac');
    expect(result).not.toContain('ɵɵdefineComponent');
    // Original content preserved
    expect(result).toContain('DEFAULT_USER');
  });
});

describe('Template-level styles', () => {
  it('merges inline <style> from template with decorator styles', () => {
    const result = compile(
      `
      import { Component } from '@angular/core';
      @Component({
        selector: 'app-styled',
        styles: ['h1 { color: blue }'],
        template: '<style>p { margin: 0 }</style><h1>Hello</h1><p>World</p>'
      })
      export class StyledComponent {}
    `,
      'styled.ts',
    );

    expectCompiles(result);
    // Both decorator styles and template <style> should be present
    expect(result).toContain('h1 { color: blue }');
    expect(result).toContain('p { margin: 0 }');
  });

  it('includes template <style> even without decorator styles', () => {
    const result = compile(
      `
      import { Component } from '@angular/core';
      @Component({
        selector: 'app-only-template-style',
        template: '<style>.host { display: block }</style><div>content</div>'
      })
      export class OnlyTemplateStyleComponent {}
    `,
      'only-template-style.ts',
    );

    expectCompiles(result);
    expect(result).toContain('.host { display: block }');
  });
});

describe('Member decorator removal', () => {
  it('removes @Input and @Output decorators from compiled output', () => {
    const result = compile(
      `
      import { Component, Input, Output, EventEmitter } from '@angular/core';
      @Component({
        selector: 'app-field',
        template: '<p>{{ label }}</p>'
      })
      export class FieldComponent {
        @Input() label = '';
        @Output() clicked = new EventEmitter<void>();
      }
    `,
      'field.ts',
    );

    expectCompiles(result);
    // Member decorators should be stripped
    expect(result).not.toMatch(/@Input/);
    expect(result).not.toMatch(/@Output/);
    // But the fields themselves remain
    expect(result).toContain("label = ''");
    expect(result).toContain('new EventEmitter');
  });

  it('removes @HostBinding and @HostListener decorators', () => {
    const result = compile(
      `
      import { Component, HostBinding, HostListener } from '@angular/core';
      @Component({
        selector: 'app-host',
        template: '<p>host</p>'
      })
      export class HostComponent {
        @HostBinding('class.active') isActive = false;
        @HostListener('click') onClick() {}
      }
    `,
      'host.ts',
    );

    expectCompiles(result);
    expect(result).not.toMatch(/@HostBinding/);
    expect(result).not.toMatch(/@HostListener/);
    expect(result).toContain('isActive');
    expect(result).toContain('onClick');
  });
});

describe('Self-referencing component', () => {
  it('compiles a recursive component that uses its own selector', () => {
    const result = compile(
      `
      import { Component, input } from '@angular/core';
      @Component({
        selector: 'app-tree',
        imports: [],
        template: \`
          <span>{{ node().label }}</span>
          @for (child of node().children; track child.label) {
            <app-tree [node]="child" />
          }
        \`
      })
      export class TreeComponent {
        node = input.required<{label: string; children: any[]}>();
      }
    `,
      'tree.ts',
    );

    expectCompiles(result);
    // Should contain its own selector in the template compilation
    expect(result).toContain('"app-tree"');
    // Should have the [node] property binding
    expect(result).toContain('ɵɵproperty("node"');
  });
});

describe('TypeScript syntax in compiler output', () => {
  it('preserves TypeScript syntax that downstream OXC stripping handles', () => {
    // The compiler output still contains import type, generics, etc.
    // These are stripped by vite.transformWithOxc() in the vite plugin,
    // not by the compiler itself.
    const result = rawCompile(
      `
      import { Component } from '@angular/core';
      import type { OnInit } from '@angular/core';
      @Component({
        selector: 'app-typed',
        template: '<p>hello</p>'
      })
      export class TypedComponent implements OnInit {
        ngOnInit(): void {}
      }
    `,
      'typed.ts',
    );

    expectCompiles(result.code);
    // Compiler output retains TS syntax (the vite plugin strips it later)
    expect(result.code).toContain('implements OnInit');
    // But Ivy definitions are present
    expect(result.code).toContain('ɵɵdefineComponent');
  });
});

describe('Lazy dependency array emission', () => {
  it('emits dependencies as arrow function for forward references', () => {
    const childSrc = `
      import { Component } from '@angular/core';
      @Component({ selector: 'app-child', template: '<p>child</p>' })
      export class ChildComponent {}
    `;

    const parentSrc = `
      import { Component } from '@angular/core';
      import { ChildComponent } from './child';
      @Component({
        selector: 'app-parent',
        imports: [ChildComponent],
        template: '<app-child />'
      })
      export class ParentComponent {}
    `;

    const registry = buildRegistry({ 'child.ts': childSrc });
    const result = compile(parentSrc, 'parent.ts', registry);

    expectCompiles(result);
    // Dependencies should be emitted as a lazy arrow function
    expect(result).toMatch(/dependencies:\s*\(\)\s*=>/);
  });
});

describe('Ivy definitions as static class members with TDZ hoisting', () => {
  it('emits ɵcmp and ɵfac as static members inside the class', () => {
    const result = compile(
      `
      import { Component } from '@angular/core';
      @Component({ selector: 'app-test', template: '<p>hi</p>' })
      export class TestComponent {}
    `,
      'test.ts',
    );

    expectCompiles(result);
    expect(result).toMatch(/static\s+ɵfac\s*=/);
    expect(result).toMatch(/static\s+ɵcmp\s*=/);
  });

  it('hoists non-exported post-class const before the class to avoid TDZ', () => {
    const result = compile(
      `
      import { Component } from '@angular/core';
      @Component({ selector: 'app-test', template: '<p>hi</p>' })
      export class TestComponent {}

      const helperFn = () => 'hello';
    `,
      'test.ts',
    );

    expectCompiles(result);
    // The const should be hoisted before the class
    const helperIdx = result.indexOf('const helperFn');
    const classIdx = result.indexOf('class TestComponent');
    expect(helperIdx).toBeGreaterThan(-1);
    expect(helperIdx).toBeLessThan(classIdx);
  });

  it('does not hoist exported declarations', () => {
    const result = compile(
      `
      import { Component } from '@angular/core';
      @Component({ selector: 'app-test', template: '<p>hi</p>' })
      export class TestComponent {}

      export const SOME_TOKEN = 'value';
    `,
      'test.ts',
    );

    expectCompiles(result);
    // Exported const should stay after the class
    const classIdx = result.indexOf('class TestComponent');
    const tokenIdx = result.indexOf('SOME_TOKEN');
    expect(tokenIdx).toBeGreaterThan(classIdx);
  });
});

describe('hostDirectives metadata extraction', () => {
  it('compiles component with bare hostDirectives identifier', () => {
    const result = compile(
      `
      import { Component, Directive } from '@angular/core';

      @Directive({ selector: '[tooltip]' })
      export class TooltipDirective {}

      @Component({
        selector: 'app-host',
        template: '<p>host</p>',
        hostDirectives: [TooltipDirective],
      })
      export class HostComponent {}
    `,
      'host.ts',
    );

    expectCompiles(result);
    // Should emit hostDirectives in the component def
    expect(result).toContain('hostDirectives');
  });

  it('compiles component with hostDirectives object form and inputs/outputs', () => {
    const result = compile(
      `
      import { Component, Directive, input, output } from '@angular/core';

      @Directive({ selector: '[color]' })
      export class ColorDirective {
        color = input<string>();
        colorChange = output<string>();
      }

      @Component({
        selector: 'app-host',
        template: '<p>host</p>',
        hostDirectives: [{
          directive: ColorDirective,
          inputs: ['color'],
          outputs: ['colorChange'],
        }],
      })
      export class HostComponent {}
    `,
      'host.ts',
    );

    expectCompiles(result);
    expect(result).toContain('hostDirectives');
  });

  it('compiles component with aliased hostDirectives inputs/outputs', () => {
    const result = compile(
      `
      import { Component, Directive, input, output } from '@angular/core';

      @Directive({ selector: '[color]' })
      export class ColorDirective {
        color = input<string>();
        colorChange = output<string>();
      }

      @Component({
        selector: 'app-host',
        template: '<p>host</p>',
        hostDirectives: [{
          directive: ColorDirective,
          inputs: ['color: appColor'],
          outputs: ['colorChange: appColorChange'],
        }],
      })
      export class HostComponent {}
    `,
      'host.ts',
    );

    expectCompiles(result);
    expect(result).toContain('hostDirectives');
    // Aliased names should appear in the compiled output
    expect(result).toContain('appColor');
    expect(result).toContain('appColorChange');
  });

  it('compiles component with forwardRef in hostDirectives', () => {
    const result = compile(
      `
      import { Component, Directive, forwardRef } from '@angular/core';

      @Component({
        selector: 'app-host',
        template: '<p>host</p>',
        hostDirectives: [forwardRef(() => LateDirective)],
      })
      export class HostComponent {}

      @Directive({ selector: '[late]' })
      export class LateDirective {}
    `,
      'host.ts',
    );

    expectCompiles(result);
    expect(result).toContain('hostDirectives');
  });
});

describe('Signal query R3QueryReference wrapping', () => {
  it('wraps class predicate in viewChild as R3QueryReference', () => {
    const result = compile(
      `
      import { Component, viewChild, ElementRef } from '@angular/core';
      @Component({ selector: 'app-c', template: '<div #el></div>' })
      export class C {
        el = viewChild(ElementRef);
      }
    `,
      'c.ts',
    );
    expectCompiles(result);
    // ɵɵviewQuery should reference ElementRef directly (not as null)
    expect(result).toContain('ɵɵviewQuery');
    expect(result).toContain('ElementRef');
    // Must NOT emit `null` as the query target
    expect(result).not.toMatch(/ɵɵviewQuery\(null/);
  });

  it('wraps class predicate in @ViewChild decorator as R3QueryReference', () => {
    const result = compile(
      `
      import { Component, ViewChild, ElementRef } from '@angular/core';
      @Component({ selector: 'app-c', template: '<div #el></div>' })
      export class C {
        @ViewChild(ElementRef) el!: ElementRef;
      }
    `,
      'c.ts',
    );
    expectCompiles(result);
    expect(result).toContain('ɵɵviewQuery');
    expect(result).toContain('ElementRef');
    expect(result).not.toMatch(/ɵɵviewQuery\(null/);
  });
});

describe('usesInheritance for extends clause', () => {
  it('emits InheritDefinitionFeature for `class Foo extends Bar`', () => {
    const result = compile(
      `
      import { Directive } from '@angular/core';
      @Directive({ selector: '[parent]' })
      export class Parent {}
      @Directive({ selector: '[child]' })
      export class Child extends Parent {}
    `,
      'd.ts',
    );
    expectCompiles(result);
    expect(result).toContain('InheritDefinitionFeature');
  });

  it('does not emit InheritDefinitionFeature for non-extending class', () => {
    const result = compile(
      `
      import { Directive } from '@angular/core';
      @Directive({ selector: '[d]' })
      export class D {}
    `,
      'd.ts',
    );
    expectCompiles(result);
    expect(result).not.toContain('InheritDefinitionFeature');
  });
});

describe('Host raw embedded quote preservation', () => {
  it('preserves embedded quotes in host bindings', () => {
    const result = compile(
      `
      import { Directive } from '@angular/core';
      @Directive({
        selector: '[d]',
        host: { '[attr.title]': 'showTitle ? "yes" : null' },
      })
      export class D {
        showTitle = true;
      }
    `,
      'd.ts',
    );
    expectCompiles(result);
    // The literal "yes" string in the binding expression must survive
    // (was previously stripped by an over-aggressive quote replacement).
    expect(result).toContain('yes');
  });
});

describe('Signal query read/descendants options', () => {
  it('parses `read` option on viewChild', () => {
    const result = compile(
      `
      import { Component, viewChild, ElementRef } from '@angular/core';
      @Component({ selector: 'app-c', template: '<div #ref></div>' })
      export class C {
        el = viewChild<ElementRef>('ref', { read: ElementRef });
      }
    `,
      'c.ts',
    );
    expectCompiles(result);
    expect(result).toContain('ɵɵviewQuery');
    expect(result).toContain('ElementRef');
  });

  it('parses `descendants: false` on contentChildren', () => {
    const result = compile(
      `
      import { Component, contentChildren } from '@angular/core';
      @Component({ selector: 'app-c', template: '' })
      export class C {
        items = contentChildren('item', { descendants: false });
      }
    `,
      'c.ts',
    );
    expectCompiles(result);
    // ɵɵcontentQuery's third arg is the descendants flag (1 = true,
    // 0 = false). With descendants: false we expect a `, 0,` flag.
    expect(result).toMatch(/ɵɵcontentQuerySignal\([^,]+,[^,]+,[^,]+,\s*0/);
  });

  it('defaults contentChildren descendants to false when no options', () => {
    const result = compile(
      `
      import { Component, contentChildren } from '@angular/core';
      @Component({ selector: 'app-c', template: '' })
      export class C {
        items = contentChildren('item');
      }
    `,
      'c.ts',
    );
    expectCompiles(result);
    expect(result).toMatch(/ɵɵcontentQuerySignal\([^,]+,[^,]+,[^,]+,\s*0/);
  });

  it('parses contentChildren with descendants: true', () => {
    const result = compile(
      `
      import { Component, contentChildren } from '@angular/core';
      @Component({ selector: 'app-c', template: '' })
      export class C {
        items = contentChildren('item', { descendants: true });
      }
    `,
      'c.ts',
    );
    expectCompiles(result);
    expect(result).toMatch(/ɵɵcontentQuerySignal\([^,]+,[^,]+,[^,]+,\s*1/);
  });

  it('defaults contentChild() descendants to true (matches Angular API)', () => {
    const result = compile(
      `
      import { Component, contentChild } from '@angular/core';
      @Component({ selector: 'app-c', template: '' })
      export class C {
        item = contentChild('item');
      }
    `,
      'c.ts',
    );
    expectCompiles(result);
    // ɵɵcontentQuerySignal flag arg = 1 means descendants: true.
    expect(result).toMatch(/ɵɵcontentQuerySignal\([^,]+,[^,]+,[^,]+,\s*1/);
  });
});

// Angular 19's @defer uses a different runtime ABI: it emits static
// `i0.ɵɵtemplate(...)` references and `i0.ɵɵdefer(slot, idx)` calls
// without per-block dynamic `import('./x').then(m => m.X)` resolvers.
// The dynamic-import shape was introduced in v20 and is what these
// tests assert. Skip the entire describe on v19.
describe.skipIf(!SUPPORTS_DEFER_DYNAMIC_IMPORTS)(
  '@defer dependency import shape',
  () => {
    it('emits import().then(m => m.X) for named imports', () => {
      const childSrc = `
      import { Component } from '@angular/core';
      @Component({ selector: 'app-lazy', template: 'lazy' })
      export class LazyCmp {}
    `;
      const parentSrc = `
      import { Component } from '@angular/core';
      import { LazyCmp } from './lazy';
      @Component({
        selector: 'app-parent',
        imports: [LazyCmp],
        template: '@defer { <app-lazy/> }',
      })
      export class Parent {}
    `;
      const registry = buildRegistry({ 'lazy.ts': childSrc });
      const result = compile(parentSrc, 'parent.ts', registry);
      expectCompiles(result);
      expect(result).toMatch(/import\(['"]\.\/lazy['"]\).*then.*m\.LazyCmp/);
    });

    it('uses original export name for aliased imports, not the local binding', () => {
      const childSrc = `
      import { Component } from '@angular/core';
      @Component({ selector: 'app-heavy', template: 'heavy' })
      export class HeavyWidget {}
    `;
      const parentSrc = `
      import { Component } from '@angular/core';
      import { HeavyWidget as Widget } from './heavy';
      @Component({
        selector: 'app-parent',
        imports: [Widget],
        template: '@defer { <app-heavy/> }',
      })
      export class Parent {}
    `;
      const registry = buildRegistry({ 'heavy.ts': childSrc });
      const result = compile(parentSrc, 'parent.ts', registry);
      expectCompiles(result);
      // Must reference the original export name `HeavyWidget`, NOT the
      // local alias `Widget`. The module namespace exposes the original
      // name regardless of how the consumer aliased it locally.
      expect(result).toMatch(
        /import\(['"]\.\/heavy['"]\)\.then\(\([^)]*\)\s*=>\s*\w+\.HeavyWidget\)/,
      );
      expect(result).not.toMatch(/m\.Widget(?!\w)/);
    });

    it('emits import().then(m => m.default) for default imports', () => {
      const childSrc = `
      import { Component } from '@angular/core';
      @Component({ selector: 'app-lazy', template: 'lazy' })
      export default class LazyCmp {}
    `;
      const parentSrc = `
      import { Component } from '@angular/core';
      import LazyCmp from './lazy';
      @Component({
        selector: 'app-parent',
        imports: [LazyCmp],
        template: '@defer { <app-lazy/> }',
      })
      export class Parent {}
    `;
      const registry = buildRegistry({ 'lazy.ts': childSrc });
      const result = compile(parentSrc, 'parent.ts', registry);
      expectCompiles(result);
      expect(result).toMatch(/import\(['"]\.\/lazy['"]\).*then.*m\.default/);
    });
  },
);
