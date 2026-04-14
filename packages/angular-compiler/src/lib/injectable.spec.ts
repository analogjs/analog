import { describe, it, expect } from 'vitest';
import { compileCode as compile } from './test-helpers';
import { expectCompiles } from './test-helpers';

describe('@Injectable', () => {
  it('compiles with providedIn root', () => {
    const result = compile(
      `
      import { Injectable } from '@angular/core';
      @Injectable({ providedIn: 'root' })
      export class DataService {}
    `,
      'data.service.ts',
    );

    expectCompiles(result);
    expect(result).toContain('ɵprov');
    expect(result).toContain('ɵfac');
    expect(result).toContain('root');
  });

  it('compiles with providedIn platform', () => {
    const result = compile(
      `
      import { Injectable } from '@angular/core';
      @Injectable({ providedIn: 'platform' })
      export class PlatformService {}
    `,
      'platform.service.ts',
    );

    expectCompiles(result);
    expect(result).toContain('ɵprov');
    expect(result).toContain('platform');
  });

  it('compiles without providedIn (defaults to root)', () => {
    const result = compile(
      `
      import { Injectable } from '@angular/core';
      @Injectable()
      export class ScopedService {}
    `,
      'scoped.service.ts',
    );

    expectCompiles(result);
    expect(result).toContain('ɵprov');
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

describe('Union/intersection type DI parameter rejection', () => {
  it('emits invalidFactory for ambiguous union types', () => {
    const result = compile(
      `
      import { Injectable } from '@angular/core';
      export class A {}
      export class B {}
      @Injectable({ providedIn: 'root' })
      export class Svc {
        constructor(p: A | B) {}
      }
    `,
      's.ts',
    );
    expectCompiles(result);
    expect(result).toContain('ɵɵinvalidFactory');
  });

  it('resolves T | null to T', () => {
    const result = compile(
      `
      import { Injectable } from '@angular/core';
      export class A {}
      @Injectable({ providedIn: 'root' })
      export class Svc {
        constructor(p: A | null) {}
      }
    `,
      's.ts',
    );
    expectCompiles(result);
    // Factory should reference A as the token, not invalidFactory
    expect(result).not.toContain('ɵɵinvalidFactory');
    expect(result).toContain('A');
  });

  it('emits invalidFactory for intersection types', () => {
    const result = compile(
      `
      import { Injectable } from '@angular/core';
      export class A {}
      export class B {}
      @Injectable({ providedIn: 'root' })
      export class Svc {
        constructor(p: A & B) {}
      }
    `,
      's.ts',
    );
    expectCompiles(result);
    expect(result).toContain('ɵɵinvalidFactory');
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
