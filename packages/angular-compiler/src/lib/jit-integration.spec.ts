import { describe, it, expect } from 'vitest';
import { jitTransform } from './jit-transform';

describe('JIT transform preserves @Injectable', () => {
  it('keeps @Injectable decorator for providedIn registration', () => {
    const result = jitTransform(
      `
      import { Injectable } from '@angular/core';

      @Injectable({ providedIn: 'root' })
      export class MyService {
        getValue() { return 42; }
      }
    `,
      'my.service.ts',
    ).code;

    expect(result).toContain('@Injectable');
    expect(result).toContain("providedIn: 'root'");
    // Should NOT emit static decorators array for Injectable
    expect(result).not.toContain('MyService.decorators');
  });

  it('still strips @Component and emits JIT compile call', () => {
    const result = jitTransform(
      `
      import { Component } from '@angular/core';

      @Component({
        selector: 'app-test',
        template: '<p>hello</p>'
      })
      export class TestComponent {}
    `,
      'test.component.ts',
    ).code;

    expect(result).not.toMatch(/@Component/);
    expect(result).toContain('TestComponent.decorators');
    expect(result).toContain('_jitCompileComponent');
  });

  it('handles class with both @Injectable and no other Angular decorators', () => {
    const result = jitTransform(
      `
      import { Injectable, inject } from '@angular/core';
      import { HttpClient } from '@angular/common/http';

      @Injectable({ providedIn: 'root' })
      export class DataService {
        private http = inject(HttpClient);
      }
    `,
      'data.service.ts',
    ).code;

    // @Injectable stays, class is otherwise untouched
    expect(result).toContain('@Injectable');
    expect(result).not.toContain('DataService.decorators');
  });
});

describe('JIT transform ctorParameters via OXC', () => {
  it('emits ctorParameters for constructor params', () => {
    const result = jitTransform(
      `
      import { Component } from '@angular/core';
      import { MyService } from './my.service';

      @Component({ selector: 'app-test', template: '' })
      export class TestComponent {
        constructor(private svc: MyService) {}
      }
    `,
      'test.component.ts',
    ).code;

    // ctorParameters emitted even when type resolves to undefined
    // (type-only detection flags MyService as type-position-only)
    expect(result).toContain('TestComponent.ctorParameters');
  });

  it('emits ctorParameters with parameter decorators', () => {
    const result = jitTransform(
      `
      import { Component, Optional, Inject } from '@angular/core';
      const TOKEN = 'token';

      @Component({ selector: 'app-test', template: '' })
      export class TestComponent {
        constructor(@Optional() svc: string, @Inject(TOKEN) val: string) {}
      }
    `,
      'test.component.ts',
    ).code;

    expect(result).toContain('TestComponent.ctorParameters');
    expect(result).toContain('{type: Optional}');
    expect(result).toContain('{type: Inject, args: [TOKEN]}');
  });

  it('skips ctorParameters for parameterless constructors', () => {
    const result = jitTransform(
      `
      import { Component } from '@angular/core';

      @Component({ selector: 'app-test', template: '' })
      export class TestComponent {
        constructor() {}
      }
    `,
      'test.component.ts',
    ).code;

    expect(result).not.toContain('ctorParameters');
  });
});

describe('JIT transform propDecorators via OXC', () => {
  it('emits propDecorators for signal input()', () => {
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

    expect(result).toContain('TestComponent.propDecorators');
    expect(result).toContain('name:');
    expect(result).toContain('type: Input');
    expect(result).toContain('isSignal: true');
  });

  it('preserves transform option in input() lowering', () => {
    const result = jitTransform(
      `
      import { Component, input, booleanAttribute } from '@angular/core';

      @Component({ selector: 'app-test', template: '' })
      export class TestComponent {
        disabled = input(false, { transform: booleanAttribute });
      }
    `,
      'test.component.ts',
    ).code;

    expect(result).toContain('TestComponent.propDecorators');
    expect(result).toContain('transform: booleanAttribute');
    expect(result).toContain('isSignal: true');
  });

  it('preserves transform option in input.required() lowering', () => {
    const result = jitTransform(
      `
      import { Component, input, numberAttribute } from '@angular/core';

      @Component({ selector: 'app-test', template: '' })
      export class TestComponent {
        count = input.required({ transform: numberAttribute });
      }
    `,
      'test.component.ts',
    ).code;

    expect(result).toContain('TestComponent.propDecorators');
    expect(result).toContain('transform: numberAttribute');
    expect(result).toContain('required: true');
  });

  it('emits propDecorators for input.required()', () => {
    const result = jitTransform(
      `
      import { Component, input } from '@angular/core';

      @Component({ selector: 'app-test', template: '' })
      export class TestComponent {
        name = input.required<string>();
      }
    `,
      'test.component.ts',
    ).code;

    expect(result).toContain('TestComponent.propDecorators');
    expect(result).toContain('required: true');
  });

  it('emits propDecorators for output()', () => {
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

    expect(result).toContain('TestComponent.propDecorators');
    expect(result).toContain('clicked:');
    expect(result).toContain('type: Output');
  });

  it('emits propDecorators for model()', () => {
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

    expect(result).toContain('TestComponent.propDecorators');
    expect(result).toContain('value:');
    expect(result).toContain('type: Input');
    expect(result).toContain('type: Output');
  });

  it('emits propDecorators for viewChild()', () => {
    const result = jitTransform(
      `
      import { Component, viewChild, ElementRef } from '@angular/core';

      @Component({ selector: 'app-test', template: '<div #box></div>' })
      export class TestComponent {
        box = viewChild<ElementRef>('box');
      }
    `,
      'test.component.ts',
    ).code;

    expect(result).toContain('TestComponent.propDecorators');
    expect(result).toContain('type: ViewChild');
  });

  it('emits propDecorators for @Input decorator', () => {
    const result = jitTransform(
      `
      import { Component, Input } from '@angular/core';

      @Component({ selector: 'app-test', template: '' })
      export class TestComponent {
        @Input() label: string = '';
      }
    `,
      'test.component.ts',
    ).code;

    expect(result).toContain('TestComponent.propDecorators');
    expect(result).toContain('type: Input');
    // The @Input decorator should be removed from the class body
    expect(result).not.toMatch(/@Input\(\)/);
  });
});

describe('JIT transform resource rewriting via OXC', () => {
  it('rewrites templateUrl to ESM import', () => {
    const result = jitTransform(
      `
      import { Component } from '@angular/core';

      @Component({
        selector: 'app-test',
        templateUrl: './test.html'
      })
      export class TestComponent {}
    `,
      'test.component.ts',
    ).code;

    expect(result).toContain("import _jit_tpl_0 from './test.html?raw'");
    expect(result).toContain('template: _jit_tpl_0');
    expect(result).not.toContain('templateUrl');
  });

  it('rewrites styleUrls to ESM imports', () => {
    const result = jitTransform(
      `
      import { Component } from '@angular/core';

      @Component({
        selector: 'app-test',
        template: '',
        styleUrls: ['./test.scss', './extra.css']
      })
      export class TestComponent {}
    `,
      'test.component.ts',
    ).code;

    expect(result).toContain("import _jit_style_0 from './test.scss?inline'");
    expect(result).toContain("import _jit_style_1 from './extra.css?inline'");
    expect(result).toContain('styles: [_jit_style_0, _jit_style_1]');
  });

  it('rewrites styleUrl (singular) to ESM import', () => {
    const result = jitTransform(
      `
      import { Component } from '@angular/core';

      @Component({
        selector: 'app-test',
        template: '',
        styleUrl: './test.scss'
      })
      export class TestComponent {}
    `,
      'test.component.ts',
    ).code;

    expect(result).toContain("import _jit_style_0 from './test.scss?inline'");
    expect(result).toContain('styles: [_jit_style_0]');
  });
});

describe('JIT transform OXC class traversal', () => {
  it('handles exported default class', () => {
    const result = jitTransform(
      `
      import { Component } from '@angular/core';

      @Component({ selector: 'app-test', template: '<p>hi</p>' })
      export default class TestComponent {}
    `,
      'test.component.ts',
    ).code;

    expect(result).toContain('TestComponent.decorators');
    expect(result).toContain('_jitCompileComponent');
  });

  it('handles Directive with JIT compile call', () => {
    const result = jitTransform(
      `
      import { Directive, HostBinding } from '@angular/core';

      @Directive({ selector: '[appHighlight]' })
      export class HighlightDirective {
        @HostBinding('class.active') isActive = true;
      }
    `,
      'highlight.directive.ts',
    ).code;

    expect(result).toContain('HighlightDirective.decorators');
    expect(result).toContain('HighlightDirective.propDecorators');
    expect(result).toContain('type: HostBinding');
    expect(result).toContain('_jitCompileDirective');
  });
});
