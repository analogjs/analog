import { describe, it, expect, vi } from 'vitest';
import { compileCode as compile, expectCompiles } from './test-helpers';
import { compile as rawCompile } from './compile';
import { scanFile } from './registry';

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
      expect(result).toContain('valueChange: "valueChange"');
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
      // Both generate Change outputs
      expect(result).toContain('aChange: "aChange"');
      expect(result).toContain('bChange: "bChange"');
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
      expect(result).toContain('countChange: "countChange"');
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

    it('generates lazy import() for defer-only components', () => {
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
    });
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
