import { describe, it, expect } from 'vitest';
import { jitTransform } from './jit-transform';

function transform(code: string): string {
  return jitTransform(code, 'test.ts').code;
}

describe('JIT Transform', () => {
  describe('Decorator Conversion', () => {
    it('converts @Component to static decorators array', () => {
      const result = transform(`
        import { Component } from '@angular/core';
        @Component({ selector: 'app-test', template: '<p>hi</p>' })
        export class TestComponent {}
      `);

      expect(result).not.toMatch(/@Component/);
      expect(result).toContain('TestComponent.decorators');
      expect(result).toContain('type: Component');
      expect(result).toContain("selector: 'app-test'");
    });

    it('converts @Directive to static decorators array', () => {
      const result = transform(`
        import { Directive } from '@angular/core';
        @Directive({ selector: '[appTest]' })
        export class TestDirective {}
      `);

      expect(result).not.toMatch(/@Directive/);
      expect(result).toContain('TestDirective.decorators');
      expect(result).toContain('type: Directive');
    });

    it('converts @Pipe to static decorators array', () => {
      const result = transform(`
        import { Pipe } from '@angular/core';
        @Pipe({ name: 'myPipe' })
        export class MyPipe { transform(v: string) { return v; } }
      `);

      expect(result).not.toMatch(/@Pipe/);
      expect(result).toContain('MyPipe.decorators');
      expect(result).toContain('type: Pipe');
    });

    it('preserves @Injectable on the class (no ɵcompileInjectable JIT entry point)', () => {
      const result = transform(`
        import { Injectable } from '@angular/core';
        @Injectable({ providedIn: 'root' })
        export class MyService {}
      `);

      // @Injectable must remain so Angular's decorator self-registers ɵprov
      expect(result).toMatch(/@Injectable/);
      expect(result).not.toContain('MyService.decorators');
    });

    it('preserves non-Angular decorators', () => {
      const result = transform(`
        import { SomeDecorator } from 'somewhere';
        @SomeDecorator()
        export class X {}
      `);

      expect(result).toContain('@SomeDecorator');
      expect(result).not.toContain('X.decorators');
    });

    it('removes @Input decorators from source', () => {
      const result = transform(`
        import { Component, Input } from '@angular/core';
        @Component({ selector: 'x', template: '' })
        export class X {
          @Input()
          name = '';
        }
      `);

      expect(result).not.toMatch(/@Input/);
      expect(result).toContain('X.propDecorators');
      expect(result).toContain("name = ''");
    });

    it('removes @Output decorators from source', () => {
      const result = transform(`
        import { Component, Output, EventEmitter } from '@angular/core';
        @Component({ selector: 'x', template: '' })
        export class X {
          @Output()
          clicked = new EventEmitter<void>();
        }
      `);

      expect(result).not.toMatch(/@Output/);
      expect(result).toContain('X.propDecorators');
      expect(result).toContain('new EventEmitter');
    });

    it('removes multiple member decorators from source', () => {
      const result = transform(`
        import { Component, Input, Output, EventEmitter } from '@angular/core';
        @Component({ selector: 'x', template: '' })
        export class X {
          @Input() label = '';
          @Input() size: 'small' | 'large' = 'small';
          @Output() clicked = new EventEmitter();
        }
      `);

      expect(result).not.toMatch(/@Input/);
      expect(result).not.toMatch(/@Output/);
      expect(result).toContain("label = ''");
      expect(result).toContain('new EventEmitter');
    });

    it('removes @ViewChild and @ContentChild decorators from source', () => {
      const result = transform(`
        import { Component, ViewChild, ContentChild, ElementRef } from '@angular/core';
        @Component({ selector: 'x', template: '' })
        export class X {
          @ViewChild('ref') myRef!: ElementRef;
          @ContentChild('item') myItem!: ElementRef;
        }
      `);

      expect(result).not.toMatch(/@ViewChild/);
      expect(result).not.toMatch(/@ContentChild/);
      expect(result).toContain('type: ViewChild');
      expect(result).toContain('type: ContentChild');
    });
  });

  describe('Constructor DI', () => {
    it('emits ctorParameters for constructor injection', () => {
      const result = transform(`
        import { Component } from '@angular/core';
        class MyService {}
        @Component({ selector: 'x', template: '' })
        export class X { constructor(private svc: MyService) {} }
      `);

      expect(result).toContain('X.ctorParameters');
      expect(result).toContain('type: MyService');
    });

    it('emits ctorParameters with @Inject decorator and removes it from source', () => {
      const result = transform(`
        import { Component, Inject } from '@angular/core';
        @Component({ selector: 'x', template: '' })
        export class X { constructor(@Inject('TOKEN') private val: string) {} }
      `);

      expect(result).toContain('X.ctorParameters');
      expect(result).toContain('type: Inject');
      expect(result).not.toMatch(/@Inject/);
    });

    it('emits ctorParameters with @Optional and removes it from source', () => {
      const result = transform(`
        import { Component, Optional } from '@angular/core';
        class Svc {}
        @Component({ selector: 'x', template: '' })
        export class X { constructor(@Optional() private svc: Svc) {} }
      `);

      expect(result).toContain('X.ctorParameters');
      expect(result).toContain('type: Optional');
      expect(result).not.toMatch(/@Optional/);
    });

    it('does not emit ctorParameters for empty constructor', () => {
      const result = transform(`
        import { Component } from '@angular/core';
        @Component({ selector: 'x', template: '' })
        export class X { constructor() {} }
      `);

      expect(result).not.toContain('ctorParameters');
    });
  });

  describe('Signal API Downleveling', () => {
    it('downlevels input() to propDecorators', () => {
      const result = transform(`
        import { Component, input } from '@angular/core';
        @Component({ selector: 'x', template: '' })
        export class X { name = input<string>(); }
      `);

      expect(result).toContain('X.propDecorators');
      expect(result).toContain('type: Input');
      expect(result).toContain('isSignal: true');
    });

    it('downlevels input.required() with required flag', () => {
      const result = transform(`
        import { Component, input } from '@angular/core';
        @Component({ selector: 'x', template: '' })
        export class X { id = input.required<number>(); }
      `);

      expect(result).toContain('X.propDecorators');
      expect(result).toContain('required: true');
    });

    it('downlevels model() to Input + Output', () => {
      const result = transform(`
        import { Component, model } from '@angular/core';
        @Component({ selector: 'x', template: '' })
        export class X { value = model(0); }
      `);

      expect(result).toContain('X.propDecorators');
      expect(result).toContain('type: Input');
      expect(result).toContain('type: Output');
      expect(result).toContain('valueChange');
    });

    it('downlevels output() to propDecorators', () => {
      const result = transform(`
        import { Component, output } from '@angular/core';
        @Component({ selector: 'x', template: '' })
        export class X { clicked = output<void>(); }
      `);

      expect(result).toContain('X.propDecorators');
      expect(result).toContain('type: Output');
    });

    it('downlevels output() with alias', () => {
      const result = transform(`
        import { Component, output } from '@angular/core';
        @Component({ selector: 'x', template: '' })
        export class X { c = output({alias: 'cPublic'}); }
      `);

      expect(result).toContain('cPublic');
    });

    it('downlevels viewChild() to propDecorators', () => {
      const result = transform(`
        import { Component, viewChild } from '@angular/core';
        @Component({ selector: 'x', template: '<input #ref />' })
        export class X { myRef = viewChild('ref'); }
      `);

      expect(result).toContain('X.propDecorators');
      expect(result).toContain('type: ViewChild');
    });

    it('downlevels contentChildren() to propDecorators', () => {
      const result = transform(`
        import { Component, contentChildren } from '@angular/core';
        @Component({ selector: 'x', template: '' })
        export class X { items = contentChildren('item'); }
      `);

      expect(result).toContain('type: ContentChildren');
    });
  });

  describe('External Resources', () => {
    it('converts templateUrl to ESM import', () => {
      const result = transform(`
        import { Component } from '@angular/core';
        @Component({ selector: 'x', templateUrl: './test.html' })
        export class X {}
      `);

      expect(result).toContain("import _jit_tpl_0 from './test.html?raw'");
      expect(result).toContain('template: _jit_tpl_0');
      expect(result).not.toContain('templateUrl');
    });

    it('converts styleUrl to ESM import', () => {
      const result = transform(`
        import { Component } from '@angular/core';
        @Component({ selector: 'x', template: '', styleUrl: './test.scss' })
        export class X {}
      `);

      expect(result).toContain("import _jit_style_0 from './test.scss?inline'");
      expect(result).toContain('styles: [_jit_style_0]');
      expect(result).not.toContain('styleUrl');
    });

    it('converts styleUrls array to ESM imports', () => {
      const result = transform(`
        import { Component } from '@angular/core';
        @Component({ selector: 'x', template: '', styleUrls: ['./a.css', './b.scss'] })
        export class X {}
      `);

      expect(result).toContain("import _jit_style_0 from './a.css?inline'");
      expect(result).toContain("import _jit_style_1 from './b.scss?inline'");
      expect(result).toContain('styles: [_jit_style_0, _jit_style_1]');
      expect(result).not.toContain('styleUrls');
    });

    it('converts both templateUrl and styleUrl together', () => {
      const result = transform(`
        import { Component } from '@angular/core';
        @Component({ selector: 'x', templateUrl: './x.html', styleUrl: './x.scss' })
        export class X {}
      `);

      expect(result).toContain("import _jit_tpl_0 from './x.html?raw'");
      expect(result).toContain("import _jit_style_1 from './x.scss?inline'");
      expect(result).toContain('template: _jit_tpl_0');
      expect(result).toContain('styles: [_jit_style_1]');
    });

    it('preserves inline template and styles', () => {
      const result = transform(`
        import { Component } from '@angular/core';
        @Component({ selector: 'x', template: '<p>hi</p>', styles: [':host { color: red }'] })
        export class X {}
      `);

      expect(result).toContain("template: '<p>hi</p>'");
      expect(result).toContain("styles: [':host { color: red }']");
      expect(result).not.toContain('_jit_tpl_');
      expect(result).not.toContain('_jit_style_');
    });
  });

  describe('No AOT Metadata', () => {
    it('does NOT emit ɵcmp', () => {
      const result = transform(`
        import { Component } from '@angular/core';
        @Component({ selector: 'x', template: '<p>{{ title }}</p>' })
        export class X { title = 'hello'; }
      `);

      expect(result).not.toContain('ɵcmp');
      expect(result).not.toContain('ɵɵdefineComponent');
    });

    it('does NOT inject i0 import', () => {
      const result = transform(`
        import { Component } from '@angular/core';
        @Component({ selector: 'x', template: '' })
        export class X {}
      `);

      expect(result).not.toContain('import * as i0');
    });
  });

  describe('Edge Cases', () => {
    it('handles nested components in function scopes', () => {
      const result = transform(`
        import { Component } from '@angular/core';
        function it(desc: string, fn: () => void) {}
        it('test', () => {
          @Component({ selector: 'x', template: '' })
          class TestComponent {}
        });
      `);

      expect(result).toContain('TestComponent.decorators');
    });

    it('generates source map', () => {
      const result = jitTransform(
        `
        import { Component } from '@angular/core';
        @Component({ selector: 'x', template: '' })
        export class X {}
      `,
        'test.ts',
      );

      expect(result.map).toBeDefined();
      expect(result.map.version).toBe(3);
    });

    it('returns unchanged code for non-Angular files', () => {
      const code = `export class PlainClass { value = 42; }`;
      const result = jitTransform(code, 'test.ts');
      expect(result.code).toBe(code);
      expect(result.map).toBeNull();
    });
  });

  describe('ReflectionCapabilities Integration', () => {
    it('produces metadata readable by Angular JIT', async () => {
      const { ɵReflectionCapabilities: ReflectionCapabilities } =
        await import('@angular/core');
      const { Component, Input, Output, Optional } =
        await import('@angular/core');

      // Simulate: the JIT transform output is evaluated and produces a class
      // with static decorators/ctorParameters/propDecorators
      class TestComp {
        title: string = '';
        saved: any;
      }
      (TestComp as any).decorators = [
        {
          type: Component,
          args: [{ selector: 'test', template: '<p>hi</p>' }],
        },
      ];
      (TestComp as any).propDecorators = {
        title: [{ type: Input }],
        saved: [{ type: Output }],
      };

      const reflect = new ReflectionCapabilities();

      // Angular JIT reads class decorators
      const annotations = reflect.annotations(TestComp);
      expect(annotations.length).toBe(1);
      expect(annotations[0].selector).toBe('test');
      expect(annotations[0].template).toBe('<p>hi</p>');

      // Angular JIT reads property decorators
      const props = reflect.propMetadata(TestComp);
      expect(props['title']).toBeDefined();
      expect(props['saved']).toBeDefined();
    });

    it('produces ctorParameters readable by Angular JIT', async () => {
      const { ɵReflectionCapabilities: ReflectionCapabilities } =
        await import('@angular/core');
      const { Injectable, Optional } = await import('@angular/core');

      class MyService {}
      class TestComp {}
      (TestComp as any).decorators = [{ type: Injectable }];
      (TestComp as any).ctorParameters = () => [
        { type: MyService, decorators: [{ type: Optional }] },
      ];

      const reflect = new ReflectionCapabilities();
      const params = reflect.parameters(TestComp);
      expect(params.length).toBe(1);
      expect(params[0].length).toBe(2); // [type, decorator]
    });
  });
});
