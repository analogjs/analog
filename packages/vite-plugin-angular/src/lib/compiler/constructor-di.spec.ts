import { describe, it, expect } from 'vitest';
import { compileCode as compile, expectCompiles } from './test-helpers';

describe('Constructor DI', () => {
  it('injects constructor dependencies', () => {
    const result = compile(
      `
      import { Component } from '@angular/core';
      class MyService {}
      @Component({ selector: 'x', template: '' })
      export class X { constructor(private svc: MyService) {} }
    `,
      'test.ts',
    );

    expectCompiles(result);
    expect(result).toMatch(/ɵɵ(directive)?[Ii]nject/);
    expect(result).toContain('MyService');
  });

  it('handles @Inject decorator', () => {
    const result = compile(
      `
      import { Component, Inject } from '@angular/core';
      const TOKEN = 'MY_TOKEN';
      @Component({ selector: 'x', template: '' })
      export class X { constructor(@Inject(TOKEN) private val: string) {} }
    `,
      'test.ts',
    );

    expectCompiles(result);
    expect(result).toMatch(/ɵɵ(directive)?[Ii]nject/);
    expect(result).toContain('TOKEN');
  });

  it('handles @Optional decorator', () => {
    const result = compile(
      `
      import { Component, Optional } from '@angular/core';
      class MyService {}
      @Component({ selector: 'x', template: '' })
      export class X { constructor(@Optional() private svc: MyService) {} }
    `,
      'test.ts',
    );

    expectCompiles(result);
    expect(result).toMatch(/ɵɵ(directive)?[Ii]nject/);
  });

  it('handles zero-arg constructor', () => {
    const result = compile(
      `
      import { Component } from '@angular/core';
      @Component({ selector: 'x', template: '' })
      export class X { constructor() {} }
    `,
      'test.ts',
    );

    expectCompiles(result);
    expect(result).toContain('ɵfac');
  });

  it('handles class without constructor', () => {
    const result = compile(
      `
      import { Component } from '@angular/core';
      @Component({ selector: 'x', template: '' })
      export class X {}
    `,
      'test.ts',
    );

    expectCompiles(result);
    expect(result).toContain('ɵfac');
  });

  it('handles inherited class without constructor', () => {
    const result = compile(
      `
      import { Component } from '@angular/core';
      class Base {}
      @Component({ selector: 'x', template: '' })
      export class X extends Base {}
    `,
      'test.ts',
    );

    expectCompiles(result);
    expect(result).toContain('ɵɵgetInheritedFactory');
  });

  it('handles union type params (Service | null)', () => {
    const result = compile(
      `
      import { Component, Optional } from '@angular/core';
      class MyService {}
      @Component({ selector: 'x', template: '' })
      export class X { constructor(@Optional() private svc: MyService | null) {} }
    `,
      'test.ts',
    );

    expectCompiles(result);
    expect(result).toMatch(/ɵɵ(directive)?[Ii]nject/);
    expect(result).toContain('MyService');
  });

  it('handles multiple constructor params', () => {
    const result = compile(
      `
      import { Component } from '@angular/core';
      class ServiceA {}
      class ServiceB {}
      @Component({ selector: 'x', template: '' })
      export class X { constructor(private a: ServiceA, private b: ServiceB) {} }
    `,
      'test.ts',
    );

    expectCompiles(result);
    expect(result).toContain('ServiceA');
    expect(result).toContain('ServiceB');
  });

  it('emits invalidFactory for `import type` token (cannot be used as DI)', () => {
    // `import type { X }` is erased at runtime, so X cannot serve as a DI
    // token. The compiler must surface ɵɵinvalidFactory() at this site
    // rather than emitting a broken ɵɵdirectiveInject(X) that would throw
    // ReferenceError in the browser.
    const result = compile(
      `
      import { Component } from '@angular/core';
      import type { MyService } from './my-service';
      @Component({ selector: 'x', template: '' })
      export class X { constructor(private svc: MyService) {} }
    `,
      'test.ts',
    );

    expectCompiles(result);
    expect(result).toContain('ɵɵinvalidFactory');
    expect(result).not.toMatch(/ɵɵdirectiveInject\(MyService\)/);
  });

  it('emits invalidFactory for specifier-level `import { type X }` token', () => {
    const result = compile(
      `
      import { Component } from '@angular/core';
      import { type Helper, util } from './helpers';
      @Component({ selector: 'x', template: '' })
      export class X {
        v = util();
        constructor(private h: Helper) {}
      }
    `,
      'test.ts',
    );

    expectCompiles(result);
    expect(result).toContain('ɵɵinvalidFactory');
    // util is a runtime value, should still be preserved
    expect(result).toContain('util');
  });

  it('injects the attribute name for @Attribute with a string literal', () => {
    const result = compile(
      `
      import { Directive, Attribute } from '@angular/core';
      @Directive({ selector: '[x]' })
      export class X { constructor(@Attribute('name') n: string) {} }
    `,
      'test.ts',
    );

    expectCompiles(result);
    // The attribute name must reach the factory, not be dropped to null.
    expect(result).toMatch(/ɵɵinjectAttribute\(\s*["']name["']\s*\)/);
    expect(result).not.toContain('ɵɵinjectAttribute(null)');
  });

  it('passes a computed @Attribute name through instead of failing', () => {
    const result = compile(
      `
      import { Directive, Attribute } from '@angular/core';
      function attrName() { return 'name'; }
      @Directive({ selector: '[x]' })
      export class X { constructor(@Attribute(attrName()) n: string) {} }
    `,
      'test.ts',
    );

    expectCompiles(result);
    // A non-literal name must not poison the whole factory.
    expect(result).not.toContain('ɵɵinvalidFactory');
    expect(result).toMatch(/ɵɵinjectAttribute\(\s*attrName\(\)\s*\)/);
  });

  it('reads the implementation, not an overload signature, for ctor deps', () => {
    const result = compile(
      `
      import { Injectable, Optional } from '@angular/core';
      class Dep {}
      class OptDep {}
      @Injectable({ providedIn: 'root' })
      export class X {
        constructor(dep: Dep);
        constructor(dep: Dep, @Optional() opt?: OptDep) {}
      }
    `,
      'test.ts',
    );

    expectCompiles(result);
    // Both deps must appear — the overload signature only has one.
    expect(result).toContain('Dep');
    expect(result).toMatch(/ɵɵinject\(\s*OptDep\s*,\s*8\s*\)/);
  });
});
