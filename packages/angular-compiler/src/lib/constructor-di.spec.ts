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
});
