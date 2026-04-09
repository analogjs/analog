import { describe, it, expect } from 'vitest';
import { scanFile } from './registry';
import { compile as rawCompile } from './compile';
import { compileCode as compile, buildRegistry } from './test-helpers';
import { inlineResourceUrls, extractInlineStyles } from './resource-inliner';
import {
  scanDtsFile,
  collectImportedPackages,
  collectRelativeReExports,
} from './dts-reader';
import { generateHmrCode } from './hmr';
import { detectTypeOnlyImportNames } from './type-elision';
import { jitTransform } from './jit-transform';
import {
  ANGULAR_DECORATORS,
  COMPILABLE_DECORATORS,
  FIELD_DECORATORS,
  SIGNAL_APIS,
} from './constants';

describe('Registry input/output extraction', () => {
  it('extracts signal inputs from input()', () => {
    const entries = scanFile(
      `
      import { Component, input } from '@angular/core';
      @Component({ selector: 'app-child', template: '' })
      export class ChildComponent {
        name = input<string>();
      }
    `,
      'child.ts',
    );

    expect(entries[0].inputs).toBeDefined();
    expect(entries[0].inputs!['name']).toEqual({
      classPropertyName: 'name',
      bindingPropertyName: 'name',
      isSignal: true,
      required: false,
    });
  });

  it('extracts required signal inputs from input.required()', () => {
    const entries = scanFile(
      `
      import { Component, input } from '@angular/core';
      @Component({ selector: 'app-child', template: '' })
      export class ChildComponent {
        data = input.required<string>();
      }
    `,
      'child.ts',
    );

    expect(entries[0].inputs!['data']).toEqual({
      classPropertyName: 'data',
      bindingPropertyName: 'data',
      isSignal: true,
      required: true,
    });
  });

  it('extracts signal outputs from output()', () => {
    const entries = scanFile(
      `
      import { Component, output } from '@angular/core';
      @Component({ selector: 'app-child', template: '' })
      export class ChildComponent {
        clicked = output();
      }
    `,
      'child.ts',
    );

    expect(entries[0].outputs).toBeDefined();
    expect(entries[0].outputs!['clicked']).toBe('clicked');
  });

  it('extracts model() as input + output', () => {
    const entries = scanFile(
      `
      import { Component, model } from '@angular/core';
      @Component({ selector: 'app-child', template: '' })
      export class ChildComponent {
        value = model<string>();
      }
    `,
      'child.ts',
    );

    expect(entries[0].inputs!['value']).toEqual({
      classPropertyName: 'value',
      bindingPropertyName: 'value',
      isSignal: true,
      required: false,
    });
    // Registry's outputs map mirrors Angular's `{ classProp: bindingName }`
    // convention. For a `model()` the class property is `value` and the
    // binding event is `valueChange`.
    expect(entries[0].outputs!['value']).toBe('valueChange');
  });

  it('extracts @Input decorator-based inputs', () => {
    const entries = scanFile(
      `
      import { Component, Input } from '@angular/core';
      @Component({ selector: 'app-child', template: '' })
      export class ChildComponent {
        @Input() title: string;
      }
    `,
      'child.ts',
    );

    expect(entries[0].inputs!['title']).toEqual({
      classPropertyName: 'title',
      bindingPropertyName: 'title',
      isSignal: false,
      required: false,
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

describe('.d.ts metadata extraction', () => {
  it('extracts directive with inputs/outputs from .d.ts', () => {
    const entries = scanDtsFile(
      `
import * as i0 from "@angular/core";
declare class MyDir {
    static ɵdir: i0.ɵɵDirectiveDeclaration<MyDir, "[myDir]", never, { "color": { "alias": "color"; "required": false; }; }, { "colorChange": "colorChange"; }, never, never, true, never>;
}
`,
      'my-dir.d.ts',
    );

    expect(entries).toHaveLength(1);
    expect(entries[0].selector).toBe('[myDir]');
    expect(entries[0].kind).toBe('directive');
    expect(entries[0].inputs!['color'].bindingPropertyName).toBe('color');
    expect(entries[0].outputs!['colorChange']).toBe('colorChange');
  });

  it('extracts pipe name from .d.ts', () => {
    const entries = scanDtsFile(
      `
import * as i0 from "@angular/core";
declare class CurrencyPipe {
    static ɵpipe: i0.ɵɵPipeDeclaration<CurrencyPipe, "currency", true>;
}
`,
      'currency.d.ts',
    );

    expect(entries).toHaveLength(1);
    expect(entries[0].kind).toBe('pipe');
    expect(entries[0].pipeName).toBe('currency');
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

describe('collectImportedPackages', () => {
  it('extracts bare-specifier package names, skips relative', () => {
    const packages = collectImportedPackages(
      `
      import { Component } from '@angular/core';
      import { RouterOutlet } from '@angular/router';
      import { Observable } from 'rxjs';
      import { MyService } from './my-service';
    `,
      'test.ts',
    );

    expect(packages.has('@angular/core')).toBe(true);
    expect(packages.has('@angular/router')).toBe(true);
    expect(packages.has('rxjs')).toBe(true);
    // Relative imports should be skipped
    expect(packages.has('./my-service')).toBe(false);
    expect(packages.size).toBe(3);
  });

  it('handles scoped packages correctly', () => {
    const packages = collectImportedPackages(
      `
      import { input } from '@angular/core';
      import { injectLoad } from '@analogjs/router';
      import { map } from 'rxjs/operators';
    `,
      'test.ts',
    );

    expect(packages.has('@angular/core')).toBe(true);
    expect(packages.has('@analogjs/router')).toBe(true);
    expect(packages.has('rxjs')).toBe(true);
    // Should not include the subpath
    expect(packages.has('rxjs/operators')).toBe(false);
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

describe('NgModule export expansion', () => {
  it('resolves NgModule exports into individual declarations', () => {
    const buttonSrc = `
      import { Component } from '@angular/core';
      @Component({ selector: 'ui-button', template: '<button><ng-content /></button>' })
      export class ButtonComponent {}
    `;
    const moduleSrc = `
      import { NgModule } from '@angular/core';
      @NgModule({ declarations: [ButtonComponent], exports: [ButtonComponent] })
      export class SharedModule {}
    `;
    const appSrc = `
      import { Component } from '@angular/core';
      import { SharedModule } from './shared.module';
      @Component({
        selector: 'app-root',
        imports: [SharedModule],
        template: '<ui-button>Click</ui-button>'
      })
      export class AppComponent {}
    `;

    const registry = buildRegistry({
      'button.ts': buttonSrc,
      'shared.module.ts': moduleSrc,
    });
    const result = compile(appSrc, 'app.ts', registry);

    expectCompiles(result);
    // The template should resolve ui-button from the NgModule exports
    expect(result).toContain('"ui-button"');
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

describe('.d.ts NgModule scanning', () => {
  it('extracts NgModule exports from .d.ts', () => {
    const entries = scanDtsFile(
      `
import * as i0 from "@angular/core";
import * as i1 from "./button";
declare class SharedModule {
    static ɵmod: i0.ɵɵNgModuleDeclaration<SharedModule, [typeof i1.ButtonComponent], never, [typeof i1.ButtonComponent]>;
}
`,
      'shared.d.ts',
    );

    expect(entries).toHaveLength(1);
    expect(entries[0].kind).toBe('ngmodule');
    expect(entries[0].className).toBe('SharedModule');
    expect(entries[0].exports).toContain('ButtonComponent');
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

describe('Directive compilation', () => {
  it('compiles a directive with host bindings', () => {
    const result = compile(
      `
      import { Directive, HostBinding, HostListener } from '@angular/core';
      @Directive({
        selector: '[appHighlight]',
        standalone: true
      })
      export class HighlightDirective {
        @HostBinding('class.active') isActive = false;
        @HostListener('click') onClick() { this.isActive = !this.isActive; }
      }
    `,
      'highlight.ts',
    );

    expectCompiles(result);
    expect(result).toContain('ɵɵdefineDirective');
    expect(result).toContain('"appHighlight"');
    expect(result).toContain('isActive');
  });

  it('compiles a directive with signal inputs', () => {
    const result = compile(
      `
      import { Directive, input } from '@angular/core';
      @Directive({
        selector: '[appTooltip]',
        standalone: true
      })
      export class TooltipDirective {
        text = input.required<string>();
        position = input<'top' | 'bottom'>('top');
      }
    `,
      'tooltip.ts',
    );

    expectCompiles(result);
    expect(result).toContain('ɵɵdefineDirective');
    expect(result).toContain('"appTooltip"');
    // Signal inputs should have the proper flags
    expect(result).toMatch(/inputs:.*text.*\[1/);
  });

  it('compiles a directive with exportAs', () => {
    const result = compile(
      `
      import { Directive } from '@angular/core';
      @Directive({
        selector: '[appDraggable]',
        exportAs: 'draggable',
        standalone: true
      })
      export class DraggableDirective {}
    `,
      'draggable.ts',
    );

    expectCompiles(result);
    expect(result).toContain('ɵɵdefineDirective');
    expect(result).toContain('"draggable"');
  });
});

describe('Recursive NgModule export expansion', () => {
  it('expands nested NgModule exports into declarations', () => {
    // Simulates ReactiveFormsModule → SharedModule → DefaultValueAccessor
    const valueAccessorSrc = `
      import { Directive } from '@angular/core';
      @Directive({ selector: 'input[type=text]' })
      export class TextValueAccessor {}
    `;
    const sharedModuleSrc = `
      import { NgModule } from '@angular/core';
      @NgModule({ exports: [TextValueAccessor] })
      export class SharedFormsModule {}
    `;
    const formsModuleSrc = `
      import { NgModule } from '@angular/core';
      @NgModule({ exports: [SharedFormsModule, FormControlDirective] })
      export class MyFormsModule {}
    `;
    const controlSrc = `
      import { Directive } from '@angular/core';
      @Directive({ selector: '[formControl]' })
      export class FormControlDirective {}
    `;
    const appSrc = `
      import { Component } from '@angular/core';
      import { MyFormsModule } from './forms.module';
      @Component({
        selector: 'app-form',
        imports: [MyFormsModule],
        template: '<input type="text" formControl />'
      })
      export class FormComponent {}
    `;

    const registry = buildRegistry({
      'value-accessor.ts': valueAccessorSrc,
      'shared.module.ts': sharedModuleSrc,
      'forms.module.ts': formsModuleSrc,
      'control.ts': controlSrc,
    });
    const result = compile(appSrc, 'form.ts', registry);

    expectCompiles(result);
    // Both the direct export and nested module export should be resolved
    expect(result).toContain('FormControlDirective');
    expect(result).toContain('TextValueAccessor');
  });

  it('handles circular NgModule exports without infinite loop', () => {
    const modASrc = `
      import { NgModule } from '@angular/core';
      @NgModule({ exports: [ModuleB, CompA] })
      export class ModuleA {}
    `;
    const modBSrc = `
      import { NgModule } from '@angular/core';
      @NgModule({ exports: [ModuleA, CompB] })
      export class ModuleB {}
    `;
    const compASrc = `
      import { Component } from '@angular/core';
      @Component({ selector: 'comp-a', template: '' })
      export class CompA {}
    `;
    const compBSrc = `
      import { Component } from '@angular/core';
      @Component({ selector: 'comp-b', template: '' })
      export class CompB {}
    `;
    const appSrc = `
      import { Component } from '@angular/core';
      import { ModuleA } from './mod-a';
      @Component({
        selector: 'app-root',
        imports: [ModuleA],
        template: '<comp-a /><comp-b />'
      })
      export class AppComponent {}
    `;

    const registry = buildRegistry({
      'mod-a.ts': modASrc,
      'mod-b.ts': modBSrc,
      'comp-a.ts': compASrc,
      'comp-b.ts': compBSrc,
    });

    // Should not hang or throw
    const result = compile(appSrc, 'app.ts', registry);
    expectCompiles(result);
    expect(result).toContain('CompA');
    expect(result).toContain('CompB');
  });
});

describe('HMR code generation', () => {
  it('generates dynamic field copying for components', () => {
    const code = generateHmrCode([
      {
        className: 'MyComponent',
        selector: 'app-my',
        kind: 'component',
        fileName: 'my.ts',
      },
    ]);

    // Should use dynamic field copying instead of hardcoded ɵcmp/ɵfac
    expect(code).toContain('Object.getOwnPropertyNames(MyComponent)');
    expect(code).toContain("key.startsWith('ɵ')");
    expect(code).not.toContain('type.ɵcmp = ');
    expect(code).not.toContain('type.ɵfac = ');
  });

  it('generates ɵɵreplaceMetadata call for components', () => {
    const code = generateHmrCode([
      {
        className: 'MyComponent',
        selector: 'app-my',
        kind: 'component',
        fileName: 'my.ts',
      },
    ]);

    expect(code).toContain('ɵɵreplaceMetadata');
    expect(code).toContain('newModule.ɵhmr_MyComponent');
    expect(code).toContain('import.meta.hot.accept');
  });

  it('generates invalidation for directives instead of ɵɵreplaceMetadata', () => {
    const code = generateHmrCode([
      {
        className: 'HighlightDirective',
        selector: '[appHighlight]',
        kind: 'directive',
        fileName: 'highlight.ts',
      },
    ]);

    // Directives should get field swap + invalidate, not ɵɵreplaceMetadata call
    expect(code).toContain('ɵhmr_HighlightDirective');
    expect(code).not.toContain('i0.ɵɵreplaceMetadata(');
    expect(code).toContain(
      "import.meta.hot.invalidate('Directive/pipe changed, reloading')",
    );
  });

  it('generates invalidation for pipes instead of ɵɵreplaceMetadata', () => {
    const code = generateHmrCode([
      {
        className: 'TruncatePipe',
        selector: 'truncate',
        kind: 'pipe',
        pipeName: 'truncate',
        fileName: 'truncate.ts',
      },
    ]);

    expect(code).toContain('ɵhmr_TruncatePipe');
    expect(code).not.toContain('i0.ɵɵreplaceMetadata(');
    expect(code).toContain(
      "import.meta.hot.invalidate('Directive/pipe changed, reloading')",
    );
  });

  it('handles mixed components and directives in one file', () => {
    const code = generateHmrCode([
      {
        className: 'MyComponent',
        selector: 'app-my',
        kind: 'component',
        fileName: 'shared.ts',
      },
      {
        className: 'MyDirective',
        selector: '[appMy]',
        kind: 'directive',
        fileName: 'shared.ts',
      },
    ]);

    // Should have both ɵɵreplaceMetadata for component and invalidate for directive
    expect(code).toContain('ɵɵreplaceMetadata');
    expect(code).toContain('newModule.ɵhmr_MyComponent');
    expect(code).toContain('newModule.ɵhmr_MyDirective(MyDirective)');
    expect(code).toContain(
      "import.meta.hot.invalidate('Directive/pipe changed, reloading')",
    );
    // Both should get applyMetadata functions
    expect(code).toContain('ɵhmr_MyComponent(type)');
    expect(code).toContain('ɵhmr_MyDirective(type)');
  });

  it('passes local dependencies to ɵɵreplaceMetadata', () => {
    const code = generateHmrCode(
      [
        {
          className: 'ParentComponent',
          selector: 'app-parent',
          kind: 'component',
          fileName: 'parent.ts',
        },
      ],
      ['ParentComponent', 'ChildComponent'],
    );

    expect(code).toContain('[ParentComponent, ChildComponent]');
  });

  it('passes empty local deps array by default', () => {
    const code = generateHmrCode([
      {
        className: 'MyComponent',
        selector: 'app-my',
        kind: 'component',
        fileName: 'my.ts',
      },
    ]);

    // Default: no local deps
    expect(code).toMatch(/ɵɵreplaceMetadata\(\s*MyComponent[\s\S]*?\[\],/);
  });
});

describe('sourcePackage in registry entries', () => {
  it('uses sourcePackage for synthetic imports of NgModule exports', () => {
    // Simulate a registry where ButtonComponent comes from @my-lib/ui/button
    // but is exported through SharedModule from @my-lib/ui
    const registry = buildRegistry({
      'app.ts': '',
    });
    registry.set('ButtonComponent', {
      selector: 'ui-button',
      kind: 'component',
      fileName: 'button.d.ts',
      className: 'ButtonComponent',
      sourcePackage: '@my-lib/ui/button',
    });
    registry.set('SharedModule', {
      selector: 'SharedModule',
      kind: 'ngmodule',
      fileName: 'shared.d.ts',
      className: 'SharedModule',
      exports: ['ButtonComponent'],
    });

    const appSrc = `
      import { Component } from '@angular/core';
      import { SharedModule } from '@my-lib/ui';
      @Component({
        selector: 'app-root',
        imports: [SharedModule],
        template: '<ui-button>Click</ui-button>'
      })
      export class AppComponent {}
    `;

    const result = compile(appSrc, 'app.ts', registry);
    expectCompiles(result);
    // Should import from the sub-entry, not from the NgModule's specifier
    expect(result).toContain('from "@my-lib/ui/button"');
    expect(result).not.toMatch(
      /import\s*\{[^}]*ButtonComponent[^}]*\}\s*from\s*["']@my-lib\/ui["']/,
    );
  });

  it('falls back to moduleSpecifier when sourcePackage is absent', () => {
    const registry = buildRegistry({
      'app.ts': '',
    });
    registry.set('ButtonComponent', {
      selector: 'ui-button',
      kind: 'component',
      fileName: 'button.d.ts',
      className: 'ButtonComponent',
      // No sourcePackage
    });
    registry.set('SharedModule', {
      selector: 'SharedModule',
      kind: 'ngmodule',
      fileName: 'shared.d.ts',
      className: 'SharedModule',
      exports: ['ButtonComponent'],
    });

    const appSrc = `
      import { Component } from '@angular/core';
      import { SharedModule } from '@my-lib/ui';
      @Component({
        selector: 'app-root',
        imports: [SharedModule],
        template: '<ui-button>Click</ui-button>'
      })
      export class AppComponent {}
    `;

    const result = compile(appSrc, 'app.ts', registry);
    expectCompiles(result);
    // Falls back to the import specifier of the NgModule
    expect(result).toContain('from "@my-lib/ui"');
  });
});

describe('scanFile preserves sourcePackage as undefined', () => {
  it('does not set sourcePackage on source-scanned entries', () => {
    const entries = scanFile(
      `
      import { Component } from '@angular/core';
      @Component({ selector: 'app-test', template: '' })
      export class TestComponent {}
    `,
      'test.ts',
    );

    expect(entries).toHaveLength(1);
    expect(entries[0].sourcePackage).toBeUndefined();
  });
});

describe('Sourcemap accuracy after type-only import elision', () => {
  it('produces sourcemap aligned with post-elision code', () => {
    const result = rawCompile(
      `
      import { Component } from '@angular/core';
      import { SomeType } from './models';

      @Component({ selector: 'app-test', template: '<p>hi</p>' })
      export class TestComponent {
        value: SomeType = {} as any;
      }
    `,
      'test.ts',
    );

    // SomeType should be elided from the output
    expect(result.code).not.toContain("from './models'");

    // Sourcemap should exist and reference the original source
    expect(result.map).toBeTruthy();
    expect(result.map.sources).toContain('test.ts');

    // Mappings should be non-empty
    expect(result.map.mappings.length).toBeGreaterThan(0);

    // The sourcemap's sourcesContent should contain the original source
    expect(result.map.sourcesContent).toBeTruthy();
    expect(result.map.sourcesContent[0]).toContain('import { SomeType }');
  });

  it('preserves sourcemap accuracy when no imports are elided', () => {
    const result = rawCompile(
      `
      import { Component, signal } from '@angular/core';

      @Component({ selector: 'app-test', template: '{{ count() }}' })
      export class TestComponent {
        count = signal(0);
      }
    `,
      'test.ts',
    );

    expect(result.code).toContain('signal');
    expect(result.map).toBeTruthy();
    expect(result.map.mappings.length).toBeGreaterThan(0);
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

describe('hasDirectiveDependencies with unresolved imports', () => {
  it('includes dependencies function when component has imports', () => {
    const result = compile(
      `
      import { Component } from '@angular/core';
      import { RouterOutlet } from '@angular/router';
      @Component({
        selector: 'app-test',
        template: '<router-outlet />',
        imports: [RouterOutlet],
      })
      export class TestComponent {}
    `,
      'test.ts',
    );

    expectCompiles(result);
    // The component should have a dependencies function that includes RouterOutlet
    expect(result).toContain('dependencies');
    expect(result).toContain('RouterOutlet');
  });
});

describe('type-elision preserves TSAsExpression value references', () => {
  it('does not elide imports used inside as-casts', () => {
    const typeOnly = detectTypeOnlyImportNames(`
      import data from './data.json';
      type MyType = { name: string };
      const items = (data as MyType[]).map(x => x.name);
    `);
    expect(typeOnly.has('data')).toBe(false);
  });

  it('does not elide imports used inside satisfies expressions', () => {
    const typeOnly = detectTypeOnlyImportNames(`
      import { config } from './config';
      type Config = { port: number };
      const c = config satisfies Config;
    `);
    expect(typeOnly.has('config')).toBe(false);
  });

  it('still elides truly type-only imports', () => {
    const typeOnly = detectTypeOnlyImportNames(`
      import { MyInterface } from './types';
      const x: MyInterface = { name: 'test' };
    `);
    expect(typeOnly.has('MyInterface')).toBe(true);
  });
});

describe('constant pool helpers survive type-only import elision', () => {
  it('emits @for template functions when last import is type-only', () => {
    const result = compile(
      `
      import { Component, input } from '@angular/core';
      import { UnifiedPost } from '../data/posts';

      @Component({
        selector: 'app-posts',
        template: \`
          @for (post of posts(); track post.slug) {
            <p>{{ post.title }}</p>
          }
        \`
      })
      export class PostsComponent {
        posts = input<UnifiedPost[]>([]);
      }
    `,
      'posts.component.ts',
    );

    expectCompiles(result);
    // Template helper must be defined, not just referenced
    expect(result).toMatch(/function PostsComponent_For_\d+_Template/);
    expect(result).toContain('ɵɵrepeaterCreate');
    // Type-only import should be elided
    expect(result).not.toContain('import { UnifiedPost }');
  });

  it('emits @for track function when last import is type-only', () => {
    const result = compile(
      `
      import { Component, input } from '@angular/core';
      import { Item } from './models';

      @Component({
        selector: 'app-list',
        template: \`
          @for (item of items(); track item.id) {
            <span>{{ item.name }}</span>
          }
        \`
      })
      export class ListComponent {
        items = input<Item[]>([]);
      }
    `,
      'list.component.ts',
    );

    expectCompiles(result);
    expect(result).toMatch(/_forTrack\d/);
    expect(result).not.toContain('import { Item }');
  });

  it('emits helpers when multiple trailing imports are type-only', () => {
    const result = compile(
      `
      import { Component, input } from '@angular/core';
      import { TypeA } from './types-a';
      import { TypeB } from './types-b';

      @Component({
        selector: 'app-multi',
        template: \`
          @for (item of items(); track item) {
            <p>{{ item }}</p>
          }
        \`
      })
      export class MultiComponent {
        items = input<TypeA[]>([]);
        other: TypeB | undefined;
      }
    `,
      'multi.component.ts',
    );

    expectCompiles(result);
    expect(result).toMatch(/function MultiComponent_For_\d+_Template/);
    expect(result).not.toContain('import { TypeA }');
    expect(result).not.toContain('import { TypeB }');
  });
});

describe('Registry outputFromObservable support', () => {
  it('extracts outputFromObservable as output in registry', () => {
    const entries = scanFile(
      `
      import { Component, outputFromObservable } from '@angular/core';
      import { Subject } from 'rxjs';

      @Component({ selector: 'app-test', template: '' })
      export class TestComponent {
        private subject = new Subject<string>();
        changed = outputFromObservable(this.subject);
      }
    `,
      'test.ts',
    );

    expect(entries).toHaveLength(1);
    expect(entries[0].outputs).toBeDefined();
    expect(entries[0].outputs!['changed']).toBe('changed');
  });
});

describe('JIT transform nested class support', () => {
  it('processes classes nested inside function scopes', () => {
    const result = jitTransform(
      `
      import { Component } from '@angular/core';

      @Component({ selector: 'app-top', template: '' })
      export class TopComponent {}

      function factory() {
        @Component({ selector: 'app-inner', template: '' })
        class InnerComponent {}
        return InnerComponent;
      }
    `,
      'test.component.ts',
    ).code;

    // Both top-level and nested classes should be processed
    expect(result).toContain('TopComponent.decorators');
    expect(result).toContain('InnerComponent.decorators');
  });
});

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

describe('Shared constants prevent drift', () => {
  it('COMPILABLE_DECORATORS is a strict subset of ANGULAR_DECORATORS', () => {
    for (const name of COMPILABLE_DECORATORS) {
      expect(ANGULAR_DECORATORS.has(name)).toBe(true);
    }
    expect(COMPILABLE_DECORATORS.has('Injectable')).toBe(false);
    expect(ANGULAR_DECORATORS.has('Injectable')).toBe(true);
  });

  it('registry scanFile uses COMPILABLE_DECORATORS (skips @Injectable)', () => {
    const entries = scanFile(
      `
      import { Injectable } from '@angular/core';

      @Injectable({ providedIn: 'root' })
      export class MyService {}
    `,
      'service.ts',
    );
    expect(entries).toHaveLength(0);
  });

  it('registry scanFile recognises all COMPILABLE_DECORATORS', () => {
    const entries = scanFile(
      `
      import { Component, Directive, Pipe, NgModule } from '@angular/core';

      @Component({ selector: 'app-a', template: '' })
      export class CompA {}

      @Directive({ selector: '[dir]' })
      export class DirA {}

      @Pipe({ name: 'myPipe' })
      export class MyPipe {}

      @NgModule({ exports: [CompA] })
      export class MyModule {}
    `,
      'all.ts',
    );
    expect(entries).toHaveLength(4);
    expect(entries.map((e) => e.kind).sort()).toEqual([
      'component',
      'directive',
      'ngmodule',
      'pipe',
    ]);
  });

  it('compile handles all ANGULAR_DECORATORS via shared set', () => {
    const result = compile(
      `
      import { Component, Injectable } from '@angular/core';

      @Injectable({ providedIn: 'root' })
      export class MyService {}

      @Component({ selector: 'app-test', template: '<p>hi</p>' })
      export class TestComponent {}
    `,
      'test.ts',
    );
    expectCompiles(result);
    expect(result).toContain('ɵcmp');
  });

  it('JIT transform uses ANGULAR_DECORATORS for all five decorators', () => {
    const result = jitTransform(
      `
      import { Component, Directive, Pipe, NgModule } from '@angular/core';

      @Component({ selector: 'app-a', template: '' })
      export class CompA {}

      @Directive({ selector: '[dir]' })
      export class DirA {}

      @Pipe({ name: 'p', pure: true })
      export class PipeA {}

      @NgModule({ exports: [] })
      export class ModA {}
    `,
      'all.ts',
    ).code;

    expect(result).toContain('CompA.decorators');
    expect(result).toContain('DirA.decorators');
    expect(result).toContain('PipeA.decorators');
    expect(result).toContain('ModA.decorators');
  });

  it('FIELD_DECORATORS covers all member decorator types', () => {
    const result = compile(
      `
      import { Component, Input, Output, ViewChild, ContentChild, HostBinding, HostListener, EventEmitter, ElementRef } from '@angular/core';

      @Component({ selector: 'app-test', template: '' })
      export class TestComponent {
        @Input() name: string = '';
        @Output() clicked = new EventEmitter();
        @ViewChild('ref') ref!: ElementRef;
        @ContentChild('slot') slot!: ElementRef;
        @HostBinding('class.active') isActive = true;
        @HostListener('click') onClick() {}
      }
    `,
      'test.ts',
    );
    expectCompiles(result);
    // Field decorators should be stripped from the compiled output
    for (const dec of FIELD_DECORATORS) {
      expect(result).not.toMatch(new RegExp(`@${dec}\\(`));
    }
  });

  it('SIGNAL_APIS covers all signal-based reactive APIs in compilation', () => {
    const result = compile(
      `
      import { Component, input, output, model, viewChild, contentChild, ElementRef } from '@angular/core';

      @Component({ selector: 'app-test', template: '<div #box></div>' })
      export class TestComponent {
        name = input<string>();
        requiredName = input.required<string>();
        clicked = output<void>();
        value = model<string>();
        box = viewChild<ElementRef>('box');
      }
    `,
      'test.ts',
    );
    expectCompiles(result);
    // Signal APIs should produce Ivy input/output definitions
    expect(result).toContain('ɵcmp');
  });
});

describe('JIT transform auto-imports decorator classes for signal API downleveling', () => {
  it('adds Input import when input() is downleveled but Input is not imported', () => {
    const result = jitTransform(
      `
      import { Component, input } from '@angular/core';

      @Component({ selector: 'app-test', template: '' })
      export class TestComponent {
        name = input<string>();
      }
    `,
      'test.component.ts',
    ).code;

    expect(result).toContain(`import { Input } from '@angular/core'`);
    expect(result).toContain('type: Input');
  });

  it('adds Input and Output imports when model() is downleveled', () => {
    const result = jitTransform(
      `
      import { Component, model } from '@angular/core';

      @Component({ selector: 'app-test', template: '' })
      export class TestComponent {
        value = model<string>();
      }
    `,
      'test.component.ts',
    ).code;

    expect(result).toContain('Input');
    expect(result).toContain('Output');
  });

  it('does not duplicate import when Input is already imported', () => {
    const result = jitTransform(
      `
      import { Component, Input, input } from '@angular/core';

      @Component({ selector: 'app-test', template: '' })
      export class TestComponent {
        name = input<string>();
        @Input() other: string = '';
      }
    `,
      'test.component.ts',
    ).code;

    // Should NOT have a second import line for Input
    const importMatches = result.match(
      /import\s*\{[^}]*Input[^}]*\}\s*from\s*'@angular\/core'/g,
    );
    expect(importMatches!.length).toBe(1);
  });

  it('adds Output import when output() is used without Output import', () => {
    const result = jitTransform(
      `
      import { Component, output } from '@angular/core';

      @Component({ selector: 'app-test', template: '' })
      export class TestComponent {
        clicked = output<void>();
      }
    `,
      'test.component.ts',
    ).code;

    expect(result).toContain(`import { Output } from '@angular/core'`);
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

describe('Signal input/model alias support', () => {
  it('extracts alias from input() options in registry', () => {
    const entries = scanFile(
      `
      import { Component, input } from '@angular/core';
      @Component({ selector: 'app-c', template: '' })
      export class C {
        ariaLabel = input<string | null>(null, { alias: 'aria-label' });
      }
    `,
      'c.ts',
    );
    expect(entries[0].inputs!['ariaLabel']).toEqual({
      classPropertyName: 'ariaLabel',
      bindingPropertyName: 'aria-label',
      isSignal: true,
      required: false,
    });
  });

  it('extracts alias from input.required() options in registry', () => {
    const entries = scanFile(
      `
      import { Component, input } from '@angular/core';
      @Component({ selector: 'app-c', template: '' })
      export class C {
        value = input.required<string>({ alias: 'public-value' });
      }
    `,
      'c.ts',
    );
    expect(entries[0].inputs!['value']).toEqual({
      classPropertyName: 'value',
      bindingPropertyName: 'public-value',
      isSignal: true,
      required: true,
    });
  });

  it('extracts alias from model() options and produces aliased Change output', () => {
    const entries = scanFile(
      `
      import { Component, model } from '@angular/core';
      @Component({ selector: 'app-c', template: '' })
      export class C {
        value = model<number>(0, { alias: 'val' });
      }
    `,
      'c.ts',
    );
    expect(entries[0].inputs!['value'].bindingPropertyName).toBe('val');
    // Outputs map: { classProp: bindingName }
    expect(entries[0].outputs!['value']).toBe('valChange');
  });

  it('emits aliased binding name in compiled component output', () => {
    const result = compile(
      `
      import { Component, input } from '@angular/core';
      @Component({ selector: 'app-c', template: '' })
      export class C {
        ariaLabel = input<string | null>(null, { alias: 'aria-label' });
      }
    `,
      'c.ts',
    );
    expectCompiles(result);
    // Aliased input descriptor: [flags, publicName, classPropertyName]
    // Look for the aliased public name in the inputs map
    expect(result).toContain('"aria-label"');
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

describe('Tuple barrel registry and imports expansion', () => {
  it('scans `export const X = [A, B] as const` as a tuple entry', () => {
    const entries = scanFile(
      `
      import { HlmSelect } from './hlm-select';
      import { HlmSelectContent } from './hlm-select-content';
      export const HlmSelectImports = [HlmSelect, HlmSelectContent] as const;
    `,
      'barrel.ts',
    );
    const tuple = entries.find((e) => e.kind === 'tuple');
    expect(tuple).toBeDefined();
    expect(tuple!.className).toBe('HlmSelectImports');
    expect(tuple!.members).toEqual(['HlmSelect', 'HlmSelectContent']);
  });

  it('scans `const X = [A, B]` (non-exported) as a tuple entry', () => {
    const entries = scanFile(
      `
      import { Foo } from './foo';
      const Tup = [Foo];
    `,
      't.ts',
    );
    const tuple = entries.find((e) => e.kind === 'tuple');
    expect(tuple).toBeDefined();
    expect(tuple!.members).toEqual(['Foo']);
  });

  it('expands tuple barrel in component imports into underlying directives', () => {
    const registry = buildRegistry({
      'child.ts': `
        import { Component } from '@angular/core';
        @Component({ selector: 'child-a', template: '' })
        export class ChildA {}
        @Component({ selector: 'child-b', template: '' })
        export class ChildB {}
      `,
      'barrel.ts': `
        import { ChildA } from './child';
        import { ChildB } from './child';
        export const ChildImports = [ChildA, ChildB] as const;
      `,
    });
    const result = compile(
      `
      import { Component } from '@angular/core';
      import { ChildImports } from './barrel';
      @Component({
        selector: 'app-root',
        imports: [ChildImports],
        template: '<child-a></child-a><child-b></child-b>',
      })
      export class App {}
    `,
      'app.ts',
      registry,
    );
    expectCompiles(result);
    // Both children should appear as dependencies
    expect(result).toContain('ChildA');
    expect(result).toContain('ChildB');
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

describe('Abstract directive with no selector compiles', () => {
  it('compiles `@Directive()` (no selector) without crashing', () => {
    const result = compile(
      `
      import { Directive } from '@angular/core';
      @Directive()
      export abstract class BaseDir {}
    `,
      'b.ts',
    );
    expectCompiles(result);
    expect(result).toContain('ɵdir');
  });
});

describe('Directive providers wrapped as LiteralArrayExpr', () => {
  it('compiles directive providers without crashing at runtime', () => {
    const result = compile(
      `
      import { Directive, InjectionToken } from '@angular/core';
      const TOKEN = new InjectionToken<string>('t');
      @Directive({
        selector: '[d]',
        providers: [{ provide: TOKEN, useValue: 'x' }],
      })
      export class D {}
    `,
      'd.ts',
    );
    expectCompiles(result);
    // Providers should be emitted as a feature
    expect(result).toContain('ProvidersFeature');
  });

  it('omits providers feature when directive has no providers', () => {
    const result = compile(
      `
      import { Directive } from '@angular/core';
      @Directive({ selector: '[d]' })
      export class D {}
    `,
      'd.ts',
    );
    expectCompiles(result);
    expect(result).not.toContain('ProvidersFeature');
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

describe('collectRelativeReExports', () => {
  it('returns relative `export *` and `export { } from` specifiers', () => {
    const code = `
      export * from './a';
      export * as Ns from './b';
      export { Foo } from './c';
      export { Bar } from 'pkg';
      export const local = 1;
    `;
    const result = collectRelativeReExports(code, 'index.ts');
    expect(result).toEqual(['./a', './b', './c']);
  });

  it('skips bare-specifier re-exports', () => {
    const code = `export * from '@angular/core';`;
    expect(collectRelativeReExports(code, 'i.ts')).toEqual([]);
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
});

describe('@Injectable provider configuration', () => {
  it('emits useFactory in ɵprov', () => {
    const result = compile(
      `
      import { Injectable } from '@angular/core';
      @Injectable({ providedIn: 'root', useFactory: () => new Svc() })
      export class Svc {}
    `,
      's.ts',
    );
    expectCompiles(result);
    // ɵprov should include the factory expression
    expect(result).toContain('ɵprov');
    expect(result).toMatch(/useFactory|factory:\s*\(\)/);
  });

  it('emits useValue in ɵprov', () => {
    const result = compile(
      `
      import { Injectable } from '@angular/core';
      @Injectable({ providedIn: 'root', useValue: 42 })
      export class Svc {}
    `,
      's.ts',
    );
    expectCompiles(result);
    expect(result).toContain('ɵprov');
    expect(result).toContain('42');
  });

  it('emits useClass in ɵprov', () => {
    const result = compile(
      `
      import { Injectable } from '@angular/core';
      export class Other {}
      @Injectable({ providedIn: 'root', useClass: Other })
      export class Svc {}
    `,
      's.ts',
    );
    expectCompiles(result);
    expect(result).toContain('ɵprov');
    expect(result).toContain('Other');
  });

  it('emits useExisting in ɵprov', () => {
    const result = compile(
      `
      import { Injectable, InjectionToken } from '@angular/core';
      const TOKEN = new InjectionToken<string>('t');
      @Injectable({ providedIn: 'root', useExisting: TOKEN })
      export class Svc {}
    `,
      's.ts',
    );
    expectCompiles(result);
    expect(result).toContain('ɵprov');
    expect(result).toContain('TOKEN');
  });
});

describe('Output alias in registry', () => {
  it('extracts alias from output() options in registry', () => {
    const entries = scanFile(
      `
      import { Component, output } from '@angular/core';
      @Component({ selector: 'app-c', template: '' })
      export class C {
        click = output<void>({ alias: 'publicClick' });
      }
    `,
      'c.ts',
    );
    expect(entries[0].outputs!['click']).toBe('publicClick');
  });

  it('extracts alias from outputFromObservable() options in registry', () => {
    const entries = scanFile(
      `
      import { Component } from '@angular/core';
      import { outputFromObservable } from '@angular/core/rxjs-interop';
      import { Subject } from 'rxjs';
      @Component({ selector: 'app-c', template: '' })
      export class C {
        change = outputFromObservable(new Subject<number>(), { alias: 'changed' });
      }
    `,
      'c.ts',
    );
    expect(entries[0].outputs!['change']).toBe('changed');
  });

  it('falls back to property name when no alias', () => {
    const entries = scanFile(
      `
      import { Component, output } from '@angular/core';
      @Component({ selector: 'app-c', template: '' })
      export class C {
        click = output<void>();
      }
    `,
      'c.ts',
    );
    expect(entries[0].outputs!['click']).toBe('click');
  });
});

describe('@Inject(forwardRef(...)) unwrapping', () => {
  it('unwraps forwardRef in @Inject argument', () => {
    const result = compile(
      `
      import { Component, Inject, forwardRef, InjectionToken } from '@angular/core';
      const TOKEN = new InjectionToken<string>('t');
      @Component({ selector: 'app-c', template: '' })
      export class C {
        constructor(@Inject(forwardRef(() => TOKEN)) value: string) {}
      }
    `,
      'c.ts',
    );
    expectCompiles(result);
    // Factory should reference TOKEN directly, not the forwardRef call
    expect(result).toContain('TOKEN');
    // Must NOT emit the unwrapped forwardRef call inside the factory
    expect(result).not.toMatch(/ɵɵdirectiveInject\(forwardRef\(/);
  });
});

function expectCompiles(result: string) {
  expect(result).toBeTruthy();
  expect(result).not.toMatch(/^Error:/m);
}
