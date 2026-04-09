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
});
