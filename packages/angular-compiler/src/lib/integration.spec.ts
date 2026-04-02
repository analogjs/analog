import { describe, it, expect } from 'vitest';
import { scanFile } from './registry';
import { compile as rawCompile } from './compile';
import { compileCode as compile, buildRegistry } from './test-helpers';
import { inlineResourceUrls, extractInlineStyles } from './resource-inliner';
import { scanDtsFile, collectImportedPackages } from './dts-reader';

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
    expect(entries[0].outputs!['valueChange']).toBe('valueChange');
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

function expectCompiles(result: string) {
  expect(result).toBeTruthy();
  expect(result).not.toMatch(/^Error:/m);
}
