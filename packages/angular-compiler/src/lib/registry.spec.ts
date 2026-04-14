import { describe, it, expect } from 'vitest';
import { scanFile } from './registry';
import {
  buildRegistry,
  compileCode as compile,
  expectCompiles,
} from './test-helpers';

describe('Registry scanFile', () => {
  it('extracts component metadata', () => {
    const entries = scanFile(
      `
      import { Component } from '@angular/core';
      @Component({ selector: 'app-test', template: '' })
      export class TestComponent {}
    `,
      'test.ts',
    );

    expect(entries).toHaveLength(1);
    expect(entries[0].selector).toBe('app-test');
    expect(entries[0].kind).toBe('component');
    expect(entries[0].className).toBe('TestComponent');
  });

  it('extracts directive metadata', () => {
    const entries = scanFile(
      `
      import { Directive } from '@angular/core';
      @Directive({ selector: '[appTest]' })
      export class TestDirective {}
    `,
      'test.ts',
    );

    expect(entries).toHaveLength(1);
    expect(entries[0].selector).toBe('[appTest]');
    expect(entries[0].kind).toBe('directive');
  });

  it('extracts pipe metadata', () => {
    const entries = scanFile(
      `
      import { Pipe } from '@angular/core';
      @Pipe({ name: 'myPipe' })
      export class MyPipe {}
    `,
      'test.ts',
    );

    expect(entries).toHaveLength(1);
    expect(entries[0].kind).toBe('pipe');
    expect(entries[0].pipeName).toBe('myPipe');
    expect(entries[0].selector).toBe('myPipe');
  });

  it('extracts NgModule with exports', () => {
    const entries = scanFile(
      `
      import { NgModule } from '@angular/core';
      @NgModule({
        declarations: [FooComponent],
        exports: [FooComponent, BarDirective]
      })
      export class SharedModule {}
    `,
      'shared.module.ts',
    );

    expect(entries).toHaveLength(1);
    expect(entries[0].kind).toBe('ngmodule');
    expect(entries[0].className).toBe('SharedModule');
    expect(entries[0].exports).toEqual(['FooComponent', 'BarDirective']);
  });

  it('skips files without decorators', () => {
    const entries = scanFile(
      `
      export class PlainClass {}
      export function helper() {}
    `,
      'plain.ts',
    );

    expect(entries).toHaveLength(0);
  });

  it('extracts multiple declarations from one file', () => {
    const entries = scanFile(
      `
      import { Component, Directive, Pipe } from '@angular/core';
      @Component({ selector: 'app-a', template: '' })
      export class AComponent {}
      @Directive({ selector: '[appB]' })
      export class BDirective {}
      @Pipe({ name: 'cPipe' })
      export class CPipe {}
    `,
      'multi.ts',
    );

    expect(entries).toHaveLength(3);
    expect(entries.map((e) => e.kind)).toEqual([
      'component',
      'directive',
      'pipe',
    ]);
  });
});

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

describe('Signal input transform marker in registry', () => {
  it('flags hasTransform when input() declares a transform', () => {
    const entries = scanFile(
      `
      import { Component, input, booleanAttribute } from '@angular/core';
      @Component({ selector: 'app-c', template: '' })
      export class C {
        flag = input(false, { transform: booleanAttribute });
      }
    `,
      'c.ts',
    );
    expect(entries[0].inputs!['flag'].hasTransform).toBe(true);
  });

  it('omits hasTransform when no transform option', () => {
    const entries = scanFile(
      `
      import { Component, input } from '@angular/core';
      @Component({ selector: 'app-c', template: '' })
      export class C {
        flag = input<boolean>();
      }
    `,
      'c.ts',
    );
    expect(entries[0].inputs!['flag'].hasTransform).toBeUndefined();
  });

  it('flags hasTransform on input.required()', () => {
    const entries = scanFile(
      `
      import { Component, input, booleanAttribute } from '@angular/core';
      @Component({ selector: 'app-c', template: '' })
      export class C {
        flag = input.required({ transform: booleanAttribute });
      }
    `,
      'c.ts',
    );
    expect(entries[0].inputs!['flag'].hasTransform).toBe(true);
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
