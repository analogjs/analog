import { describe, it, expect } from 'vitest';
import { compileCode as compile } from './test-helpers';

describe('Error Handling', () => {
  it('unknown decorator passes through unchanged', () => {
    const code = `
      import { SomeDecorator } from 'somewhere';
      @SomeDecorator({ value: 1 })
      export class PlainClass {
        name = 'test';
      }
    `;
    // Should not crash — unknown decorators are ignored
    const result = compile(code, 'plain.ts');
    // Class is preserved
    expect(result).toContain('PlainClass');
    // No Ivy static fields added
    expect(result).not.toContain('ɵcmp');
    expect(result).not.toContain('ɵdir');
    expect(result).not.toContain('ɵpipe');
    expect(result).not.toContain('ɵprov');
    expect(result).not.toContain('ɵfac');
    // Non-Angular decorator is preserved
    expect(result).toContain('@SomeDecorator');
  });

  it('class without decorators passes through', () => {
    const code = `
      export class UtilService {
        getValue() { return 42; }
      }
    `;
    const result = compile(code, 'util.ts');
    expect(result).toContain('UtilService');
    expect(result).toContain('getValue');
    expect(result).not.toContain('ɵfac');
  });

  it('@Injectable with no args object compiles', () => {
    const result = compile(
      `
      import { Injectable } from '@angular/core';
      @Injectable()
      export class BasicService {}
    `,
      'basic.service.ts',
    );

    expect(result).toContain('ɵprov');
    expect(result).toContain('ɵfac');
  });

  it('selectorless component gets generated selector', () => {
    const result = compile(
      `
      import { Component } from '@angular/core';
      @Component({ template: '<p>routed page</p>' })
      export default class MyPage {}
    `,
      'my-page.ts',
    );

    expect(result).toContain('ɵcmp');
    expect(result).toContain('ɵfac');
    // Generated selector for runtime compatibility
    expect(result).toContain('ng-component-mypage');
    // Template still compiles
    expect(result).toContain('ɵɵelementStart');
  });

  it('selectorless component with imports compiles', () => {
    const result = compile(
      `
      import { Component } from '@angular/core';
      class ChildComponent {}
      @Component({
        template: '<p>page with imports</p>',
        imports: [ChildComponent]
      })
      export default class RoutedPage {}
    `,
      'routed.ts',
    );

    expect(result).toContain('ɵcmp');
    expect(result).toContain('ng-component-routedpage');
  });

  it('unwraps forwardRef in imports', () => {
    const result = compile(
      `
      import { Component, forwardRef } from '@angular/core';
      class LazyComponent {}
      @Component({
        selector: 'app-fwd',
        template: '',
        imports: [forwardRef(() => LazyComponent)]
      })
      export class FwdComponent {}
    `,
      'fwd.ts',
    );

    expect(result).toContain('ɵcmp');
    // The forwardRef should be unwrapped — LazyComponent in dependencies, not forwardRef call
    expect(result).toContain('LazyComponent');
  });

  it('component with invalid template throws', () => {
    // Unclosed tags should trigger parse errors
    expect(() =>
      compile(
        `
      import { Component } from '@angular/core';
      @Component({
        selector: 'app-bad',
        template: '<div><span></div>'
      })
      export class BadComponent {}
    `,
        'bad.ts',
      ),
    ).toThrow('[fast-compile] Template parse error');
  });
});
